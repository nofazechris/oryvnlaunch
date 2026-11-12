use crate::curve_math::{
    ONE_TOKEN, ceil_div, quote_buy, quote_sell, spot_price, virtual_quote_for_preset,
    virtual_token_reserve,
};

const SUPPLY: u256 = 800_000_000_000_000_000_000_000_000; // 800M tokens (80% of 1B)
const RAISE: u256 = 1_000_000_000_000_000_000_000; // 1,000 STRK

/// A fresh curve for a preset: (k, quote_reserve, token_reserve).
fn fresh(preset: u8) -> (u256, u256, u256) {
    let x0 = virtual_quote_for_preset(preset, RAISE);
    let y0 = virtual_token_reserve(SUPPLY, x0, RAISE);
    (x0 * y0, x0, y0)
}

fn abs_diff(a: u256, b: u256) -> u256 {
    if a > b {
        a - b
    } else {
        b - a
    }
}

#[test]
fn ceil_div_rounds_up() {
    assert(ceil_div(10, 5) == 2, 'exact');
    assert(ceil_div(11, 5) == 3, 'up');
    assert(ceil_div(1, 5) == 1, 'tiny');
    assert(ceil_div(0, 5) == 0, 'zero');
}

#[test]
fn presets_scale_the_virtual_reserve() {
    assert(virtual_quote_for_preset(0, RAISE) == RAISE, 'gentle = R');
    assert(virtual_quote_for_preset(1, RAISE) == RAISE / 2, 'standard = R/2');
    assert(virtual_quote_for_preset(2, RAISE) == RAISE / 4, 'steep = R/4');
}

#[test]
#[should_panic(expected: "INVALID_PRESET")]
fn unknown_preset_panics() {
    virtual_quote_for_preset(3, RAISE);
}

// Selling the whole curve supply must raise (almost exactly) the graduation raise, for
// every preset. "Almost" = a few wei of rounding, always in the curve's favour.
#[test]
fn full_curve_raises_the_graduation_target() {
    let mut preset: u8 = 0;
    while preset <= 2 {
        let (k, x, y) = fresh(preset);
        let q = quote_buy(k, x, y, SUPPLY, RAISE * 10);
        assert(q.graduates, 'should graduate');
        assert(q.tokens_out == SUPPLY, 'sells whole supply');
        assert(abs_diff(q.quote_spent, RAISE) < 1_000, 'raise within dust');
        preset += 1;
    };
}

// The price multiple from first trade to graduation is 4x / 9x / 25x.
#[test]
fn presets_have_their_documented_price_multiples() {
    let expected: Array<u256> = array![4, 9, 25];
    let mut preset: u8 = 0;
    while preset <= 2 {
        let (k, x, y) = fresh(preset);
        let start = spot_price(x, y);
        let q = quote_buy(k, x, y, SUPPLY, RAISE * 10);
        let end = spot_price(x + q.quote_spent, y - q.tokens_out);
        let multiple_x1000 = end * 1000 / start;
        let want = *expected.at(preset.into()) * 1000;
        // within 0.5%
        assert(abs_diff(multiple_x1000, want) * 200 < want, 'price multiple off');
        preset += 1;
    };
}

#[test]
fn bigger_buys_get_more_tokens_at_a_worse_average_price() {
    let (k, x, y) = fresh(1);
    let small = quote_buy(k, x, y, SUPPLY, 10 * ONE_TOKEN);
    let big = quote_buy(k, x, y, SUPPLY, 100 * ONE_TOKEN);
    assert(big.tokens_out > small.tokens_out, 'more in, more out');
    // tokens per STRK falls as size grows (price impact)
    assert(big.tokens_out * 10 < small.tokens_out * 100, 'price impact');
}

#[test]
fn round_trip_never_profits() {
    let (k, x, y) = fresh(1);
    let spend = 250 * ONE_TOKEN;
    let bought = quote_buy(k, x, y, SUPPLY, spend);
    let x1 = x + bought.quote_spent;
    let y1 = y - bought.tokens_out;
    let back = quote_sell(k, x1, y1, bought.tokens_out);
    assert(back <= spend, 'sell returned more');
    // and the loss is only rounding dust on an immediate round trip
    assert(spend - back < 1_000, 'round trip lost too much');
}

#[test]
fn quotes_are_zero_when_there_is_nothing_to_trade() {
    let (k, x, y) = fresh(0);
    assert(quote_buy(k, x, y, SUPPLY, 0).tokens_out == 0, 'zero in');
    assert(quote_buy(k, x, y, 0, 100).tokens_out == 0, 'sold out');
    assert(quote_sell(k, x, y, 0) == 0, 'sell zero');
}

// Fuzz: after any buy, x * y >= k. This is the property that stops rounding from draining
// the curve.
#[test]
#[fuzzer(runs: 256)]
fn fuzz_buy_keeps_the_invariant(quote_in: u128, preset_seed: u8) {
    let (k, x, y) = fresh(preset_seed % 3);
    let q = quote_buy(k, x, y, SUPPLY, quote_in.into());
    let x1 = x + q.quote_spent;
    let y1 = y - q.tokens_out;
    assert(x1 * y1 >= k, 'invariant broken');
    assert(q.quote_spent <= quote_in.into(), 'overspent');
    assert(q.tokens_out <= SUPPLY, 'oversold');
}

// Fuzz: buy then sell any part of it. The seller never gets back more than was paid, and
// the curve's STRK balance never goes negative.
#[test]
#[fuzzer(runs: 256)]
fn fuzz_sell_never_pays_more_than_the_curve_holds(quote_in: u128, sell_pct: u8) {
    let (k, x, y) = fresh(1);
    let q = quote_buy(k, x, y, SUPPLY, quote_in.into());
    if q.tokens_out == 0 {
        return;
    }
    let x1 = x + q.quote_spent;
    let y1 = y - q.tokens_out;
    let pct: u256 = (sell_pct % 100).into() + 1;
    let tokens_in = q.tokens_out * pct / 100;
    let out = quote_sell(k, x1, y1, tokens_in);
    assert(out <= q.quote_spent, 'paid more than raised');
    assert(x1 - out >= x, 'below virtual reserve');
    if tokens_in == q.tokens_out {
        assert(out <= q.quote_spent, 'full exit profit');
    }
}

// ---------------------------------------------------------------- USDC scale (6 decimals)
//
// The same maths with a raise of 10,000 USDC = 1e10 smallest units. With so few units, a
// rounding error of 1 matters far more than with STRK, so the invariants are re-checked here.

const USDC_RAISE: u256 = 10_000_000_000;

fn fresh_usdc(preset: u8) -> (u256, u256, u256) {
    let x0 = virtual_quote_for_preset(preset, USDC_RAISE);
    let y0 = virtual_token_reserve(SUPPLY, x0, USDC_RAISE);
    (x0 * y0, x0, y0)
}

#[test]
fn usdc_full_curve_raises_the_graduation_target_for_every_preset() {
    let mut preset: u8 = 0;
    while preset <= 2 {
        let (k, x, y) = fresh_usdc(preset);
        let q = quote_buy(k, x, y, SUPPLY, USDC_RAISE * 10);
        assert(q.graduates && q.tokens_out == SUPPLY, 'should sell the whole curve');
        // within 10 units = 0.00001 USDC
        assert(abs_diff(q.quote_spent, USDC_RAISE) <= 10, 'usdc raise off');
        preset += 1;
    };
}

#[test]
fn usdc_spot_price_has_precision_even_when_a_token_costs_a_fraction_of_a_unit() {
    // Standard preset opens at about 4 smallest units per whole token (~$0.000004). The
    // 1e18 scaling in spot_price keeps that from collapsing to an integer.
    let (_, x, y) = fresh_usdc(1);
    let price = spot_price(x, y);
    assert(price > ONE_TOKEN * 4 && price < ONE_TOKEN * 5, 'price should be ~4.17 units');
}

#[test]
#[fuzzer(runs: 256)]
fn fuzz_usdc_buy_keeps_the_invariant(units_in: u64, preset_seed: u8) {
    let (k, x, y) = fresh_usdc(preset_seed % 3);
    let q = quote_buy(k, x, y, SUPPLY, units_in.into());
    let x1 = x + q.quote_spent;
    let y1 = y - q.tokens_out;
    assert(x1 * y1 >= k, 'invariant broken');
    assert(q.quote_spent <= units_in.into(), 'overspent');
    assert(q.tokens_out <= SUPPLY, 'oversold');
}

#[test]
#[fuzzer(runs: 256)]
fn fuzz_usdc_round_trip_never_profits(units_in: u64, sell_pct: u8) {
    let (k, x, y) = fresh_usdc(1);
    let q = quote_buy(k, x, y, SUPPLY, units_in.into());
    if q.tokens_out == 0 {
        return;
    }
    let x1 = x + q.quote_spent;
    let y1 = y - q.tokens_out;
    let pct: u256 = (sell_pct % 100).into() + 1;
    let tokens_in = q.tokens_out * pct / 100;
    let out = quote_sell(k, x1, y1, tokens_in);
    assert(out <= q.quote_spent, 'paid more than raised');
    assert(x1 - out >= x, 'below virtual reserve');
    if tokens_in == q.tokens_out {
        // a full exit loses only rounding dust: at most a few units
        assert(q.quote_spent - out <= 10, 'full exit lost too much');
    }
}

// Bonding-curve maths. Pure functions, no storage, so they can be unit-tested on their own
// and reviewed in one place.
//
// Model: a constant-product curve with a *virtual* STRK reserve.
//
//   x = virtual_strk + strk_raised         (STRK side)
//   y = virtual_tokens - tokens_sold       (token side)
//   x * y >= k   where   k = virtual_strk * virtual_tokens
//
// `virtual_tokens` is chosen so that selling exactly `curve_supply` tokens raises exactly
// `graduation_raise` STRK:
//
//   virtual_tokens = curve_supply * (virtual_strk + graduation_raise) / graduation_raise
//
// A smaller virtual reserve makes the price climb faster. The price multiple from first
// trade to graduation is ((v + R) / v)^2, so with v = R, R/2 and R/4:
//   Gentle 4x, Standard 9x, Steep 25x.
//
// Every division rounds in the curve's favour (the buyer gets slightly fewer tokens, the
// seller slightly less STRK), so x * y never drops below k and the curve cannot be drained
// by rounding.

pub const ONE_TOKEN: u256 = 1_000_000_000_000_000_000;
pub const BPS_DENOMINATOR: u256 = 10_000;

/// Virtual-reserve sizes for the three presets, as a share of the graduation raise.
pub const PRESET_GENTLE_BPS: u256 = 10_000; // v = R
pub const PRESET_STANDARD_BPS: u256 = 5_000; // v = R / 2
pub const PRESET_STEEP_BPS: u256 = 2_500; // v = R / 4

pub fn ceil_div(a: u256, b: u256) -> u256 {
    assert(b > 0, 'MATH_DIV_BY_ZERO');
    let q = a / b;
    if q * b == a {
        q
    } else {
        q + 1
    }
}

/// Virtual STRK reserve for a preset (0 Gentle, 1 Standard, 2 Steep).
pub fn virtual_strk_for_preset(preset: u8, graduation_raise: u256) -> u256 {
    let bps = if preset == 0 {
        PRESET_GENTLE_BPS
    } else if preset == 1 {
        PRESET_STANDARD_BPS
    } else if preset == 2 {
        PRESET_STEEP_BPS
    } else {
        panic!("INVALID_PRESET")
    };
    graduation_raise * bps / BPS_DENOMINATOR
}

/// Virtual token reserve that makes the curve raise `graduation_raise` after selling
/// `curve_supply` tokens.
pub fn virtual_token_reserve(
    curve_supply: u256, virtual_strk: u256, graduation_raise: u256,
) -> u256 {
    assert(virtual_strk > 0, 'MATH_ZERO_VIRTUAL_STRK');
    assert(graduation_raise > 0, 'MATH_ZERO_RAISE');
    ceil_div(curve_supply * (virtual_strk + graduation_raise), graduation_raise)
}

/// Spot price: STRK (wei) per whole token.
pub fn spot_price(strk_reserve: u256, token_reserve: u256) -> u256 {
    strk_reserve * ONE_TOKEN / token_reserve
}

#[derive(Drop, Copy, PartialEq, Debug)]
pub struct BuyQuote {
    pub strk_spent: u256,
    pub tokens_out: u256,
    /// True when this trade sells the last of the curve's tokens.
    pub graduates: bool,
}

/// Quote a buy of up to `max_strk_in`. If the curve would run out of tokens first, the
/// quote is clamped to what is left and `strk_spent` is only what that costs.
pub fn quote_buy(
    k: u256, strk_reserve: u256, token_reserve: u256, tokens_remaining: u256, max_strk_in: u256,
) -> BuyQuote {
    if tokens_remaining == 0 || max_strk_in == 0 {
        return BuyQuote { strk_spent: 0, tokens_out: 0, graduates: false };
    }
    let new_strk_reserve = strk_reserve + max_strk_in;
    let new_token_reserve = ceil_div(k, new_strk_reserve);
    // k / x <= y always holds (x * y >= k), so this cannot underflow.
    let tokens_out = token_reserve - new_token_reserve;

    if tokens_out >= tokens_remaining {
        // Clamp: buy only what is left, and pay only what that costs.
        let end_token_reserve = token_reserve - tokens_remaining;
        let end_strk_reserve = ceil_div(k, end_token_reserve);
        BuyQuote {
            strk_spent: end_strk_reserve - strk_reserve, tokens_out: tokens_remaining, graduates: true,
        }
    } else {
        BuyQuote { strk_spent: max_strk_in, tokens_out, graduates: false }
    }
}

/// STRK paid out for selling `tokens_in`. The caller must have checked
/// `tokens_in <= tokens_sold`, which guarantees the result never exceeds the STRK held.
pub fn quote_sell(k: u256, strk_reserve: u256, token_reserve: u256, tokens_in: u256) -> u256 {
    if tokens_in == 0 {
        return 0;
    }
    let new_token_reserve = token_reserve + tokens_in;
    let new_strk_reserve = ceil_div(k, new_token_reserve);
    if strk_reserve > new_strk_reserve {
        strk_reserve - new_strk_reserve
    } else {
        0
    }
}

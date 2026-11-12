// Bonding-curve maths. Pure functions, no storage, so they can be unit-tested on their own
// and reviewed in one place.
//
// Model: a constant-product curve with a *virtual* quote-asset reserve.
//
//   x = virtual_quote + quote_raised       (quote-asset side: STRK or USDC)
//   y = virtual_tokens - tokens_sold       (token side)
//   x * y >= k   where   k = virtual_quote * virtual_tokens
//
// `virtual_tokens` is chosen so that selling exactly `curve_supply` tokens raises exactly
// `graduation_raise` of the quote asset:
//
//   virtual_tokens = curve_supply * (virtual_quote + graduation_raise) / graduation_raise
//
// Nothing here knows which asset the quote side is. Amounts are in the quote asset's smallest
// unit (wei for STRK, 1e-6 for USDC), so the same maths serves both.
//
// A smaller virtual reserve makes the price climb faster. The price multiple from first
// trade to graduation is ((v + R) / v)^2, so with v = R, R/2 and R/4:
//   Gentle 4x, Standard 9x, Steep 25x.
//
// Every division rounds in the curve's favour (the buyer gets slightly fewer tokens, the
// seller slightly less of the quote asset), so x * y never drops below k and the curve cannot be drained
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

/// Virtual quote reserve for a preset (0 Gentle, 1 Standard, 2 Steep).
pub fn virtual_quote_for_preset(preset: u8, graduation_raise: u256) -> u256 {
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
    curve_supply: u256, virtual_quote: u256, graduation_raise: u256,
) -> u256 {
    assert(virtual_quote > 0, 'MATH_ZERO_VIRTUAL_QUOTE');
    assert(graduation_raise > 0, 'MATH_ZERO_RAISE');
    ceil_div(curve_supply * (virtual_quote + graduation_raise), graduation_raise)
}

/// Spot price: smallest quote units per whole token, scaled by 1e18.
/// The extra 1e18 keeps precision for 6-decimal assets like USDC, where one whole token can
/// cost a fraction of one smallest unit. Divide by 1e18 * 10^quote_decimals for a human price.
pub fn spot_price(quote_reserve: u256, token_reserve: u256) -> u256 {
    quote_reserve * ONE_TOKEN * ONE_TOKEN / token_reserve
}

#[derive(Drop, Copy, PartialEq, Debug)]
pub struct BuyQuote {
    pub quote_spent: u256,
    pub tokens_out: u256,
    /// True when this trade sells the last of the curve's tokens.
    pub graduates: bool,
}

/// Quote a buy of up to `max_quote_in`. If the curve would run out of tokens first, the
/// quote is clamped to what is left and `quote_spent` is only what that costs.
pub fn quote_buy(
    k: u256, quote_reserve: u256, token_reserve: u256, tokens_remaining: u256, max_quote_in: u256,
) -> BuyQuote {
    if tokens_remaining == 0 || max_quote_in == 0 {
        return BuyQuote { quote_spent: 0, tokens_out: 0, graduates: false };
    }
    let new_quote_reserve = quote_reserve + max_quote_in;
    let new_token_reserve = ceil_div(k, new_quote_reserve);
    // k / x <= y always holds (x * y >= k), so this cannot underflow.
    let tokens_out = token_reserve - new_token_reserve;

    if tokens_out >= tokens_remaining {
        // Clamp: buy only what is left, and pay only what that costs.
        let end_token_reserve = token_reserve - tokens_remaining;
        let end_quote_reserve = ceil_div(k, end_token_reserve);
        BuyQuote {
            quote_spent: end_quote_reserve - quote_reserve, tokens_out: tokens_remaining, graduates: true,
        }
    } else {
        BuyQuote { quote_spent: max_quote_in, tokens_out, graduates: false }
    }
}

/// Quote asset paid out for selling `tokens_in`. The caller must have checked
/// `tokens_in <= tokens_sold`, which guarantees the result never exceeds the quote asset held.
pub fn quote_sell(k: u256, quote_reserve: u256, token_reserve: u256, tokens_in: u256) -> u256 {
    if tokens_in == 0 {
        return 0;
    }
    let new_token_reserve = token_reserve + tokens_in;
    let new_quote_reserve = ceil_div(k, new_token_reserve);
    if quote_reserve > new_quote_reserve {
        quote_reserve - new_quote_reserve
    } else {
        0
    }
}

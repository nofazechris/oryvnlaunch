use starknet::{ClassHash, ContractAddress};

/// Everything a client or indexer needs to know about one curve at one moment. Quote amounts
/// are in the quote asset's smallest unit (STRK: 18 decimals, USDC: 6).
#[derive(Drop, Copy, Serde, PartialEq, Debug)]
pub struct CurveState {
    /// Quote reserve used for pricing: virtual reserve + quote actually held.
    pub quote_reserve: u256,
    /// Token reserve used for pricing: virtual reserve - tokens sold.
    pub token_reserve: u256,
    /// Quote asset actually held by the curve (what sellers can be paid from).
    pub quote_raised: u256,
    /// Tokens currently held by buyers via the curve.
    pub tokens_sold: u256,
    /// Total tokens the curve will sell before it graduates.
    pub curve_supply: u256,
    /// Tokens set aside for the pool created after graduation. Locked until then.
    pub reserved_supply: u256,
    pub graduated: bool,
}

/// How the factory treats one quote asset. Each asset has its own deploy fee and graduation
/// raise, because "10 STRK" and "10 USDC" are very different amounts.
#[derive(Drop, Copy, Serde, starknet::Store, PartialEq, Debug)]
pub struct QuoteConfig {
    /// New launches may use this asset only while enabled.
    pub enabled: bool,
    /// Deploy fee, in the quote asset's smallest unit. Paid in that same asset.
    pub deploy_fee: u256,
    /// Amount the curve raises before graduating, in the quote asset's smallest unit.
    pub graduation_raise: u256,
    /// 10^decimals of the quote asset (1e18 for STRK, 1e6 for USDC). Read from the token.
    pub unit: u256,
}

/// Constructor input: a quote asset to enable from day one.
#[derive(Drop, Copy, Serde, PartialEq, Debug)]
pub struct QuoteInit {
    pub token: ContractAddress,
    pub deploy_fee: u256,
    pub graduation_raise: u256,
}

#[starknet::interface]
pub trait IBondingCurve<TContractState> {
    /// Buy tokens with the quote asset. Pulls at most `max_quote_in`; if the curve fills
    /// mid-trade it only pulls what it needs. Reverts if fewer than `min_tokens_out` come back.
    /// Returns (quote_spent, tokens_received).
    fn buy(ref self: TContractState, max_quote_in: u256, min_tokens_out: u256) -> (u256, u256);
    /// Sell tokens back to the curve. Reverts if less than `min_quote_out` is paid.
    /// Still open after graduation. Returns quote_received.
    fn sell(ref self: TContractState, tokens_in: u256, min_quote_out: u256) -> u256;

    /// Preview a buy. Returns (quote_spent, tokens_received, would_graduate).
    fn quote_buy(self: @TContractState, max_quote_in: u256) -> (u256, u256, bool);
    /// Preview a sell. Returns quote_received.
    fn quote_sell(self: @TContractState, tokens_in: u256) -> u256;

    /// Spot price: smallest quote units per whole token, scaled by 1e18.
    fn spot_price(self: @TContractState) -> u256;
    fn get_state(self: @TContractState) -> CurveState;
    fn token(self: @TContractState) -> ContractAddress;
    fn quote_token(self: @TContractState) -> ContractAddress;
    fn creator(self: @TContractState) -> ContractAddress;
}

#[starknet::interface]
pub trait ITokenFactory<TContractState> {
    /// Deploy a token and its curve, paired with `quote_token` (STRK or USDC). Charges that
    /// asset's deploy fee in that asset, so the caller must approve the factory for at least
    /// the fee first. `preset`: 0 = Gentle, 1 = Standard, 2 = Steep. `creator_bps`: share of
    /// supply sent to the creator, in basis points, at most 500 (5%).
    /// Returns (token, curve).
    fn create_launch(
        ref self: TContractState,
        name: ByteArray,
        symbol: ByteArray,
        metadata_uri: ByteArray,
        quote_token: ContractAddress,
        preset: u8,
        creator_bps: u16,
    ) -> (ContractAddress, ContractAddress);

    // Owner-only settings. They only affect launches created after the change; a curve's
    // parameters are fixed at deployment and can never be touched.
    /// Enable (or disable) a quote asset and set its deploy fee and graduation raise. Disabling
    /// stops new launches with that asset; existing curves keep trading.
    fn set_quote_token(
        ref self: TContractState,
        quote_token: ContractAddress,
        enabled: bool,
        deploy_fee: u256,
        graduation_raise: u256,
    );
    fn set_fee_recipient(ref self: TContractState, recipient: ContractAddress);
    fn set_launches_paused(ref self: TContractState, paused: bool);

    fn quote_config(self: @TContractState, quote_token: ContractAddress) -> QuoteConfig;
    fn fee_recipient(self: @TContractState) -> ContractAddress;
    fn launches_paused(self: @TContractState) -> bool;
    fn launch_count(self: @TContractState) -> u64;
    fn curve_of(self: @TContractState, token: ContractAddress) -> ContractAddress;
    fn class_hashes(self: @TContractState) -> (ClassHash, ClassHash);
}

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
    // Fee fields are appended after `graduated` so the positions of the earlier fields never move.
    /// Trading fee in basis points of the curve-side amount (100 = 1%). Fixed for this curve.
    pub trade_fee_bps: u16,
    /// Share of each fee that goes to the creator, in basis points of the fee (5000 = half).
    pub creator_fee_share_bps: u16,
    /// Fees accrued for the creator and not yet claimed. Held by the curve, separate from the reserve.
    pub creator_fees: u256,
    /// Fees accrued for the platform and not yet claimed.
    pub platform_fees: u256,
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

/// A token a creator may pay the deploy fee in. Separate from `QuoteConfig`: paying the fee in an
/// asset does not make it the asset the token trades against.
#[derive(Drop, Copy, Serde, starknet::Store, PartialEq, Debug)]
pub struct FeeAssetConfig {
    pub enabled: bool,
    /// Deploy fee in the asset's smallest unit.
    pub deploy_fee: u256,
    /// 10^decimals of the asset, read from the token.
    pub unit: u256,
}

/// Constructor input: a fee asset to enable from day one.
#[derive(Drop, Copy, Serde, PartialEq, Debug)]
pub struct FeeAssetInit {
    pub token: ContractAddress,
    pub deploy_fee: u256,
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
    /// Buy tokens with the quote asset. `max_quote_in` is the most the buyer will pay IN TOTAL,
    /// trading fee included. If the curve fills mid-trade it only pulls what it needs. Reverts if
    /// fewer than `min_tokens_out` come back. Returns (total_paid_including_fee, tokens_received).
    fn buy(ref self: TContractState, max_quote_in: u256, min_tokens_out: u256) -> (u256, u256);
    /// Sell tokens back to the curve. The seller receives the curve's payout minus the trading
    /// fee; reverts if that is less than `min_quote_out`. Open at all times, including after
    /// graduation. Returns the amount the seller received.
    fn sell(ref self: TContractState, tokens_in: u256, min_quote_out: u256) -> u256;

    /// Pay out the creator's accrued fees to the creator. Anyone may call it; the money can only
    /// go to the creator. Reverts if there is nothing to claim. Returns the amount paid.
    fn claim_creator_fees(ref self: TContractState) -> u256;
    /// Pay out the platform's accrued fees to the factory's current fee recipient. Anyone may call
    /// it. Reverts if there is nothing to claim. Returns the amount paid.
    fn claim_platform_fees(ref self: TContractState) -> u256;

    /// Preview a buy. Returns (total_paid_including_fee, tokens_received, would_sell_out). All
    /// zeros while the curve is sold out.
    fn quote_buy(self: @TContractState, max_quote_in: u256) -> (u256, u256, bool);
    /// Preview a sell. Returns the amount the seller would receive, after the fee.
    fn quote_sell(self: @TContractState, tokens_in: u256) -> u256;

    /// Spot price: smallest quote units per whole token, scaled by 1e18.
    fn spot_price(self: @TContractState) -> u256;
    fn get_state(self: @TContractState) -> CurveState;
    fn token(self: @TContractState) -> ContractAddress;
    fn quote_token(self: @TContractState) -> ContractAddress;
    fn creator(self: @TContractState) -> ContractAddress;
    fn factory(self: @TContractState) -> ContractAddress;
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

    /// Deploy a token whose curve trades against the factory's default quote asset (STRK), with the
    /// deploy fee paid in `fee_token` (STRK or USDC). The fee asset is only how the creator pays: it is
    /// never what the token trades in. The caller must approve the factory for the fee first.
    /// Returns (token, curve).
    fn create_launch_paying_in(
        ref self: TContractState,
        name: ByteArray,
        symbol: ByteArray,
        metadata_uri: ByteArray,
        fee_token: ContractAddress,
        preset: u8,
        creator_bps: u16,
    ) -> (ContractAddress, ContractAddress);

    /// Enable (or disable) an asset for paying the deploy fee, and set its fee. Owner only.
    fn set_fee_asset(
        ref self: TContractState, fee_token: ContractAddress, enabled: bool, deploy_fee: u256,
    );
    fn fee_asset_config(self: @TContractState, fee_token: ContractAddress) -> FeeAssetConfig;
    /// The asset `create_launch_paying_in` curves trade against.
    fn default_quote_token(self: @TContractState) -> ContractAddress;

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
    /// Set the trading fee for FUTURE curves: the fee in basis points of each trade (capped at 300,
    /// which is 3%) and the creator's share of it in basis points of the fee (5000 = half).
    fn set_trade_fee(ref self: TContractState, trade_fee_bps: u16, creator_fee_share_bps: u16);
    fn set_launches_paused(ref self: TContractState, paused: bool);

    fn quote_config(self: @TContractState, quote_token: ContractAddress) -> QuoteConfig;
    fn fee_recipient(self: @TContractState) -> ContractAddress;
    /// (trade_fee_bps, creator_fee_share_bps) that the next launch will get.
    fn trade_fee(self: @TContractState) -> (u16, u16);
    fn launches_paused(self: @TContractState) -> bool;
    fn launch_count(self: @TContractState) -> u64;
    fn curve_of(self: @TContractState, token: ContractAddress) -> ContractAddress;
    fn class_hashes(self: @TContractState) -> (ClassHash, ClassHash);
}

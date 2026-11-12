use starknet::{ClassHash, ContractAddress};

/// Everything a client or indexer needs to know about one curve at one moment.
#[derive(Drop, Copy, Serde, PartialEq, Debug)]
pub struct CurveState {
    /// STRK reserve used for pricing: virtual reserve + STRK actually held.
    pub strk_reserve: u256,
    /// Token reserve used for pricing: virtual reserve - tokens sold.
    pub token_reserve: u256,
    /// STRK actually held by the curve (what sellers can be paid from).
    pub strk_raised: u256,
    /// Tokens currently held by buyers via the curve.
    pub tokens_sold: u256,
    /// Total tokens the curve will sell before it graduates.
    pub curve_supply: u256,
    /// Tokens set aside for the pool created after graduation. Locked until then.
    pub reserved_supply: u256,
    pub graduated: bool,
}

#[starknet::interface]
pub trait IBondingCurve<TContractState> {
    /// Buy tokens with STRK. Pulls at most `max_strk_in`; if the curve fills mid-trade
    /// it only pulls what it needs. Reverts if fewer than `min_tokens_out` come back.
    /// Returns (strk_spent, tokens_received).
    fn buy(ref self: TContractState, max_strk_in: u256, min_tokens_out: u256) -> (u256, u256);
    /// Sell tokens back to the curve. Reverts if less than `min_strk_out` is paid.
    /// Still open after graduation. Returns strk_received.
    fn sell(ref self: TContractState, tokens_in: u256, min_strk_out: u256) -> u256;

    /// Preview a buy. Returns (strk_spent, tokens_received, would_graduate).
    fn quote_buy(self: @TContractState, max_strk_in: u256) -> (u256, u256, bool);
    /// Preview a sell. Returns strk_received.
    fn quote_sell(self: @TContractState, tokens_in: u256) -> u256;

    /// Spot price in STRK (wei) per whole token (1e18 units).
    fn spot_price(self: @TContractState) -> u256;
    fn get_state(self: @TContractState) -> CurveState;
    fn token(self: @TContractState) -> ContractAddress;
    fn creator(self: @TContractState) -> ContractAddress;
}

#[starknet::interface]
pub trait ITokenFactory<TContractState> {
    /// Deploy a token and its curve. Charges the deploy fee in STRK, so the caller must
    /// approve the factory for at least `deploy_fee()` first.
    /// `preset`: 0 = Gentle, 1 = Standard, 2 = Steep. `creator_bps`: share of supply sent
    /// to the creator, in basis points, at most 500 (5%).
    /// Returns (token, curve).
    fn create_launch(
        ref self: TContractState,
        name: ByteArray,
        symbol: ByteArray,
        metadata_uri: ByteArray,
        preset: u8,
        creator_bps: u16,
    ) -> (ContractAddress, ContractAddress);

    // Owner-only settings. They only affect launches created after the change; a curve's
    // parameters are fixed at deployment and can never be touched.
    fn set_deploy_fee(ref self: TContractState, fee: u256);
    fn set_fee_recipient(ref self: TContractState, recipient: ContractAddress);
    fn set_graduation_raise(ref self: TContractState, strk_raise: u256);
    fn set_launches_paused(ref self: TContractState, paused: bool);

    fn deploy_fee(self: @TContractState) -> u256;
    fn fee_recipient(self: @TContractState) -> ContractAddress;
    fn graduation_raise(self: @TContractState) -> u256;
    fn launches_paused(self: @TContractState) -> bool;
    fn launch_count(self: @TContractState) -> u64;
    fn curve_of(self: @TContractState, token: ContractAddress) -> ContractAddress;
    fn strk_token(self: @TContractState) -> ContractAddress;
    fn class_hashes(self: @TContractState) -> (ClassHash, ClassHash);
}

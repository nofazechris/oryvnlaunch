// BondingCurve: one instance per launch. Holds the tokens and the quote asset (STRK or USDC,
// chosen by the creator at launch), prices every trade deterministically on-chain and pays
// out directly to the trader. No owner, no admin keys, no upgrade path: its parameters are
// fixed in the constructor.
//
// Graduation is a milestone, not a lock. When the last of `curve_supply` is bought, `graduated`
// flips to true (once, for good) and `Graduated` is emitted. Trading rules do not change: the
// curve keeps pricing both ways. While every token is sold there is nothing left to buy, so a
// buy reverts with CURVE_SOLD_OUT; the moment a holder sells some back, buying works again.
// Nobody is locked out and nobody is trapped. `reserved_supply` is held here untouched for the
// pool that a later phase will create.
//
// Trading fee: every trade pays a fee (basis points of the curve-side amount, capped at 3%),
// split between the token's creator and the platform. The fee is ACCRUED, not sent: it stays in
// this contract, separate from the curve's reserve, until someone calls a claim function (anyone
// can; the money only ever goes to the creator or to the factory's fee recipient). Trading never
// waits on a fee recipient, so a recipient that cannot receive (for example one an asset issuer
// has blocklisted) cannot block anyone's trade.
//
// The quote asset is an ordinary ERC-20 to this contract. Note that a centrally issued
// asset such as USDC can be paused or blocklisted by its issuer; if that happens, payouts
// in that asset stop with it. The curve cannot work around that.

#[starknet::contract]
pub mod BondingCurve {
    use core::num::traits::Zero;
    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin_security::ReentrancyGuardComponent;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use crate::curve_math;
    use crate::interfaces::{
        CurveState, IBondingCurve, ITokenFactoryDispatcher, ITokenFactoryDispatcherTrait,
    };

    component!(
        path: ReentrancyGuardComponent, storage: reentrancy_guard, event: ReentrancyGuardEvent,
    );
    impl ReentrancyGuardInternalImpl = ReentrancyGuardComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        reentrancy_guard: ReentrancyGuardComponent::Storage,
        token: ContractAddress,
        quote_token: ContractAddress,
        creator: ContractAddress,
        /// The factory that deployed this curve. Only asked, at claim time, who the platform's
        /// fee recipient is. Never involved in a trade.
        factory: ContractAddress,
        curve_supply: u256,
        reserved_supply: u256,
        virtual_quote: u256,
        virtual_tokens: u256,
        k: u256,
        quote_raised: u256,
        tokens_sold: u256,
        graduated: bool,
        trade_fee_bps: u16,
        creator_fee_share_bps: u16,
        creator_fees: u256,
        platform_fees: u256,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        TokensBought: TokensBought,
        TokensSold: TokensSold,
        Graduated: Graduated,
        FeesClaimed: FeesClaimed,
    }

    /// Emitted on every buy. Reserves are the values *after* the trade, so an indexer can
    /// derive price and market cap from the event alone. Quote amounts are in the quote
    /// asset's smallest unit. `quote_in` is the amount that went into the curve; the buyer's
    /// wallet paid `quote_in + fee`.
    #[derive(Drop, starknet::Event)]
    pub struct TokensBought {
        #[key]
        pub buyer: ContractAddress,
        pub quote_in: u256,
        pub fee: u256,
        pub tokens_out: u256,
        pub quote_reserve: u256,
        pub token_reserve: u256,
    }

    /// `quote_out` is the amount that left the curve's reserve; the seller received
    /// `quote_out - fee`.
    #[derive(Drop, starknet::Event)]
    pub struct TokensSold {
        #[key]
        pub seller: ContractAddress,
        pub tokens_in: u256,
        pub quote_out: u256,
        pub fee: u256,
        pub quote_reserve: u256,
        pub token_reserve: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Graduated {
        pub quote_raised: u256,
        pub tokens_sold: u256,
    }

    /// Accrued fees were paid out. `creator` is true for the creator's share, false for the
    /// platform's.
    #[derive(Drop, starknet::Event)]
    pub struct FeesClaimed {
        #[key]
        pub recipient: ContractAddress,
        pub creator: bool,
        pub amount: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        token: ContractAddress,
        quote_token: ContractAddress,
        creator: ContractAddress,
        curve_supply: u256,
        reserved_supply: u256,
        virtual_quote: u256,
        graduation_raise: u256,
        factory: ContractAddress,
        trade_fee_bps: u16,
        creator_fee_share_bps: u16,
    ) {
        assert(token.is_non_zero() && quote_token.is_non_zero(), 'CURVE_ZERO_ADDRESS');
        assert(factory.is_non_zero() && creator.is_non_zero(), 'CURVE_ZERO_ADDRESS');
        assert(token != quote_token, 'CURVE_SAME_ASSET');
        assert(curve_supply > 0, 'CURVE_ZERO_SUPPLY');
        assert(trade_fee_bps <= curve_math::MAX_TRADE_FEE_BPS, 'CURVE_FEE_TOO_HIGH');
        assert(creator_fee_share_bps <= 10_000, 'CURVE_BAD_FEE_SHARE');
        let virtual_tokens = curve_math::virtual_token_reserve(
            curve_supply, virtual_quote, graduation_raise,
        );
        self.token.write(token);
        self.quote_token.write(quote_token);
        self.creator.write(creator);
        self.factory.write(factory);
        self.curve_supply.write(curve_supply);
        self.reserved_supply.write(reserved_supply);
        self.virtual_quote.write(virtual_quote);
        self.virtual_tokens.write(virtual_tokens);
        self.k.write(virtual_quote * virtual_tokens);
        self.trade_fee_bps.write(trade_fee_bps);
        self.creator_fee_share_bps.write(creator_fee_share_bps);
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn reserves(self: @ContractState) -> (u256, u256) {
            (
                self.virtual_quote.read() + self.quote_raised.read(),
                self.virtual_tokens.read() - self.tokens_sold.read(),
            )
        }

        /// Add a trade's fee to what the creator and the platform are owed.
        fn accrue_fee(ref self: ContractState, fee: u256) {
            let (creator_part, platform_part) = curve_math::split_fee(
                fee, self.creator_fee_share_bps.read(),
            );
            self.creator_fees.write(self.creator_fees.read() + creator_part);
            self.platform_fees.write(self.platform_fees.read() + platform_part);
        }
    }

    #[abi(embed_v0)]
    impl BondingCurveImpl of IBondingCurve<ContractState> {
        fn buy(ref self: ContractState, max_quote_in: u256, min_tokens_out: u256) -> (u256, u256) {
            self.reentrancy_guard.start();
            assert(max_quote_in > 0, 'CURVE_ZERO_AMOUNT');

            let (quote_reserve, token_reserve) = self.reserves();
            let remaining = self.curve_supply.read() - self.tokens_sold.read();
            assert(remaining > 0, 'CURVE_SOLD_OUT');

            // `max_quote_in` is the most the buyer will pay IN TOTAL, fee included. Work out the
            // most that can go into the curve once the fee on it is paid.
            let fee_bps = self.trade_fee_bps.read();
            let net_budget = curve_math::net_from_gross(max_quote_in, fee_bps);
            let quote = curve_math::quote_buy(
                self.k.read(), quote_reserve, token_reserve, remaining, net_budget,
            );
            assert(quote.tokens_out > 0, 'CURVE_DUST_TRADE');
            assert(quote.tokens_out >= min_tokens_out, 'CURVE_SLIPPAGE');
            let fee = curve_math::fee_of(quote.quote_spent, fee_bps);
            let total = quote.quote_spent + fee;

            // Effects first, then the external calls.
            let buyer = get_caller_address();
            self.quote_raised.write(self.quote_raised.read() + quote.quote_spent);
            self.tokens_sold.write(self.tokens_sold.read() + quote.tokens_out);
            self.accrue_fee(fee);

            let this = get_contract_address();
            let quote_asset = IERC20Dispatcher { contract_address: self.quote_token.read() };
            let token = IERC20Dispatcher { contract_address: self.token.read() };
            // One pull for the curve amount and the fee together. The fee stays in this contract.
            assert(quote_asset.transfer_from(buyer, this, total), 'CURVE_QUOTE_PULL_FAILED');
            assert(token.transfer(buyer, quote.tokens_out), 'CURVE_TOKEN_SEND_FAILED');

            let (new_quote_reserve, new_token_reserve) = self.reserves();
            self
                .emit(
                    TokensBought {
                        buyer,
                        quote_in: quote.quote_spent,
                        fee,
                        tokens_out: quote.tokens_out,
                        quote_reserve: new_quote_reserve,
                        token_reserve: new_token_reserve,
                    },
                );
            // The milestone is reached once. A curve that sells out again after sells made room
            // does not announce graduation a second time.
            if quote.graduates && !self.graduated.read() {
                self.graduated.write(true);
                self
                    .emit(
                        Graduated {
                            quote_raised: self.quote_raised.read(),
                            tokens_sold: self.tokens_sold.read(),
                        },
                    );
            }

            self.reentrancy_guard.end();
            (total, quote.tokens_out)
        }

        fn sell(ref self: ContractState, tokens_in: u256, min_quote_out: u256) -> u256 {
            self.reentrancy_guard.start();
            assert(tokens_in > 0, 'CURVE_ZERO_AMOUNT');
            // Only tokens that came out of the curve can go back in. This is what keeps the
            // payout from ever exceeding the quote asset the curve holds.
            assert(tokens_in <= self.tokens_sold.read(), 'CURVE_SELL_EXCEEDS_SOLD');

            let (quote_reserve, token_reserve) = self.reserves();
            let gross_out = curve_math::quote_sell(
                self.k.read(), quote_reserve, token_reserve, tokens_in,
            );
            // The curve gives up `gross_out`; the seller gets that minus the fee.
            let fee = curve_math::fee_of(gross_out, self.trade_fee_bps.read());
            assert(gross_out > fee, 'CURVE_DUST_TRADE');
            let net_out = gross_out - fee;
            assert(net_out >= min_quote_out, 'CURVE_SLIPPAGE');

            let seller = get_caller_address();
            self.tokens_sold.write(self.tokens_sold.read() - tokens_in);
            self.quote_raised.write(self.quote_raised.read() - gross_out);
            self.accrue_fee(fee);

            let this = get_contract_address();
            let quote_asset = IERC20Dispatcher { contract_address: self.quote_token.read() };
            let token = IERC20Dispatcher { contract_address: self.token.read() };
            assert(token.transfer_from(seller, this, tokens_in), 'CURVE_TOKEN_PULL_FAILED');
            assert(quote_asset.transfer(seller, net_out), 'CURVE_QUOTE_SEND_FAILED');

            let (new_quote_reserve, new_token_reserve) = self.reserves();
            self
                .emit(
                    TokensSold {
                        seller,
                        tokens_in,
                        quote_out: gross_out,
                        fee,
                        quote_reserve: new_quote_reserve,
                        token_reserve: new_token_reserve,
                    },
                );

            self.reentrancy_guard.end();
            net_out
        }

        fn claim_creator_fees(ref self: ContractState) -> u256 {
            self.reentrancy_guard.start();
            let amount = self.creator_fees.read();
            assert(amount > 0, 'CURVE_NO_FEES');
            self.creator_fees.write(0);
            let creator = self.creator.read();
            let quote_asset = IERC20Dispatcher { contract_address: self.quote_token.read() };
            assert(quote_asset.transfer(creator, amount), 'CURVE_FEE_SEND_FAILED');
            self.emit(FeesClaimed { recipient: creator, creator: true, amount });
            self.reentrancy_guard.end();
            amount
        }

        fn claim_platform_fees(ref self: ContractState) -> u256 {
            self.reentrancy_guard.start();
            let amount = self.platform_fees.read();
            assert(amount > 0, 'CURVE_NO_FEES');
            self.platform_fees.write(0);
            // Asked now, not at deploy: the platform can move its treasury and every curve follows.
            let recipient = ITokenFactoryDispatcher { contract_address: self.factory.read() }
                .fee_recipient();
            let quote_asset = IERC20Dispatcher { contract_address: self.quote_token.read() };
            assert(quote_asset.transfer(recipient, amount), 'CURVE_FEE_SEND_FAILED');
            self.emit(FeesClaimed { recipient, creator: false, amount });
            self.reentrancy_guard.end();
            amount
        }

        fn quote_buy(self: @ContractState, max_quote_in: u256) -> (u256, u256, bool) {
            let (quote_reserve, token_reserve) = self.reserves();
            let remaining = self.curve_supply.read() - self.tokens_sold.read();
            let fee_bps = self.trade_fee_bps.read();
            let net_budget = curve_math::net_from_gross(max_quote_in, fee_bps);
            let q = curve_math::quote_buy(
                self.k.read(), quote_reserve, token_reserve, remaining, net_budget,
            );
            // Total the buyer would pay: the curve amount plus its fee.
            (q.quote_spent + curve_math::fee_of(q.quote_spent, fee_bps), q.tokens_out, q.graduates)
        }

        fn quote_sell(self: @ContractState, tokens_in: u256) -> u256 {
            if tokens_in > self.tokens_sold.read() {
                return 0;
            }
            let (quote_reserve, token_reserve) = self.reserves();
            let gross = curve_math::quote_sell(self.k.read(), quote_reserve, token_reserve, tokens_in);
            let fee = curve_math::fee_of(gross, self.trade_fee_bps.read());
            // What the seller would actually receive.
            if gross > fee {
                gross - fee
            } else {
                0
            }
        }

        fn spot_price(self: @ContractState) -> u256 {
            let (quote_reserve, token_reserve) = self.reserves();
            curve_math::spot_price(quote_reserve, token_reserve)
        }

        fn get_state(self: @ContractState) -> CurveState {
            let (quote_reserve, token_reserve) = self.reserves();
            CurveState {
                quote_reserve,
                token_reserve,
                quote_raised: self.quote_raised.read(),
                tokens_sold: self.tokens_sold.read(),
                curve_supply: self.curve_supply.read(),
                reserved_supply: self.reserved_supply.read(),
                graduated: self.graduated.read(),
                trade_fee_bps: self.trade_fee_bps.read(),
                creator_fee_share_bps: self.creator_fee_share_bps.read(),
                creator_fees: self.creator_fees.read(),
                platform_fees: self.platform_fees.read(),
            }
        }

        fn token(self: @ContractState) -> ContractAddress {
            self.token.read()
        }

        fn quote_token(self: @ContractState) -> ContractAddress {
            self.quote_token.read()
        }

        fn creator(self: @ContractState) -> ContractAddress {
            self.creator.read()
        }

        fn factory(self: @ContractState) -> ContractAddress {
            self.factory.read()
        }
    }
}

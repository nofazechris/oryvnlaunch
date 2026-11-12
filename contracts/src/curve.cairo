// BondingCurve: one instance per launch. Holds the tokens and the quote asset (STRK or USDC,
// chosen by the creator at launch), prices every trade deterministically on-chain and pays
// out directly to the trader. No owner, no admin keys, no upgrade path: its parameters are
// fixed in the constructor.
//
// Graduation: when the last of `curve_supply` is bought, `graduated` flips to true and
// buying stops. Selling stays open (a holder can always exit). `reserved_supply` is held
// here untouched for the pool that is created after graduation (a later phase).
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
    use crate::interfaces::{CurveState, IBondingCurve};

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
        curve_supply: u256,
        reserved_supply: u256,
        virtual_quote: u256,
        virtual_tokens: u256,
        k: u256,
        quote_raised: u256,
        tokens_sold: u256,
        graduated: bool,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        ReentrancyGuardEvent: ReentrancyGuardComponent::Event,
        TokensBought: TokensBought,
        TokensSold: TokensSold,
        Graduated: Graduated,
    }

    /// Emitted on every buy. Reserves are the values *after* the trade, so an indexer can
    /// derive price and market cap from the event alone. Quote amounts are in the quote
    /// asset's smallest unit.
    #[derive(Drop, starknet::Event)]
    pub struct TokensBought {
        #[key]
        pub buyer: ContractAddress,
        pub quote_in: u256,
        pub tokens_out: u256,
        pub quote_reserve: u256,
        pub token_reserve: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TokensSold {
        #[key]
        pub seller: ContractAddress,
        pub tokens_in: u256,
        pub quote_out: u256,
        pub quote_reserve: u256,
        pub token_reserve: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Graduated {
        pub quote_raised: u256,
        pub tokens_sold: u256,
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
    ) {
        assert(token.is_non_zero() && quote_token.is_non_zero(), 'CURVE_ZERO_ADDRESS');
        assert(token != quote_token, 'CURVE_SAME_ASSET');
        assert(curve_supply > 0, 'CURVE_ZERO_SUPPLY');
        let virtual_tokens = curve_math::virtual_token_reserve(
            curve_supply, virtual_quote, graduation_raise,
        );
        self.token.write(token);
        self.quote_token.write(quote_token);
        self.creator.write(creator);
        self.curve_supply.write(curve_supply);
        self.reserved_supply.write(reserved_supply);
        self.virtual_quote.write(virtual_quote);
        self.virtual_tokens.write(virtual_tokens);
        self.k.write(virtual_quote * virtual_tokens);
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn reserves(self: @ContractState) -> (u256, u256) {
            (
                self.virtual_quote.read() + self.quote_raised.read(),
                self.virtual_tokens.read() - self.tokens_sold.read(),
            )
        }
    }

    #[abi(embed_v0)]
    impl BondingCurveImpl of IBondingCurve<ContractState> {
        fn buy(ref self: ContractState, max_quote_in: u256, min_tokens_out: u256) -> (u256, u256) {
            self.reentrancy_guard.start();
            assert(!self.graduated.read(), 'CURVE_GRADUATED');
            assert(max_quote_in > 0, 'CURVE_ZERO_AMOUNT');

            let (quote_reserve, token_reserve) = self.reserves();
            let remaining = self.curve_supply.read() - self.tokens_sold.read();
            let quote = curve_math::quote_buy(
                self.k.read(), quote_reserve, token_reserve, remaining, max_quote_in,
            );
            assert(quote.tokens_out > 0, 'CURVE_DUST_TRADE');
            assert(quote.tokens_out >= min_tokens_out, 'CURVE_SLIPPAGE');

            // Effects first, then the external calls.
            let buyer = get_caller_address();
            self.quote_raised.write(self.quote_raised.read() + quote.quote_spent);
            self.tokens_sold.write(self.tokens_sold.read() + quote.tokens_out);

            let this = get_contract_address();
            let quote_asset = IERC20Dispatcher { contract_address: self.quote_token.read() };
            let token = IERC20Dispatcher { contract_address: self.token.read() };
            assert(
                quote_asset.transfer_from(buyer, this, quote.quote_spent), 'CURVE_QUOTE_PULL_FAILED',
            );
            assert(token.transfer(buyer, quote.tokens_out), 'CURVE_TOKEN_SEND_FAILED');

            let (new_quote_reserve, new_token_reserve) = self.reserves();
            self
                .emit(
                    TokensBought {
                        buyer,
                        quote_in: quote.quote_spent,
                        tokens_out: quote.tokens_out,
                        quote_reserve: new_quote_reserve,
                        token_reserve: new_token_reserve,
                    },
                );
            if quote.graduates {
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
            (quote.quote_spent, quote.tokens_out)
        }

        fn sell(ref self: ContractState, tokens_in: u256, min_quote_out: u256) -> u256 {
            self.reentrancy_guard.start();
            assert(tokens_in > 0, 'CURVE_ZERO_AMOUNT');
            // Only tokens that came out of the curve can go back in. This is what keeps the
            // payout from ever exceeding the quote asset the curve holds.
            assert(tokens_in <= self.tokens_sold.read(), 'CURVE_SELL_EXCEEDS_SOLD');

            let (quote_reserve, token_reserve) = self.reserves();
            let quote_out = curve_math::quote_sell(
                self.k.read(), quote_reserve, token_reserve, tokens_in,
            );
            assert(quote_out > 0, 'CURVE_DUST_TRADE');
            assert(quote_out >= min_quote_out, 'CURVE_SLIPPAGE');

            let seller = get_caller_address();
            self.tokens_sold.write(self.tokens_sold.read() - tokens_in);
            self.quote_raised.write(self.quote_raised.read() - quote_out);

            let this = get_contract_address();
            let quote_asset = IERC20Dispatcher { contract_address: self.quote_token.read() };
            let token = IERC20Dispatcher { contract_address: self.token.read() };
            assert(token.transfer_from(seller, this, tokens_in), 'CURVE_TOKEN_PULL_FAILED');
            assert(quote_asset.transfer(seller, quote_out), 'CURVE_QUOTE_SEND_FAILED');

            let (new_quote_reserve, new_token_reserve) = self.reserves();
            self
                .emit(
                    TokensSold {
                        seller,
                        tokens_in,
                        quote_out,
                        quote_reserve: new_quote_reserve,
                        token_reserve: new_token_reserve,
                    },
                );

            self.reentrancy_guard.end();
            quote_out
        }

        fn quote_buy(self: @ContractState, max_quote_in: u256) -> (u256, u256, bool) {
            if self.graduated.read() {
                return (0, 0, false);
            }
            let (quote_reserve, token_reserve) = self.reserves();
            let remaining = self.curve_supply.read() - self.tokens_sold.read();
            let q = curve_math::quote_buy(
                self.k.read(), quote_reserve, token_reserve, remaining, max_quote_in,
            );
            (q.quote_spent, q.tokens_out, q.graduates)
        }

        fn quote_sell(self: @ContractState, tokens_in: u256) -> u256 {
            if tokens_in > self.tokens_sold.read() {
                return 0;
            }
            let (quote_reserve, token_reserve) = self.reserves();
            curve_math::quote_sell(self.k.read(), quote_reserve, token_reserve, tokens_in)
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
    }
}

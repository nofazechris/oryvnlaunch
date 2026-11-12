// BondingCurve: one instance per launch. Holds the tokens and the STRK, prices every trade
// deterministically on-chain and pays out directly to the trader. No owner, no admin keys,
// no upgrade path: its parameters are fixed in the constructor.
//
// Graduation: when the last of `curve_supply` is bought, `graduated` flips to true and
// buying stops. Selling stays open (a holder can always exit). `reserved_supply` is held
// here untouched for the pool that is created after graduation (a later phase).

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
        strk: ContractAddress,
        creator: ContractAddress,
        curve_supply: u256,
        reserved_supply: u256,
        virtual_strk: u256,
        virtual_tokens: u256,
        k: u256,
        strk_raised: u256,
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
    /// derive price and market cap from the event alone.
    #[derive(Drop, starknet::Event)]
    pub struct TokensBought {
        #[key]
        pub buyer: ContractAddress,
        pub strk_in: u256,
        pub tokens_out: u256,
        pub strk_reserve: u256,
        pub token_reserve: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TokensSold {
        #[key]
        pub seller: ContractAddress,
        pub tokens_in: u256,
        pub strk_out: u256,
        pub strk_reserve: u256,
        pub token_reserve: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct Graduated {
        pub strk_raised: u256,
        pub tokens_sold: u256,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        token: ContractAddress,
        strk: ContractAddress,
        creator: ContractAddress,
        curve_supply: u256,
        reserved_supply: u256,
        virtual_strk: u256,
        graduation_raise: u256,
    ) {
        assert(token.is_non_zero() && strk.is_non_zero(), 'CURVE_ZERO_ADDRESS');
        assert(curve_supply > 0, 'CURVE_ZERO_SUPPLY');
        let virtual_tokens = curve_math::virtual_token_reserve(
            curve_supply, virtual_strk, graduation_raise,
        );
        self.token.write(token);
        self.strk.write(strk);
        self.creator.write(creator);
        self.curve_supply.write(curve_supply);
        self.reserved_supply.write(reserved_supply);
        self.virtual_strk.write(virtual_strk);
        self.virtual_tokens.write(virtual_tokens);
        self.k.write(virtual_strk * virtual_tokens);
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn reserves(self: @ContractState) -> (u256, u256) {
            (
                self.virtual_strk.read() + self.strk_raised.read(),
                self.virtual_tokens.read() - self.tokens_sold.read(),
            )
        }
    }

    #[abi(embed_v0)]
    impl BondingCurveImpl of IBondingCurve<ContractState> {
        fn buy(ref self: ContractState, max_strk_in: u256, min_tokens_out: u256) -> (u256, u256) {
            self.reentrancy_guard.start();
            assert(!self.graduated.read(), 'CURVE_GRADUATED');
            assert(max_strk_in > 0, 'CURVE_ZERO_AMOUNT');

            let (strk_reserve, token_reserve) = self.reserves();
            let remaining = self.curve_supply.read() - self.tokens_sold.read();
            let quote = curve_math::quote_buy(
                self.k.read(), strk_reserve, token_reserve, remaining, max_strk_in,
            );
            assert(quote.tokens_out > 0, 'CURVE_DUST_TRADE');
            assert(quote.tokens_out >= min_tokens_out, 'CURVE_SLIPPAGE');

            // Effects first, then the external calls.
            let buyer = get_caller_address();
            self.strk_raised.write(self.strk_raised.read() + quote.strk_spent);
            self.tokens_sold.write(self.tokens_sold.read() + quote.tokens_out);

            let this = get_contract_address();
            let strk = IERC20Dispatcher { contract_address: self.strk.read() };
            let token = IERC20Dispatcher { contract_address: self.token.read() };
            assert(strk.transfer_from(buyer, this, quote.strk_spent), 'CURVE_STRK_PULL_FAILED');
            assert(token.transfer(buyer, quote.tokens_out), 'CURVE_TOKEN_SEND_FAILED');

            let (new_strk_reserve, new_token_reserve) = self.reserves();
            self
                .emit(
                    TokensBought {
                        buyer,
                        strk_in: quote.strk_spent,
                        tokens_out: quote.tokens_out,
                        strk_reserve: new_strk_reserve,
                        token_reserve: new_token_reserve,
                    },
                );
            if quote.graduates {
                self.graduated.write(true);
                self
                    .emit(
                        Graduated {
                            strk_raised: self.strk_raised.read(),
                            tokens_sold: self.tokens_sold.read(),
                        },
                    );
            }

            self.reentrancy_guard.end();
            (quote.strk_spent, quote.tokens_out)
        }

        fn sell(ref self: ContractState, tokens_in: u256, min_strk_out: u256) -> u256 {
            self.reentrancy_guard.start();
            assert(tokens_in > 0, 'CURVE_ZERO_AMOUNT');
            // Only tokens that came out of the curve can go back in. This is what keeps the
            // payout from ever exceeding the STRK the curve holds.
            assert(tokens_in <= self.tokens_sold.read(), 'CURVE_SELL_EXCEEDS_SOLD');

            let (strk_reserve, token_reserve) = self.reserves();
            let strk_out = curve_math::quote_sell(self.k.read(), strk_reserve, token_reserve, tokens_in);
            assert(strk_out > 0, 'CURVE_DUST_TRADE');
            assert(strk_out >= min_strk_out, 'CURVE_SLIPPAGE');

            let seller = get_caller_address();
            self.tokens_sold.write(self.tokens_sold.read() - tokens_in);
            self.strk_raised.write(self.strk_raised.read() - strk_out);

            let this = get_contract_address();
            let strk = IERC20Dispatcher { contract_address: self.strk.read() };
            let token = IERC20Dispatcher { contract_address: self.token.read() };
            assert(token.transfer_from(seller, this, tokens_in), 'CURVE_TOKEN_PULL_FAILED');
            assert(strk.transfer(seller, strk_out), 'CURVE_STRK_SEND_FAILED');

            let (new_strk_reserve, new_token_reserve) = self.reserves();
            self
                .emit(
                    TokensSold {
                        seller,
                        tokens_in,
                        strk_out,
                        strk_reserve: new_strk_reserve,
                        token_reserve: new_token_reserve,
                    },
                );

            self.reentrancy_guard.end();
            strk_out
        }

        fn quote_buy(self: @ContractState, max_strk_in: u256) -> (u256, u256, bool) {
            if self.graduated.read() {
                return (0, 0, false);
            }
            let (strk_reserve, token_reserve) = self.reserves();
            let remaining = self.curve_supply.read() - self.tokens_sold.read();
            let q = curve_math::quote_buy(
                self.k.read(), strk_reserve, token_reserve, remaining, max_strk_in,
            );
            (q.strk_spent, q.tokens_out, q.graduates)
        }

        fn quote_sell(self: @ContractState, tokens_in: u256) -> u256 {
            if tokens_in > self.tokens_sold.read() {
                return 0;
            }
            let (strk_reserve, token_reserve) = self.reserves();
            curve_math::quote_sell(self.k.read(), strk_reserve, token_reserve, tokens_in)
        }

        fn spot_price(self: @ContractState) -> u256 {
            let (strk_reserve, token_reserve) = self.reserves();
            curve_math::spot_price(strk_reserve, token_reserve)
        }

        fn get_state(self: @ContractState) -> CurveState {
            let (strk_reserve, token_reserve) = self.reserves();
            CurveState {
                strk_reserve,
                token_reserve,
                strk_raised: self.strk_raised.read(),
                tokens_sold: self.tokens_sold.read(),
                curve_supply: self.curve_supply.read(),
                reserved_supply: self.reserved_supply.read(),
                graduated: self.graduated.read(),
            }
        }

        fn token(self: @ContractState) -> ContractAddress {
            self.token.read()
        }

        fn creator(self: @ContractState) -> ContractAddress {
            self.creator.read()
        }
    }
}

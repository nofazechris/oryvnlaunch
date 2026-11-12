// Test-only stand-in for USDC: same interface as STRK but 6 decimals, which is the property
// that matters for the curve. Never deployed; compiled only under `snforge test`.

#[starknet::contract]
pub mod MockUSDC {
    use openzeppelin_token::erc20::{ERC20Component, ERC20HooksEmptyImpl};
    use starknet::ContractAddress;
    use crate::mock_strk::IMockMint;

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

    /// USDC has 6 decimals, not the default 18.
    pub impl UsdcConfig of ERC20Component::ImmutableConfig {
        const DECIMALS: u8 = 6;
    }

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc20: ERC20Component::Storage,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC20Event: ERC20Component::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.erc20.initializer("USD Coin", "USDC");
    }

    #[abi(embed_v0)]
    impl MockMintImpl of IMockMint<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            self.erc20.mint(to, amount);
        }
    }
}

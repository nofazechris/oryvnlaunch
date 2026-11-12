// Test-only stand-in for the STRK token. Never deployed; compiled only under `snforge test`.

#[starknet::interface]
pub trait IMockMint<TContractState> {
    fn mint(ref self: TContractState, to: starknet::ContractAddress, amount: u256);
}

#[starknet::contract]
pub mod MockSTRK {
    use openzeppelin_token::erc20::{DefaultConfig, ERC20Component, ERC20HooksEmptyImpl};
    use starknet::ContractAddress;

    component!(path: ERC20Component, storage: erc20, event: ERC20Event);

    #[abi(embed_v0)]
    impl ERC20MixinImpl = ERC20Component::ERC20MixinImpl<ContractState>;
    impl ERC20InternalImpl = ERC20Component::InternalImpl<ContractState>;

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
        self.erc20.initializer("Starknet Token", "STRK");
    }

    #[abi(embed_v0)]
    impl MockMintImpl of super::IMockMint<ContractState> {
        fn mint(ref self: ContractState, to: ContractAddress, amount: u256) {
            self.erc20.mint(to, amount);
        }
    }
}

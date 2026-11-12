// TokenFactory: the single entry point for launching. One call deploys a fixed-supply
// token and its bonding curve, collects the deploy fee, and hands every token to its
// rightful holder (curve and creator). The factory ends the transaction holding nothing.
//
// The factory owner can change the deploy fee, the fee recipient, the graduation raise
// and pause *new* launches. None of that can touch a launch that already exists: curves
// and tokens have no owner and no upgrade path, and trading never goes through the factory.

#[starknet::contract]
pub mod TokenFactory {
    use core::num::traits::Zero;
    use openzeppelin_access::ownable::OwnableComponent;
    use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{ClassHash, ContractAddress, SyscallResultTrait, get_caller_address, get_contract_address};
    use crate::curve_math;
    use crate::interfaces::ITokenFactory;

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl OwnableInternalImpl = OwnableComponent::InternalImpl<ContractState>;

    /// Every token has the same fixed supply: 1,000,000,000 with 18 decimals.
    pub const TOTAL_SUPPLY: u256 = 1_000_000_000_000_000_000_000_000_000;
    /// 80% of supply is sold along the curve. The rest is the creator allocation (at most
    /// 5%) plus a reserve held by the curve for the post-graduation pool.
    pub const CURVE_SUPPLY_BPS: u256 = 8_000;
    pub const MAX_CREATOR_BPS: u16 = 500;
    /// Hard ceiling on the deploy fee (100 STRK), so a compromised owner key still cannot
    /// price creators out or turn the fee into a trap.
    pub const MAX_DEPLOY_FEE: u256 = 100_000_000_000_000_000_000;
    pub const MAX_NAME_LEN: u32 = 50;
    pub const MAX_SYMBOL_LEN: u32 = 10;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        strk: ContractAddress,
        fee_recipient: ContractAddress,
        token_class_hash: ClassHash,
        curve_class_hash: ClassHash,
        deploy_fee: u256,
        graduation_raise: u256,
        launches_paused: bool,
        launch_count: u64,
        curve_of: Map<ContractAddress, ContractAddress>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        LaunchCreated: LaunchCreated,
        DeployFeeChanged: DeployFeeChanged,
        FeeRecipientChanged: FeeRecipientChanged,
        GraduationRaiseChanged: GraduationRaiseChanged,
        LaunchesPaused: LaunchesPaused,
    }

    /// Everything the indexer needs to create a launch record, in one event.
    #[derive(Drop, starknet::Event)]
    pub struct LaunchCreated {
        #[key]
        pub creator: ContractAddress,
        #[key]
        pub token: ContractAddress,
        pub curve: ContractAddress,
        pub launch_id: u64,
        pub name: ByteArray,
        pub symbol: ByteArray,
        pub metadata_uri: ByteArray,
        pub preset: u8,
        pub creator_bps: u16,
        pub graduation_raise: u256,
        pub deploy_fee: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct DeployFeeChanged {
        pub old_fee: u256,
        pub new_fee: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct FeeRecipientChanged {
        pub old_recipient: ContractAddress,
        pub new_recipient: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct GraduationRaiseChanged {
        pub old_raise: u256,
        pub new_raise: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LaunchesPaused {
        pub paused: bool,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        strk: ContractAddress,
        fee_recipient: ContractAddress,
        token_class_hash: ClassHash,
        curve_class_hash: ClassHash,
        deploy_fee: u256,
        graduation_raise: u256,
    ) {
        assert(strk.is_non_zero(), 'FACTORY_ZERO_STRK');
        assert(fee_recipient.is_non_zero(), 'FACTORY_ZERO_RECIPIENT');
        assert(deploy_fee <= MAX_DEPLOY_FEE, 'FACTORY_FEE_TOO_HIGH');
        assert(graduation_raise > 0, 'FACTORY_ZERO_RAISE');
        self.ownable.initializer(owner);
        self.strk.write(strk);
        self.fee_recipient.write(fee_recipient);
        self.token_class_hash.write(token_class_hash);
        self.curve_class_hash.write(curve_class_hash);
        self.deploy_fee.write(deploy_fee);
        self.graduation_raise.write(graduation_raise);
    }

    #[abi(embed_v0)]
    impl TokenFactoryImpl of ITokenFactory<ContractState> {
        fn create_launch(
            ref self: ContractState,
            name: ByteArray,
            symbol: ByteArray,
            metadata_uri: ByteArray,
            preset: u8,
            creator_bps: u16,
        ) -> (ContractAddress, ContractAddress) {
            assert(!self.launches_paused.read(), 'FACTORY_LAUNCHES_PAUSED');
            assert(name.len() > 0 && name.len() <= MAX_NAME_LEN, 'FACTORY_BAD_NAME');
            assert(symbol.len() > 0 && symbol.len() <= MAX_SYMBOL_LEN, 'FACTORY_BAD_SYMBOL');
            assert(preset <= 2, 'FACTORY_BAD_PRESET');
            assert(creator_bps <= MAX_CREATOR_BPS, 'FACTORY_CREATOR_CAP');

            let creator = get_caller_address();
            let this = get_contract_address();
            let strk_address = self.strk.read();
            let raise = self.graduation_raise.read();
            let fee = self.deploy_fee.read();
            let launch_id = self.launch_count.read();

            // 1. Deploy fee: straight from the creator to the fee recipient. It never sits
            //    in the factory.
            if fee > 0 {
                let strk = IERC20Dispatcher { contract_address: strk_address };
                assert(
                    strk.transfer_from(creator, self.fee_recipient.read(), fee),
                    'FACTORY_FEE_PULL_FAILED',
                );
            }

            // 2. Token. The whole supply is minted to the factory, then split below.
            let mut token_calldata: Array<felt252> = array![];
            name.serialize(ref token_calldata);
            symbol.serialize(ref token_calldata);
            TOTAL_SUPPLY.serialize(ref token_calldata);
            this.serialize(ref token_calldata);
            let (token_address, _) = deploy_syscall(
                self.token_class_hash.read(), launch_id.into(), token_calldata.span(), false,
            )
                .unwrap_syscall();

            // 3. Curve. Supply split: curve tokens, creator allocation, post-graduation reserve.
            let curve_supply = TOTAL_SUPPLY * CURVE_SUPPLY_BPS / curve_math::BPS_DENOMINATOR;
            let creator_amount = TOTAL_SUPPLY * creator_bps.into() / curve_math::BPS_DENOMINATOR;
            let reserved_supply = TOTAL_SUPPLY - curve_supply - creator_amount;
            let virtual_strk = curve_math::virtual_strk_for_preset(preset, raise);

            let mut curve_calldata: Array<felt252> = array![];
            token_address.serialize(ref curve_calldata);
            strk_address.serialize(ref curve_calldata);
            creator.serialize(ref curve_calldata);
            curve_supply.serialize(ref curve_calldata);
            reserved_supply.serialize(ref curve_calldata);
            virtual_strk.serialize(ref curve_calldata);
            raise.serialize(ref curve_calldata);
            let (curve_address, _) = deploy_syscall(
                self.curve_class_hash.read(), launch_id.into(), curve_calldata.span(), false,
            )
                .unwrap_syscall();

            // 4. Distribute. After this the factory holds zero tokens.
            let token = IERC20Dispatcher { contract_address: token_address };
            assert(token.transfer(curve_address, curve_supply + reserved_supply), 'FACTORY_CURVE_FUND_FAILED');
            if creator_amount > 0 {
                assert(token.transfer(creator, creator_amount), 'FACTORY_CREATOR_SEND_FAILED');
            }

            self.curve_of.write(token_address, curve_address);
            self.launch_count.write(launch_id + 1);
            self
                .emit(
                    LaunchCreated {
                        creator,
                        token: token_address,
                        curve: curve_address,
                        launch_id,
                        name,
                        symbol,
                        metadata_uri,
                        preset,
                        creator_bps,
                        graduation_raise: raise,
                        deploy_fee: fee,
                    },
                );

            (token_address, curve_address)
        }

        fn set_deploy_fee(ref self: ContractState, fee: u256) {
            self.ownable.assert_only_owner();
            assert(fee <= MAX_DEPLOY_FEE, 'FACTORY_FEE_TOO_HIGH');
            let old_fee = self.deploy_fee.read();
            self.deploy_fee.write(fee);
            self.emit(DeployFeeChanged { old_fee, new_fee: fee });
        }

        fn set_fee_recipient(ref self: ContractState, recipient: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(recipient.is_non_zero(), 'FACTORY_ZERO_RECIPIENT');
            let old_recipient = self.fee_recipient.read();
            self.fee_recipient.write(recipient);
            self.emit(FeeRecipientChanged { old_recipient, new_recipient: recipient });
        }

        fn set_graduation_raise(ref self: ContractState, strk_raise: u256) {
            self.ownable.assert_only_owner();
            assert(strk_raise > 0, 'FACTORY_ZERO_RAISE');
            let old_raise = self.graduation_raise.read();
            self.graduation_raise.write(strk_raise);
            self.emit(GraduationRaiseChanged { old_raise, new_raise: strk_raise });
        }

        fn set_launches_paused(ref self: ContractState, paused: bool) {
            self.ownable.assert_only_owner();
            self.launches_paused.write(paused);
            self.emit(LaunchesPaused { paused });
        }

        fn deploy_fee(self: @ContractState) -> u256 {
            self.deploy_fee.read()
        }

        fn fee_recipient(self: @ContractState) -> ContractAddress {
            self.fee_recipient.read()
        }

        fn graduation_raise(self: @ContractState) -> u256 {
            self.graduation_raise.read()
        }

        fn launches_paused(self: @ContractState) -> bool {
            self.launches_paused.read()
        }

        fn launch_count(self: @ContractState) -> u64 {
            self.launch_count.read()
        }

        fn curve_of(self: @ContractState, token: ContractAddress) -> ContractAddress {
            self.curve_of.read(token)
        }

        fn strk_token(self: @ContractState) -> ContractAddress {
            self.strk.read()
        }

        fn class_hashes(self: @ContractState) -> (ClassHash, ClassHash) {
            (self.token_class_hash.read(), self.curve_class_hash.read())
        }
    }
}

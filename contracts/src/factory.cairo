// TokenFactory: the single entry point for launching. One call deploys a fixed-supply
// token and its bonding curve, collects the deploy fee, and hands every token to its
// rightful holder (curve and creator). The factory ends the transaction holding nothing.
//
// A creator picks the *quote asset* for the launch (STRK or USDC today; the owner can enable
// others). The curve is paired with that asset for life: STRK tokens trade in STRK, USDC
// tokens trade in USDC. Each asset has its own deploy fee, paid in that asset, and its own
// graduation raise, because the same number means very different money in each.
//
// The factory owner can enable or disable quote assets, change their fee and raise, change the
// trading fee (capped at 3%), change the fee recipient and pause *new* launches. None of that can touch a launch that already exists:
// curves and tokens have no owner and no upgrade path, and trading never goes through the
// factory.

#[starknet::contract]
pub mod TokenFactory {
    use core::num::traits::Zero;
    use openzeppelin_access::ownable::OwnableComponent;
    use openzeppelin_interfaces::erc20::{
        IERC20Dispatcher, IERC20DispatcherTrait, IERC20MetadataDispatcher,
        IERC20MetadataDispatcherTrait,
    };
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::syscalls::deploy_syscall;
    use starknet::{
        ClassHash, ContractAddress, SyscallResultTrait, get_caller_address, get_contract_address,
    };
    use crate::curve_math;
    use crate::interfaces::{FeeAssetConfig, FeeAssetInit, ITokenFactory, QuoteConfig, QuoteInit};

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
    /// Hard ceiling on any deploy fee: 100 whole units of the quote asset (100 STRK, 100 USDC).
    /// Even a compromised owner key cannot price creators out or turn the fee into a trap.
    pub const MAX_DEPLOY_FEE_UNITS: u256 = 100;
    /// Quote assets must have between 6 and 18 decimals, so the curve keeps enough precision.
    pub const MIN_QUOTE_DECIMALS: u8 = 6;
    pub const MAX_QUOTE_DECIMALS: u8 = 18;
    pub const MAX_NAME_LEN: u32 = 50;
    pub const MAX_SYMBOL_LEN: u32 = 10;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
        fee_recipient: ContractAddress,
        token_class_hash: ClassHash,
        curve_class_hash: ClassHash,
        quotes: Map<ContractAddress, QuoteConfig>,
        fee_assets: Map<ContractAddress, FeeAssetConfig>,
        default_quote_token: ContractAddress,
        launches_paused: bool,
        launch_count: u64,
        curve_of: Map<ContractAddress, ContractAddress>,
        trade_fee_bps: u16,
        creator_fee_share_bps: u16,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
        LaunchCreated: LaunchCreated,
        QuoteTokenSet: QuoteTokenSet,
        FeeAssetSet: FeeAssetSet,
        FeeRecipientChanged: FeeRecipientChanged,
        TradeFeeChanged: TradeFeeChanged,
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
        pub quote_token: ContractAddress,
        pub launch_id: u64,
        pub name: ByteArray,
        pub symbol: ByteArray,
        pub metadata_uri: ByteArray,
        pub preset: u8,
        pub creator_bps: u16,
        pub graduation_raise: u256,
        pub deploy_fee: u256,
        /// The trading fee this curve was created with (fixed for its life), in basis points of each
        /// trade, and the creator's share of it in basis points of the fee.
        pub trade_fee_bps: u16,
        pub creator_fee_share_bps: u16,
        /// The asset the deploy fee was paid in. Equal to `quote_token` for `create_launch`; for
        /// `create_launch_paying_in` it can be a different asset (for example USDC).
        pub fee_token: ContractAddress,
    }

    /// A deploy-fee asset was enabled, disabled or repriced.
    #[derive(Drop, starknet::Event)]
    pub struct FeeAssetSet {
        #[key]
        pub fee_token: ContractAddress,
        pub enabled: bool,
        pub deploy_fee: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct QuoteTokenSet {
        #[key]
        pub quote_token: ContractAddress,
        pub enabled: bool,
        pub deploy_fee: u256,
        pub graduation_raise: u256,
    }

    #[derive(Drop, starknet::Event)]
    pub struct FeeRecipientChanged {
        pub old_recipient: ContractAddress,
        pub new_recipient: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    pub struct TradeFeeChanged {
        pub trade_fee_bps: u16,
        pub creator_fee_share_bps: u16,
    }

    #[derive(Drop, starknet::Event)]
    pub struct LaunchesPaused {
        pub paused: bool,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        owner: ContractAddress,
        fee_recipient: ContractAddress,
        token_class_hash: ClassHash,
        curve_class_hash: ClassHash,
        initial_quotes: Array<QuoteInit>,
        trade_fee_bps: u16,
        creator_fee_share_bps: u16,
        default_quote_token: ContractAddress,
        initial_fee_assets: Array<FeeAssetInit>,
    ) {
        assert(fee_recipient.is_non_zero(), 'FACTORY_ZERO_RECIPIENT');
        assert(trade_fee_bps <= curve_math::MAX_TRADE_FEE_BPS, 'FACTORY_TRADE_FEE_HIGH');
        assert(creator_fee_share_bps <= 10_000, 'FACTORY_BAD_FEE_SHARE');
        self.trade_fee_bps.write(trade_fee_bps);
        self.creator_fee_share_bps.write(creator_fee_share_bps);
        self.ownable.initializer(owner);
        self.fee_recipient.write(fee_recipient);
        self.token_class_hash.write(token_class_hash);
        self.curve_class_hash.write(curve_class_hash);
        for q in initial_quotes {
            self.enable_quote(q.token, q.deploy_fee, q.graduation_raise);
        }
        // The default curve asset must be one we can build a curve for.
        assert(self.quotes.read(default_quote_token).enabled, 'FACTORY_BAD_DEFAULT_QUOTE');
        self.default_quote_token.write(default_quote_token);
        for f in initial_fee_assets {
            self.enable_fee_asset(f.token, f.deploy_fee);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        /// The one place a launch is built. `quote_token` is what the curve trades against;
        /// `fee_token` and `fee` are how the creator pays for it.
        fn launch_with(
            ref self: ContractState,
            name: ByteArray,
            symbol: ByteArray,
            metadata_uri: ByteArray,
            quote_token: ContractAddress,
            fee_token: ContractAddress,
            fee: u256,
            preset: u8,
            creator_bps: u16,
        ) -> (ContractAddress, ContractAddress) {
            assert(!self.launches_paused.read(), 'FACTORY_LAUNCHES_PAUSED');
            assert(name.len() > 0 && name.len() <= MAX_NAME_LEN, 'FACTORY_BAD_NAME');
            assert(symbol.len() > 0 && symbol.len() <= MAX_SYMBOL_LEN, 'FACTORY_BAD_SYMBOL');
            assert(preset <= 2, 'FACTORY_BAD_PRESET');
            assert(creator_bps <= MAX_CREATOR_BPS, 'FACTORY_CREATOR_CAP');
            let config = self.quotes.read(quote_token);
            assert(config.enabled, 'FACTORY_QUOTE_NOT_ALLOWED');

            let creator = get_caller_address();
            let this = get_contract_address();
            let raise = config.graduation_raise;
            let launch_id = self.launch_count.read();

            // 1. Deploy fee: straight from the creator to the fee recipient, in the launch's
            //    fee asset. It never sits in the factory.
            if fee > 0 {
                let fee_asset = IERC20Dispatcher { contract_address: fee_token };
                assert(
                    fee_asset.transfer_from(creator, self.fee_recipient.read(), fee),
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
            let virtual_quote = curve_math::virtual_quote_for_preset(preset, raise);

            let mut curve_calldata: Array<felt252> = array![];
            token_address.serialize(ref curve_calldata);
            quote_token.serialize(ref curve_calldata);
            creator.serialize(ref curve_calldata);
            curve_supply.serialize(ref curve_calldata);
            reserved_supply.serialize(ref curve_calldata);
            virtual_quote.serialize(ref curve_calldata);
            raise.serialize(ref curve_calldata);
            // The curve learns who deployed it (to ask for the fee recipient at claim time) and
            // the fee terms it will keep for life.
            let trade_fee_bps = self.trade_fee_bps.read();
            let creator_fee_share_bps = self.creator_fee_share_bps.read();
            this.serialize(ref curve_calldata);
            trade_fee_bps.serialize(ref curve_calldata);
            creator_fee_share_bps.serialize(ref curve_calldata);
            let (curve_address, _) = deploy_syscall(
                self.curve_class_hash.read(), launch_id.into(), curve_calldata.span(), false,
            )
                .unwrap_syscall();

            // 4. Distribute. After this the factory holds zero tokens.
            let token = IERC20Dispatcher { contract_address: token_address };
            assert(
                token.transfer(curve_address, curve_supply + reserved_supply),
                'FACTORY_CURVE_FUND_FAILED',
            );
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
                        quote_token,
                        launch_id,
                        name,
                        symbol,
                        metadata_uri,
                        preset,
                        creator_bps,
                        graduation_raise: raise,
                        deploy_fee: fee,
                        trade_fee_bps,
                        creator_fee_share_bps,
                        fee_token,
                    },
                );

            (token_address, curve_address)
        }

        /// Validate and store a deploy-fee asset as enabled. Decimals are read from the token so the
        /// "100 whole units" ceiling means the same thing for STRK and USDC.
        fn enable_fee_asset(ref self: ContractState, fee_token: ContractAddress, deploy_fee: u256) {
            assert(fee_token.is_non_zero(), 'FACTORY_ZERO_QUOTE');
            let decimals = IERC20MetadataDispatcher { contract_address: fee_token }.decimals();
            assert(
                decimals >= MIN_QUOTE_DECIMALS && decimals <= MAX_QUOTE_DECIMALS,
                'FACTORY_BAD_DECIMALS',
            );
            let mut unit: u256 = 1;
            let mut i: u8 = 0;
            while i < decimals {
                unit *= 10;
                i += 1;
            };
            assert(deploy_fee <= MAX_DEPLOY_FEE_UNITS * unit, 'FACTORY_FEE_TOO_HIGH');
            self.fee_assets.write(fee_token, FeeAssetConfig { enabled: true, deploy_fee, unit });
            self.emit(FeeAssetSet { fee_token, enabled: true, deploy_fee });
        }

        /// Validate and store a quote asset as enabled. Reads the asset's decimals from the
        /// token itself, so the fee cap is "100 whole units" whatever the asset.
        fn enable_quote(
            ref self: ContractState,
            quote_token: ContractAddress,
            deploy_fee: u256,
            graduation_raise: u256,
        ) {
            assert(quote_token.is_non_zero(), 'FACTORY_ZERO_QUOTE');
            assert(graduation_raise > 0, 'FACTORY_ZERO_RAISE');
            let decimals = IERC20MetadataDispatcher { contract_address: quote_token }.decimals();
            assert(
                decimals >= MIN_QUOTE_DECIMALS && decimals <= MAX_QUOTE_DECIMALS,
                'FACTORY_BAD_DECIMALS',
            );
            let mut unit: u256 = 1;
            let mut i: u8 = 0;
            while i < decimals {
                unit *= 10;
                i += 1;
            };
            assert(deploy_fee <= MAX_DEPLOY_FEE_UNITS * unit, 'FACTORY_FEE_TOO_HIGH');
            self
                .quotes
                .write(quote_token, QuoteConfig { enabled: true, deploy_fee, graduation_raise, unit });
            self.emit(QuoteTokenSet { quote_token, enabled: true, deploy_fee, graduation_raise });
        }
    }

    #[abi(embed_v0)]
    impl TokenFactoryImpl of ITokenFactory<ContractState> {
        fn create_launch(
            ref self: ContractState,
            name: ByteArray,
            symbol: ByteArray,
            metadata_uri: ByteArray,
            quote_token: ContractAddress,
            preset: u8,
            creator_bps: u16,
        ) -> (ContractAddress, ContractAddress) {
            // The original way to launch: the curve trades in `quote_token` and the fee is paid in it too.
            let config = self.quotes.read(quote_token);
            assert(config.enabled, 'FACTORY_QUOTE_NOT_ALLOWED');
            self
                .launch_with(
                    name,
                    symbol,
                    metadata_uri,
                    quote_token,
                    quote_token,
                    config.deploy_fee,
                    preset,
                    creator_bps,
                )
        }

        fn create_launch_paying_in(
            ref self: ContractState,
            name: ByteArray,
            symbol: ByteArray,
            metadata_uri: ByteArray,
            fee_token: ContractAddress,
            preset: u8,
            creator_bps: u16,
        ) -> (ContractAddress, ContractAddress) {
            let fee_config = self.fee_assets.read(fee_token);
            assert(fee_config.enabled, 'FACTORY_FEE_ASSET_NOT_ALLOWED');
            let quote_token = self.default_quote_token.read();
            self
                .launch_with(
                    name,
                    symbol,
                    metadata_uri,
                    quote_token,
                    fee_token,
                    fee_config.deploy_fee,
                    preset,
                    creator_bps,
                )
        }

        fn set_fee_asset(
            ref self: ContractState, fee_token: ContractAddress, enabled: bool, deploy_fee: u256,
        ) {
            self.ownable.assert_only_owner();
            if enabled {
                self.enable_fee_asset(fee_token, deploy_fee);
            } else {
                // Disabling keeps the stored fee and unit; it only stops new launches paid in it.
                let old = self.fee_assets.read(fee_token);
                self.fee_assets.write(fee_token, FeeAssetConfig { enabled: false, ..old });
                self.emit(FeeAssetSet { fee_token, enabled: false, deploy_fee: old.deploy_fee });
            }
        }

        fn fee_asset_config(self: @ContractState, fee_token: ContractAddress) -> FeeAssetConfig {
            self.fee_assets.read(fee_token)
        }

        fn default_quote_token(self: @ContractState) -> ContractAddress {
            self.default_quote_token.read()
        }

        fn set_quote_token(
            ref self: ContractState,
            quote_token: ContractAddress,
            enabled: bool,
            deploy_fee: u256,
            graduation_raise: u256,
        ) {
            self.ownable.assert_only_owner();
            if enabled {
                self.enable_quote(quote_token, deploy_fee, graduation_raise);
            } else {
                // Disabling keeps the stored fee, raise and unit; it only stops new launches.
                let old = self.quotes.read(quote_token);
                self.quotes.write(quote_token, QuoteConfig { enabled: false, ..old });
                self
                    .emit(
                        QuoteTokenSet {
                            quote_token,
                            enabled: false,
                            deploy_fee: old.deploy_fee,
                            graduation_raise: old.graduation_raise,
                        },
                    );
            }
        }

        fn set_fee_recipient(ref self: ContractState, recipient: ContractAddress) {
            self.ownable.assert_only_owner();
            assert(recipient.is_non_zero(), 'FACTORY_ZERO_RECIPIENT');
            let old_recipient = self.fee_recipient.read();
            self.fee_recipient.write(recipient);
            self.emit(FeeRecipientChanged { old_recipient, new_recipient: recipient });
        }

        fn set_trade_fee(ref self: ContractState, trade_fee_bps: u16, creator_fee_share_bps: u16) {
            self.ownable.assert_only_owner();
            // The same ceiling every curve enforces itself, so a bad value fails here, early.
            assert(trade_fee_bps <= curve_math::MAX_TRADE_FEE_BPS, 'FACTORY_TRADE_FEE_HIGH');
            assert(creator_fee_share_bps <= 10_000, 'FACTORY_BAD_FEE_SHARE');
            self.trade_fee_bps.write(trade_fee_bps);
            self.creator_fee_share_bps.write(creator_fee_share_bps);
            self.emit(TradeFeeChanged { trade_fee_bps, creator_fee_share_bps });
        }

        fn set_launches_paused(ref self: ContractState, paused: bool) {
            self.ownable.assert_only_owner();
            self.launches_paused.write(paused);
            self.emit(LaunchesPaused { paused });
        }

        fn quote_config(self: @ContractState, quote_token: ContractAddress) -> QuoteConfig {
            self.quotes.read(quote_token)
        }

        fn fee_recipient(self: @ContractState) -> ContractAddress {
            self.fee_recipient.read()
        }

        fn trade_fee(self: @ContractState) -> (u16, u16) {
            (self.trade_fee_bps.read(), self.creator_fee_share_bps.read())
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

        fn class_hashes(self: @ContractState) -> (ClassHash, ClassHash) {
            (self.token_class_hash.read(), self.curve_class_hash.read())
        }
    }
}

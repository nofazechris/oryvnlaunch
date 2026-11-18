use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpy, EventSpyAssertionsTrait, EventSpyTrait, declare,
    spy_events, start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use crate::curve::BondingCurve;
use crate::factory::TokenFactory;
use crate::factory::TokenFactory::{MAX_DEPLOY_FEE_UNITS, TOTAL_SUPPLY};
use crate::interfaces::{
    IBondingCurveDispatcher, IBondingCurveDispatcherTrait, ITokenFactoryDispatcher,
    ITokenFactoryDispatcherTrait, FeeAssetInit, QuoteInit,
};
use crate::mock_strk::{IMockMintDispatcher, IMockMintDispatcherTrait};

// STRK has 18 decimals, USDC has 6. Every behaviour below is checked against both.
const ONE: u256 = 1_000_000_000_000_000_000; // 1 STRK
const USDC_ONE: u256 = 1_000_000; // 1 USDC

const STRK_RAISE: u256 = 1_000_000_000_000_000_000_000; // 1,000 STRK to graduate
const STRK_FEE: u256 = 10_000_000_000_000_000_000; // 10 STRK deploy fee
const USDC_RAISE: u256 = 10_000_000_000; // 10,000 USDC to graduate
const USDC_FEE: u256 = 15_000_000; // 15 USDC deploy fee (USDC launches cost more)
// Paying the deploy fee with `create_launch_paying_in`: the curve always trades in STRK, and the fee
// can be paid in STRK or USDC. USDC costs far less than the old 15 because it is priced in dollars.
const PAY_STRK_FEE: u256 = 10_000_000_000_000_000_000; // 10 STRK
const PAY_USDC_FEE: u256 = 2_000_000; // 2 USDC
const CURVE_SUPPLY: u256 = 800_000_000_000_000_000_000_000_000; // 80% of 1B

fn OWNER() -> ContractAddress {
    'owner'.try_into().unwrap()
}
fn TREASURY() -> ContractAddress {
    'treasury'.try_into().unwrap()
}
fn CREATOR() -> ContractAddress {
    'creator'.try_into().unwrap()
}
fn ALICE() -> ContractAddress {
    'alice'.try_into().unwrap()
}
fn BOB() -> ContractAddress {
    'bob'.try_into().unwrap()
}

#[derive(Drop, Copy)]
struct Setup {
    strk: IERC20Dispatcher,
    usdc: IERC20Dispatcher,
    factory: ITokenFactoryDispatcher,
}

/// A factory with NO trading fee. Most tests are about the curve's mechanics, and a zero fee keeps
/// their numbers plain. The fee has its own section of tests below, which use `deploy_fee_setup`.
fn deploy_setup() -> Setup {
    deploy_setup_with_fees(0, 0)
}

/// A factory with the production fee: 1% per trade, half to the creator and half to the platform.
fn deploy_fee_setup() -> Setup {
    deploy_setup_with_fees(100, 5_000)
}

fn deploy_setup_with_fees(trade_fee_bps: u16, creator_fee_share_bps: u16) -> Setup {
    let strk_class = declare("MockSTRK").unwrap().contract_class();
    let (strk_address, _) = strk_class.deploy(@array![]).unwrap();
    let usdc_class = declare("MockUSDC").unwrap().contract_class();
    let (usdc_address, _) = usdc_class.deploy(@array![]).unwrap();

    let token_class = *declare("OryvnToken").unwrap().contract_class().class_hash;
    let curve_class = *declare("BondingCurve").unwrap().contract_class().class_hash;
    let factory_class = declare("TokenFactory").unwrap().contract_class();

    // STRK and USDC both enabled from day one, each with its own fee and raise.
    let quotes = array![
        QuoteInit { token: strk_address, deploy_fee: STRK_FEE, graduation_raise: STRK_RAISE },
        QuoteInit { token: usdc_address, deploy_fee: USDC_FEE, graduation_raise: USDC_RAISE },
    ];
    let mut calldata: Array<felt252> = array![];
    OWNER().serialize(ref calldata);
    TREASURY().serialize(ref calldata);
    token_class.serialize(ref calldata);
    curve_class.serialize(ref calldata);
    quotes.serialize(ref calldata);
    trade_fee_bps.serialize(ref calldata);
    creator_fee_share_bps.serialize(ref calldata);
    // New launches trade in STRK. The deploy fee can be paid in STRK or USDC.
    strk_address.serialize(ref calldata);
    let fee_assets = array![
        FeeAssetInit { token: strk_address, deploy_fee: PAY_STRK_FEE },
        FeeAssetInit { token: usdc_address, deploy_fee: PAY_USDC_FEE },
    ];
    fee_assets.serialize(ref calldata);
    let (factory_address, _) = factory_class.deploy(@calldata).unwrap();

    // Everyone gets 100k of each asset to play with.
    let strk_minter = IMockMintDispatcher { contract_address: strk_address };
    let usdc_minter = IMockMintDispatcher { contract_address: usdc_address };
    let strk_each = 100_000 * ONE;
    let usdc_each = 100_000 * USDC_ONE * 10; // 1,000,000 USDC
    strk_minter.mint(CREATOR(), strk_each);
    strk_minter.mint(ALICE(), strk_each);
    strk_minter.mint(BOB(), strk_each);
    usdc_minter.mint(CREATOR(), usdc_each);
    usdc_minter.mint(ALICE(), usdc_each);
    usdc_minter.mint(BOB(), usdc_each);

    Setup {
        strk: IERC20Dispatcher { contract_address: strk_address },
        usdc: IERC20Dispatcher { contract_address: usdc_address },
        factory: ITokenFactoryDispatcher { contract_address: factory_address },
    }
}

/// CREATOR approves `fee` of `quote` and launches. Returns (token, curve).
fn launch(
    s: Setup, quote: IERC20Dispatcher, fee: u256, preset: u8, creator_bps: u16,
) -> (IERC20Dispatcher, IBondingCurveDispatcher) {
    start_cheat_caller_address(quote.contract_address, CREATOR());
    quote.approve(s.factory.contract_address, fee);
    stop_cheat_caller_address(quote.contract_address);

    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    let (token, curve) = s
        .factory
        .create_launch(
            "Cairo Builders", "CAIRO", "ipfs://meta", quote.contract_address, preset, creator_bps,
        );
    stop_cheat_caller_address(s.factory.contract_address);

    (IERC20Dispatcher { contract_address: token }, IBondingCurveDispatcher { contract_address: curve })
}

fn launch_strk(s: Setup, preset: u8, creator_bps: u16) -> (IERC20Dispatcher, IBondingCurveDispatcher) {
    launch(s, s.strk, STRK_FEE, preset, creator_bps)
}

fn launch_usdc(s: Setup, preset: u8, creator_bps: u16) -> (IERC20Dispatcher, IBondingCurveDispatcher) {
    launch(s, s.usdc, USDC_FEE, preset, creator_bps)
}

/// CREATOR approves `fee` of `fee_asset` and launches with `create_launch_paying_in`.
fn launch_paying_in(
    s: Setup, fee_asset: IERC20Dispatcher, fee: u256, preset: u8, creator_bps: u16,
) -> (IERC20Dispatcher, IBondingCurveDispatcher) {
    start_cheat_caller_address(fee_asset.contract_address, CREATOR());
    fee_asset.approve(s.factory.contract_address, fee);
    stop_cheat_caller_address(fee_asset.contract_address);

    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    let (token, curve) = s
        .factory
        .create_launch_paying_in(
            "Cairo Builders", "CAIRO", "ipfs://meta", fee_asset.contract_address, preset, creator_bps,
        );
    stop_cheat_caller_address(s.factory.contract_address);

    (IERC20Dispatcher { contract_address: token }, IBondingCurveDispatcher { contract_address: curve })
}

fn quote_of(curve: IBondingCurveDispatcher) -> IERC20Dispatcher {
    IERC20Dispatcher { contract_address: curve.quote_token() }
}

fn buy_as(curve: IBondingCurveDispatcher, who: ContractAddress, quote_in: u256) -> (u256, u256) {
    let quote = quote_of(curve);
    start_cheat_caller_address(quote.contract_address, who);
    quote.approve(curve.contract_address, quote_in);
    stop_cheat_caller_address(quote.contract_address);

    start_cheat_caller_address(curve.contract_address, who);
    let result = curve.buy(quote_in, 0);
    stop_cheat_caller_address(curve.contract_address);
    result
}

fn sell_as(
    token: IERC20Dispatcher, curve: IBondingCurveDispatcher, who: ContractAddress, tokens_in: u256,
) -> u256 {
    start_cheat_caller_address(token.contract_address, who);
    token.approve(curve.contract_address, tokens_in);
    stop_cheat_caller_address(token.contract_address);

    start_cheat_caller_address(curve.contract_address, who);
    let out = curve.sell(tokens_in, 0);
    stop_cheat_caller_address(curve.contract_address);
    out
}

/// How many `Graduated` events this curve has emitted since the spy was created.
fn graduated_events(ref spy: EventSpy, curve: ContractAddress) -> usize {
    let graduated = selector!("Graduated");
    let mut count: usize = 0;
    let events = spy.get_events().events;
    let mut i: usize = 0;
    while i < events.len() {
        let (from, event) = events.at(i);
        if *from == curve && *event.keys.at(0) == graduated {
            count += 1;
        }
        i += 1;
    };
    count
}

// ---------------------------------------------------------------- factory

#[test]
fn strk_launch_splits_supply_charges_strk_fee_and_leaves_factory_empty() {
    let s = deploy_setup();
    let creator_before = s.strk.balance_of(CREATOR());
    let (token, curve) = launch_strk(s, 1, 300); // 3% creator allocation

    // Fixed supply, fully accounted for.
    assert(token.total_supply() == TOTAL_SUPPLY, 'supply not fixed');
    let creator_amount = TOTAL_SUPPLY * 300 / 10_000;
    assert(token.balance_of(CREATOR()) == creator_amount, 'creator allocation');
    assert(token.balance_of(curve.contract_address) == TOTAL_SUPPLY - creator_amount, 'curve funding');
    assert(token.balance_of(s.factory.contract_address) == 0, 'factory kept tokens');

    // The deploy fee went to the treasury, in STRK, and nothing in USDC.
    assert(s.strk.balance_of(TREASURY()) == STRK_FEE, 'treasury not paid');
    assert(s.usdc.balance_of(TREASURY()) == 0, 'usdc charged by mistake');
    assert(s.strk.balance_of(CREATOR()) == creator_before - STRK_FEE, 'creator charged wrong');
    assert(s.strk.balance_of(s.factory.contract_address) == 0, 'factory kept strk');

    // Registry and curve metadata.
    assert(s.factory.launch_count() == 1, 'launch count');
    assert(s.factory.curve_of(token.contract_address) == curve.contract_address, 'registry');
    assert(curve.token() == token.contract_address, 'curve token');
    assert(curve.quote_token() == s.strk.contract_address, 'paired with strk');
    assert(curve.creator() == CREATOR(), 'curve creator');

    let state = curve.get_state();
    assert(state.curve_supply == CURVE_SUPPLY, 'curve supply');
    assert(state.reserved_supply == TOTAL_SUPPLY - CURVE_SUPPLY - creator_amount, 'reserved');
    assert(state.tokens_sold == 0 && state.quote_raised == 0 && !state.graduated, 'fresh state');
}

#[test]
fn usdc_launch_is_paired_with_usdc_and_charges_the_higher_usdc_fee() {
    let s = deploy_setup();
    let usdc_before = s.usdc.balance_of(CREATOR());
    let strk_before = s.strk.balance_of(CREATOR());
    let (token, curve) = launch_usdc(s, 1, 0);

    assert(curve.quote_token() == s.usdc.contract_address, 'paired with usdc');
    assert(token.total_supply() == TOTAL_SUPPLY, 'supply not fixed');
    assert(token.balance_of(s.factory.contract_address) == 0, 'factory kept tokens');

    // Fee is paid in USDC to the treasury; the creator's STRK is untouched.
    assert(s.usdc.balance_of(TREASURY()) == USDC_FEE, 'treasury usdc fee');
    assert(s.strk.balance_of(TREASURY()) == 0, 'strk charged by mistake');
    assert(s.usdc.balance_of(CREATOR()) == usdc_before - USDC_FEE, 'creator usdc charge');
    assert(s.strk.balance_of(CREATOR()) == strk_before, 'creator strk untouched');
}

#[test]
fn quote_config_reports_each_assets_fee_raise_and_decimals() {
    let s = deploy_setup();
    let strk = s.factory.quote_config(s.strk.contract_address);
    let usdc = s.factory.quote_config(s.usdc.contract_address);
    assert(strk.enabled && usdc.enabled, 'both enabled');
    assert(strk.unit == ONE && usdc.unit == USDC_ONE, 'units read from tokens');
    assert(strk.deploy_fee == STRK_FEE && usdc.deploy_fee == USDC_FEE, 'fees');
    assert(strk.graduation_raise == STRK_RAISE && usdc.graduation_raise == USDC_RAISE, 'raises');

    let unknown = s.factory.quote_config('nobody'.try_into().unwrap());
    assert(!unknown.enabled, 'unknown asset must be disabled');
}

#[test]
fn launch_emits_everything_the_indexer_needs() {
    let s = deploy_fee_setup();
    let mut spy = spy_events();
    let (token, curve) = launch_usdc(s, 2, 0);

    spy
        .assert_emitted(
            @array![
                (
                    s.factory.contract_address,
                    TokenFactory::Event::LaunchCreated(
                        TokenFactory::LaunchCreated {
                            creator: CREATOR(),
                            token: token.contract_address,
                            curve: curve.contract_address,
                            quote_token: s.usdc.contract_address,
                            launch_id: 0,
                            name: "Cairo Builders",
                            symbol: "CAIRO",
                            metadata_uri: "ipfs://meta",
                            preset: 2,
                            creator_bps: 0,
                            graduation_raise: USDC_RAISE,
                            deploy_fee: USDC_FEE,
                            trade_fee_bps: 100,
                            creator_fee_share_bps: 5_000,
                            fee_token: s.usdc.contract_address,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn strk_and_usdc_launches_live_side_by_side() {
    let s = deploy_setup();
    let (token_a, curve_a) = launch_strk(s, 0, 0);
    let (token_b, curve_b) = launch_usdc(s, 0, 0);
    let (token_c, curve_c) = launch_strk(s, 0, 0);
    assert(token_a.contract_address != token_b.contract_address, 'same token');
    assert(token_b.contract_address != token_c.contract_address, 'same token');
    assert(curve_a.contract_address != curve_c.contract_address, 'same curve');
    assert(curve_a.quote_token() == s.strk.contract_address, 'a is strk');
    assert(curve_b.quote_token() == s.usdc.contract_address, 'b is usdc');
    assert(curve_c.quote_token() == s.strk.contract_address, 'c is strk');
    assert(s.factory.launch_count() == 3, 'count');
}

#[test]
#[should_panic(expected: 'FACTORY_QUOTE_NOT_ALLOWED')]
fn a_launch_with_an_unlisted_quote_asset_is_rejected() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch("Name", "SYM", "", 'rando'.try_into().unwrap(), 1, 0);
}

#[test]
#[should_panic(expected: 'FACTORY_CREATOR_CAP')]
fn creator_allocation_is_capped_at_five_percent() {
    let s = deploy_setup();
    launch_strk(s, 1, 501);
}

#[test]
#[should_panic(expected: 'FACTORY_BAD_PRESET')]
fn unknown_preset_is_rejected() {
    let s = deploy_setup();
    launch_usdc(s, 3, 0);
}

#[test]
#[should_panic(expected: 'FACTORY_BAD_SYMBOL')]
fn empty_symbol_is_rejected() {
    let s = deploy_setup();
    start_cheat_caller_address(s.strk.contract_address, CREATOR());
    s.strk.approve(s.factory.contract_address, STRK_FEE);
    stop_cheat_caller_address(s.strk.contract_address);
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch("Name", "", "", s.strk.contract_address, 1, 0);
}

#[test]
#[should_panic(expected: 'ERC20: insufficient allowance')]
fn launch_without_approving_the_strk_fee_fails() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch("Cairo Builders", "CAIRO", "", s.strk.contract_address, 1, 0);
}

#[test]
#[should_panic(expected: 'ERC20: insufficient allowance')]
fn approving_strk_does_not_pay_for_a_usdc_launch() {
    // The fee is charged in the launch's own asset. STRK approval is irrelevant to a USDC launch.
    let s = deploy_setup();
    start_cheat_caller_address(s.strk.contract_address, CREATOR());
    s.strk.approve(s.factory.contract_address, 1_000 * ONE);
    stop_cheat_caller_address(s.strk.contract_address);
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch("Cairo Builders", "CAIRO", "", s.usdc.contract_address, 1, 0);
}

#[test]
fn owner_can_change_one_assets_fee_without_touching_the_other() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_quote_token(s.usdc.contract_address, true, 2 * USDC_FEE, USDC_RAISE);
    stop_cheat_caller_address(s.factory.contract_address);
    assert(s.factory.quote_config(s.usdc.contract_address).deploy_fee == 2 * USDC_FEE, 'usdc fee');
    assert(s.factory.quote_config(s.strk.contract_address).deploy_fee == STRK_FEE, 'strk fee');

    // The new fee applies to the next USDC launch.
    launch(s, s.usdc, 2 * USDC_FEE, 1, 0);
    assert(s.usdc.balance_of(TREASURY()) == 2 * USDC_FEE, 'new fee not charged');
}

#[test]
fn owner_can_list_a_new_quote_asset() {
    // Reuse the STRK mock class as a stand-in for "some other 18-decimal asset".
    let s = deploy_setup();
    let (other, _) = declare("MockSTRK").unwrap().contract_class().deploy(@array![]).unwrap();
    assert(!s.factory.quote_config(other).enabled, 'starts unlisted');
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_quote_token(other, true, ONE, 500 * ONE);
    assert(s.factory.quote_config(other).enabled, 'now listed');
    assert(s.factory.quote_config(other).unit == ONE, 'decimals read');
}

#[test]
#[should_panic(expected: 'FACTORY_FEE_TOO_HIGH')]
fn strk_fee_cannot_exceed_100_strk() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_quote_token(s.strk.contract_address, true, MAX_DEPLOY_FEE_UNITS * ONE + 1, STRK_RAISE);
}

#[test]
#[should_panic(expected: 'FACTORY_FEE_TOO_HIGH')]
fn usdc_fee_cannot_exceed_100_usdc() {
    // The cap is 100 whole units of whichever asset, so it is 100 USDC, not 100e18 of them.
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s
        .factory
        .set_quote_token(s.usdc.contract_address, true, MAX_DEPLOY_FEE_UNITS * USDC_ONE + 1, USDC_RAISE);
}

#[test]
fn a_fee_exactly_at_the_cap_is_allowed() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_quote_token(s.usdc.contract_address, true, MAX_DEPLOY_FEE_UNITS * USDC_ONE, USDC_RAISE);
    assert(
        s.factory.quote_config(s.usdc.contract_address).deploy_fee == MAX_DEPLOY_FEE_UNITS * USDC_ONE,
        'cap fee',
    );
}

#[test]
#[should_panic(expected: 'FACTORY_ZERO_RAISE')]
fn a_quote_asset_needs_a_graduation_raise() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_quote_token(s.usdc.contract_address, true, USDC_FEE, 0);
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn only_the_owner_can_configure_quote_assets() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, ALICE());
    s.factory.set_quote_token(s.usdc.contract_address, true, 0, USDC_RAISE);
}

#[test]
#[should_panic(expected: 'FACTORY_QUOTE_NOT_ALLOWED')]
fn a_disabled_quote_asset_cannot_start_new_launches() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_quote_token(s.usdc.contract_address, false, 0, 0);
    stop_cheat_caller_address(s.factory.contract_address);
    launch_usdc(s, 1, 0);
}

#[test]
fn disabling_an_asset_does_not_stop_trading_on_its_existing_curves() {
    let s = deploy_setup();
    let (_, curve) = launch_usdc(s, 1, 0);
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_quote_token(s.usdc.contract_address, false, 0, 0);
    stop_cheat_caller_address(s.factory.contract_address);
    assert(!s.factory.quote_config(s.usdc.contract_address).enabled, 'disabled');
    // fee and raise are remembered for when it is re-enabled
    assert(s.factory.quote_config(s.usdc.contract_address).deploy_fee == USDC_FEE, 'fee kept');

    let (_, tokens) = buy_as(curve, ALICE(), 100 * USDC_ONE);
    assert(tokens > 0, 'trading blocked');
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn only_the_owner_can_pause() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, ALICE());
    s.factory.set_launches_paused(true);
}

#[test]
#[should_panic(expected: 'FACTORY_LAUNCHES_PAUSED')]
fn paused_factory_rejects_launches_in_either_asset() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_launches_paused(true);
    stop_cheat_caller_address(s.factory.contract_address);
    launch_usdc(s, 1, 0);
}

#[test]
fn pausing_launches_does_not_stop_trading_on_existing_curves() {
    let s = deploy_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_launches_paused(true);
    stop_cheat_caller_address(s.factory.contract_address);

    let (_, tokens) = buy_as(curve, ALICE(), 50 * ONE);
    assert(tokens > 0, 'trading blocked by pause');
}

// ------------------------------------------------------------------ curve (STRK)

#[test]
fn buy_pays_strk_and_delivers_the_quoted_tokens() {
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let spend = 100 * ONE;
    let (quoted_spend, quoted_tokens, _) = curve.quote_buy(spend);

    let before = s.strk.balance_of(ALICE());
    let (spent, tokens) = buy_as(curve, ALICE(), spend);

    assert(spent == quoted_spend && tokens == quoted_tokens, 'quote != trade');
    assert(token.balance_of(ALICE()) == tokens, 'tokens not delivered');
    assert(s.strk.balance_of(ALICE()) == before - spent, 'strk not charged');
    assert(s.strk.balance_of(curve.contract_address) == spent, 'curve strk');

    let state = curve.get_state();
    assert(state.tokens_sold == tokens && state.quote_raised == spent, 'state not updated');
    assert(!state.graduated, 'graduated too early');
}

#[test]
fn price_rises_as_people_buy() {
    let s = deploy_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    let p0 = curve.spot_price();
    buy_as(curve, ALICE(), 100 * ONE);
    let p1 = curve.spot_price();
    buy_as(curve, BOB(), 100 * ONE);
    let p2 = curve.spot_price();
    assert(p1 > p0 && p2 > p1, 'price should climb');
}

#[test]
fn selling_everything_back_returns_at_most_what_was_paid() {
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (spent, tokens) = buy_as(curve, ALICE(), 200 * ONE);
    let out = sell_as(token, curve, ALICE(), tokens);

    assert(out <= spent, 'seller profited from nothing');
    assert(spent - out < 1_000, 'round trip lost too much');
    assert(token.balance_of(ALICE()) == 0, 'tokens not taken');
    let state = curve.get_state();
    assert(state.tokens_sold == 0, 'sold not reset');
    assert(state.quote_raised == spent - out, 'raised should be dust');
}

#[test]
fn a_later_buyer_exits_at_a_higher_price_than_an_earlier_one_entered() {
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (alice_spent, alice_tokens) = buy_as(curve, ALICE(), 100 * ONE);
    let (_, _) = buy_as(curve, BOB(), 300 * ONE);
    let alice_out = sell_as(token, curve, ALICE(), alice_tokens);
    assert(alice_out > alice_spent, 'early buyer should profit');
}

#[test]
#[should_panic(expected: 'CURVE_SLIPPAGE')]
fn buy_reverts_when_slippage_limit_is_not_met() {
    let s = deploy_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    let (_, quoted, _) = curve.quote_buy(100 * ONE);
    start_cheat_caller_address(s.strk.contract_address, ALICE());
    s.strk.approve(curve.contract_address, 100 * ONE);
    stop_cheat_caller_address(s.strk.contract_address);
    start_cheat_caller_address(curve.contract_address, ALICE());
    curve.buy(100 * ONE, quoted + 1);
}

#[test]
#[should_panic(expected: 'CURVE_SLIPPAGE')]
fn sell_reverts_when_slippage_limit_is_not_met() {
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (_, tokens) = buy_as(curve, ALICE(), 100 * ONE);
    let quoted = curve.quote_sell(tokens);
    start_cheat_caller_address(token.contract_address, ALICE());
    token.approve(curve.contract_address, tokens);
    stop_cheat_caller_address(token.contract_address);
    start_cheat_caller_address(curve.contract_address, ALICE());
    curve.sell(tokens, quoted + 1);
}

#[test]
#[should_panic(expected: 'CURVE_ZERO_AMOUNT')]
fn zero_buy_reverts() {
    let s = deploy_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    start_cheat_caller_address(curve.contract_address, ALICE());
    curve.buy(0, 0);
}

#[test]
#[should_panic(expected: 'CURVE_SELL_EXCEEDS_SOLD')]
fn cannot_sell_more_than_the_curve_has_sold() {
    // The creator's allocation did not come out of the curve, so even a creator holding
    // 5% cannot dump it into a curve that has sold nothing.
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 500);
    let allocation = token.balance_of(CREATOR());
    start_cheat_caller_address(token.contract_address, CREATOR());
    token.approve(curve.contract_address, allocation);
    stop_cheat_caller_address(token.contract_address);
    start_cheat_caller_address(curve.contract_address, CREATOR());
    curve.sell(allocation, 0);
}

#[test]
#[should_panic(expected: 'ERC20: insufficient allowance')]
fn buy_without_approving_the_curve_fails() {
    let s = deploy_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    start_cheat_caller_address(curve.contract_address, ALICE());
    curve.buy(10 * ONE, 0);
}

#[test]
fn buying_emits_a_trade_event_with_post_trade_reserves() {
    let s = deploy_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    let mut spy = spy_events();
    let (spent, tokens) = buy_as(curve, ALICE(), 100 * ONE);
    let state = curve.get_state();

    spy
        .assert_emitted(
            @array![
                (
                    curve.contract_address,
                    BondingCurve::Event::TokensBought(
                        BondingCurve::TokensBought {
                            buyer: ALICE(),
                            quote_in: spent,
                            fee: 0,
                            tokens_out: tokens,
                            quote_reserve: state.quote_reserve,
                            token_reserve: state.token_reserve,
                        },
                    ),
                ),
            ],
        );
}

// ----------------------------------------------------------- curve (USDC, 6 decimals)

#[test]
fn usdc_buy_pays_usdc_and_delivers_the_quoted_tokens() {
    let s = deploy_setup();
    let (token, curve) = launch_usdc(s, 1, 0);
    let spend = 100 * USDC_ONE;
    let (quoted_spend, quoted_tokens, _) = curve.quote_buy(spend);

    let before = s.usdc.balance_of(ALICE());
    let strk_before = s.strk.balance_of(ALICE());
    let (spent, tokens) = buy_as(curve, ALICE(), spend);

    assert(spent == quoted_spend && tokens == quoted_tokens, 'quote != trade');
    assert(tokens > 0, 'no tokens');
    assert(token.balance_of(ALICE()) == tokens, 'tokens not delivered');
    assert(s.usdc.balance_of(ALICE()) == before - spent, 'usdc not charged');
    assert(s.strk.balance_of(ALICE()) == strk_before, 'strk touched');
    assert(s.usdc.balance_of(curve.contract_address) == spent, 'curve usdc');
}

#[test]
fn usdc_price_rises_as_people_buy() {
    let s = deploy_setup();
    let (_, curve) = launch_usdc(s, 1, 0);
    let p0 = curve.spot_price();
    buy_as(curve, ALICE(), 500 * USDC_ONE);
    let p1 = curve.spot_price();
    buy_as(curve, BOB(), 500 * USDC_ONE);
    let p2 = curve.spot_price();
    assert(p0 > 0, 'price has precision');
    assert(p1 > p0 && p2 > p1, 'price should climb');
}

#[test]
fn usdc_round_trip_never_profits_and_loses_only_dust() {
    // 6 decimals means one smallest unit is 0.000001 USDC, so rounding matters more than
    // with STRK. It must still never favour the trader, and stay tiny.
    let s = deploy_setup();
    let (token, curve) = launch_usdc(s, 1, 0);
    let spend = 500 * USDC_ONE;
    let (spent, tokens) = buy_as(curve, ALICE(), spend);
    let out = sell_as(token, curve, ALICE(), tokens);
    assert(out <= spent, 'seller profited from nothing');
    assert(spent - out <= 10, 'lost more than 10 units');
}

#[test]
fn usdc_curve_graduates_at_its_own_raise_and_refunds_the_excess() {
    let s = deploy_setup();
    let (token, curve) = launch_usdc(s, 1, 0);

    // Alice offers 50,000 USDC; the curve only needs ~10,000.
    let offered = 50_000 * USDC_ONE;
    let before = s.usdc.balance_of(ALICE());
    let (spent, tokens) = buy_as(curve, ALICE(), offered);

    assert(tokens == CURVE_SUPPLY, 'should take whole curve');
    assert(spent <= USDC_RAISE && spent + 10 >= USDC_RAISE, 'should cost the usdc raise');
    assert(s.usdc.balance_of(ALICE()) == before - spent, 'only the needed usdc is taken');
    assert(token.balance_of(ALICE()) == CURVE_SUPPLY, 'tokens delivered');
    assert(curve.get_state().graduated, 'not graduated');
}

#[test]
fn usdc_curve_trades_both_ways_after_graduation() {
    let s = deploy_setup();
    let (token, curve) = launch_usdc(s, 1, 0);
    let (spent, tokens) = buy_as(curve, ALICE(), 50_000 * USDC_ONE);
    assert(curve.get_state().graduated, 'not graduated');
    // Sold out: nothing left to buy.
    let (spend, got, _) = curve.quote_buy(10 * USDC_ONE);
    assert(spend == 0 && got == 0, 'nothing to buy when sold out');

    let out = sell_as(token, curve, ALICE(), tokens / 2);
    assert(out > 0 && out < spent, 'sell after graduation');

    // Room again, so buying works again, in USDC.
    let (spend_after, got_after, _) = curve.quote_buy(10 * USDC_ONE);
    assert(spend_after > 0 && got_after > 0, 'buy should reopen');
    let (bob_spent, bob_tokens) = buy_as(curve, BOB(), 10 * USDC_ONE);
    assert(bob_spent > 0 && bob_tokens > 0, 'bob could not buy');
    assert(curve.get_state().graduated, 'graduation should stick');
}

#[test]
#[should_panic(expected: 'CURVE_DUST_TRADE')]
fn a_trade_too_small_to_buy_any_token_is_rejected() {
    let s = deploy_setup();
    let (_, curve) = launch_usdc(s, 1, 0);
    // The price is a small fraction of one USDC unit per token, so a single unit buys tokens;
    // but selling a single token wei pays out 0 units and must not be accepted as a free gift.
    buy_as(curve, ALICE(), 100 * USDC_ONE);
    sell_as(IERC20Dispatcher { contract_address: curve.token() }, curve, ALICE(), 1);
}

// ------------------------------------------------------------- graduation (STRK)

#[test]
fn filling_the_curve_graduates_it_and_only_charges_what_is_needed() {
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);

    // Alice offers far more than the curve needs. She is only charged ~1,000 STRK.
    let offered = 5_000 * ONE;
    let before = s.strk.balance_of(ALICE());
    let mut spy = spy_events();
    let (spent, tokens) = buy_as(curve, ALICE(), offered);

    assert(tokens == CURVE_SUPPLY, 'should take whole curve');
    assert(spent < STRK_RAISE + 1_000 && spent + 1_000 > STRK_RAISE, 'should cost the raise');
    assert(s.strk.balance_of(ALICE()) == before - spent, 'refund broken');
    assert(token.balance_of(ALICE()) == CURVE_SUPPLY, 'tokens delivered');

    let state = curve.get_state();
    assert(state.graduated, 'not graduated');
    spy
        .assert_emitted(
            @array![
                (
                    curve.contract_address,
                    BondingCurve::Event::Graduated(
                        BondingCurve::Graduated {
                            quote_raised: state.quote_raised, tokens_sold: state.tokens_sold,
                        },
                    ),
                ),
            ],
        );
}

#[test]
#[should_panic(expected: 'CURVE_SOLD_OUT')]
fn a_sold_out_curve_has_nothing_left_to_buy() {
    let s = deploy_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    buy_as(curve, ALICE(), 5_000 * ONE);
    buy_as(curve, BOB(), 10 * ONE);
}

#[test]
fn selling_stays_open_after_graduation() {
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (spent, tokens) = buy_as(curve, ALICE(), 5_000 * ONE);
    assert(curve.get_state().graduated, 'not graduated');

    let out = sell_as(token, curve, ALICE(), tokens / 2);
    assert(out > 0 && out < spent, 'sell after graduation');
    assert(curve.get_state().graduated, 'graduation should stick');
}

#[test]
fn the_quote_is_empty_only_while_the_curve_is_sold_out() {
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (_, tokens) = buy_as(curve, ALICE(), 5_000 * ONE);
    let (spend, got, would_sell_out) = curve.quote_buy(10 * ONE);
    assert(spend == 0 && got == 0 && !would_sell_out, 'sold out: nothing to quote');

    sell_as(token, curve, ALICE(), tokens / 10);
    let (spend, got, _) = curve.quote_buy(10 * ONE);
    assert(spend > 0 && got > 0, 'room again: quote returns');
}

#[test]
fn buying_reopens_when_holders_sell_after_graduation() {
    // Nobody is locked out: once a holder sells, room opens and a new buyer can get in.
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (_, alice_tokens) = buy_as(curve, ALICE(), 5_000 * ONE);
    assert(curve.get_state().graduated, 'not graduated');

    let sold_before = curve.get_state().tokens_sold;
    sell_as(token, curve, ALICE(), alice_tokens / 2);
    let (bob_spent, bob_tokens) = buy_as(curve, BOB(), 100 * ONE);

    assert(bob_spent > 0 && bob_tokens > 0, 'bob could not buy');
    assert(token.balance_of(BOB()) == bob_tokens, 'tokens not delivered');
    let state = curve.get_state();
    assert(state.graduated, 'graduation should stick');
    assert(state.tokens_sold < sold_before, 'some of the curve is open again');
}

#[test]
fn buying_after_graduation_is_priced_like_any_other_buy() {
    // After the sell, the same maths applies: the quote equals the trade.
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (_, tokens) = buy_as(curve, ALICE(), 5_000 * ONE);
    sell_as(token, curve, ALICE(), tokens / 2);
    let (quoted_spend, quoted_tokens, _) = curve.quote_buy(100 * ONE);
    let (spent, got) = buy_as(curve, BOB(), 100 * ONE);
    assert(spent == quoted_spend && got == quoted_tokens, 'quote != trade after graduation');
}

#[test]
fn selling_out_again_does_not_announce_graduation_a_second_time() {
    let s = deploy_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let mut spy = spy_events();
    let (_, tokens) = buy_as(curve, ALICE(), 5_000 * ONE);
    assert(graduated_events(ref spy, curve.contract_address) == 1, 'first sell-out announces');

    // Holders sell some back, then a new buyer sells the curve out again.
    sell_as(token, curve, ALICE(), tokens / 2);
    buy_as(curve, BOB(), 5_000 * ONE);
    assert(curve.get_state().tokens_sold == CURVE_SUPPLY, 'sold out again');
    assert(graduated_events(ref spy, curve.contract_address) == 1, 'announced a second time');
}

#[test]
fn every_preset_graduates_at_the_same_raise_in_both_assets() {
    let s = deploy_setup();
    let mut preset: u8 = 0;
    while preset <= 2 {
        let (_, strk_curve) = launch_strk(s, preset, 0);
        let (strk_spent, _) = buy_as(strk_curve, ALICE(), 5_000 * ONE);
        assert(
            strk_spent < STRK_RAISE + 1_000 && strk_spent + 1_000 > STRK_RAISE, 'strk raise differs',
        );

        let (_, usdc_curve) = launch_usdc(s, preset, 0);
        let (usdc_spent, _) = buy_as(usdc_curve, ALICE(), 50_000 * USDC_ONE);
        assert(usdc_spent <= USDC_RAISE && usdc_spent + 10 >= USDC_RAISE, 'usdc raise differs');
        preset += 1;
    };
}

#[test]
fn steeper_presets_start_cheaper_and_end_pricier() {
    let s = deploy_setup();
    let (_, gentle) = launch_usdc(s, 0, 0);
    let (_, steep) = launch_usdc(s, 2, 0);
    // Same raise and same supply: the steep curve opens at a lower price...
    assert(steep.spot_price() < gentle.spot_price(), 'steep should open cheaper');
    // ...and finishes at a higher one.
    buy_as(gentle, ALICE(), 50_000 * USDC_ONE);
    buy_as(steep, BOB(), 50_000 * USDC_ONE);
    assert(steep.spot_price() > gentle.spot_price(), 'steep should end pricier');
}

// ------------------------------------------------------------------- trading fee (1%)
//
// Everything below runs on a factory with the production fee: 1% of the curve-side amount of each
// trade, half to the creator and half to the platform, accrued in the curve until claimed.

fn claim_creator_as(curve: IBondingCurveDispatcher, who: ContractAddress) -> u256 {
    start_cheat_caller_address(curve.contract_address, who);
    let amount = curve.claim_creator_fees();
    stop_cheat_caller_address(curve.contract_address);
    amount
}

fn claim_platform_as(curve: IBondingCurveDispatcher, who: ContractAddress) -> u256 {
    start_cheat_caller_address(curve.contract_address, who);
    let amount = curve.claim_platform_fees();
    stop_cheat_caller_address(curve.contract_address);
    amount
}

#[test]
fn a_buy_pays_the_curve_amount_plus_one_percent() {
    let s = deploy_fee_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let before = s.strk.balance_of(ALICE());

    // Willing to pay 50.5 in total: 50 goes into the curve and 0.5 is the fee.
    let (total, tokens) = buy_as(curve, ALICE(), 505 * ONE / 10);

    assert(total == 505 * ONE / 10, 'paid the whole budget');
    assert(s.strk.balance_of(ALICE()) == before - total, 'alice charged');
    // The same tokens as a fee-free purchase of 50.
    assert(tokens == 109_090_909_090_909_090_909_090_909, 'fee must not change the price');
    assert(token.balance_of(ALICE()) == tokens, 'tokens delivered');

    let state = curve.get_state();
    assert(state.quote_raised == 50 * ONE, 'curve got the net amount');
    assert(state.creator_fees == ONE / 4 && state.platform_fees == ONE / 4, 'fee split in half');
    assert(state.trade_fee_bps == 100 && state.creator_fee_share_bps == 5_000, 'terms recorded');
}

#[test]
fn a_sell_pays_the_seller_the_curve_amount_minus_one_percent() {
    let s = deploy_fee_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (_, tokens) = buy_as(curve, ALICE(), 505 * ONE / 10);
    let before = s.strk.balance_of(ALICE());

    let received = sell_as(token, curve, ALICE(), tokens);

    // The curve gives up 50, the seller gets 49.5, and 0.5 is the fee.
    assert(received == 495 * ONE / 10, 'seller gets 99%');
    assert(s.strk.balance_of(ALICE()) == before + received, 'alice paid');
    let state = curve.get_state();
    assert(state.quote_raised == 0, 'curve gave up the whole 50');
    // Fees from the buy (0.5) and the sell (0.5), half each.
    assert(state.creator_fees == ONE / 2 && state.platform_fees == ONE / 2, 'fees accrued');
}

#[test]
fn the_curve_always_holds_its_reserve_plus_unclaimed_fees() {
    let s = deploy_fee_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (_, alice_tokens) = buy_as(curve, ALICE(), 300 * ONE);
    buy_as(curve, BOB(), 120 * ONE);
    sell_as(token, curve, ALICE(), alice_tokens / 3);
    buy_as(curve, BOB(), 77 * ONE);
    sell_as(token, curve, ALICE(), alice_tokens / 5);

    let state = curve.get_state();
    // Nothing is lost or created: every unit the curve holds is either reserve or an owed fee.
    assert(
        s.strk.balance_of(curve.contract_address) == state.quote_raised
            + state.creator_fees
            + state.platform_fees,
        'balance != reserve + fees',
    );
}

#[test]
fn quotes_match_what_the_trades_really_charge_and_pay() {
    let s = deploy_fee_setup();
    let (token, curve) = launch_strk(s, 1, 0);

    let (quoted_total, quoted_tokens, _) = curve.quote_buy(200 * ONE);
    let (total, tokens) = buy_as(curve, ALICE(), 200 * ONE);
    assert(total == quoted_total && tokens == quoted_tokens, 'buy quote != buy');
    assert(total <= 200 * ONE, 'never charged over budget');

    let quoted_payout = curve.quote_sell(tokens / 2);
    let received = sell_as(token, curve, ALICE(), tokens / 2);
    assert(received == quoted_payout, 'sell quote != sell');
}

#[test]
fn a_round_trip_costs_about_two_percent() {
    let s = deploy_fee_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let before = s.strk.balance_of(ALICE());
    let (_, tokens) = buy_as(curve, ALICE(), 100 * ONE);
    sell_as(token, curve, ALICE(), tokens);
    let lost = before - s.strk.balance_of(ALICE());
    // 1% in, 1% out, on the amount that went into the curve (just under 100): a hair under 2.
    assert(lost > 195 * ONE / 100 && lost < 200 * ONE / 100, 'round trip is about 2 percent');
}

#[test]
fn the_graduating_buy_pays_the_fee_on_what_the_curve_takes() {
    let s = deploy_fee_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    let before = s.strk.balance_of(ALICE());

    // Offer far more than needed. The curve takes ~1,000 and the fee is 1% of that, not of the offer.
    let (total, tokens) = buy_as(curve, ALICE(), 5_000 * ONE);

    assert(tokens == CURVE_SUPPLY, 'whole curve');
    let state = curve.get_state();
    assert(state.graduated, 'graduated');
    assert(state.quote_raised + 1_000 > STRK_RAISE && state.quote_raised < STRK_RAISE + 1_000, 'raise reached');
    let fee = state.creator_fees + state.platform_fees;
    assert(total == state.quote_raised + fee, 'total = curve amount + fee');
    // 1% of ~1,000 STRK is ~10 STRK (rounded up by a unit or so), nowhere near 1% of the 5,000 offered.
    assert(fee >= 10 * ONE - 1_000 && fee <= 10 * ONE + 1_000, 'fee is 1pc of what curve took');
    assert(s.strk.balance_of(ALICE()) == before - total, 'only what was needed charged');
}

#[test]
fn claiming_pays_the_creator_and_the_platform_and_clears_what_is_owed() {
    let s = deploy_fee_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (_, tokens) = buy_as(curve, ALICE(), 505 * ONE / 10);
    sell_as(token, curve, ALICE(), tokens);
    let state = curve.get_state();
    assert(state.creator_fees == ONE / 2 && state.platform_fees == ONE / 2, 'fees to claim');

    let creator_before = s.strk.balance_of(CREATOR());
    let treasury_before = s.strk.balance_of(TREASURY());
    // BOB has nothing to do with this launch and can still trigger the claim. The money cannot go to him.
    let creator_paid = claim_creator_as(curve, BOB());
    let platform_paid = claim_platform_as(curve, BOB());

    assert(creator_paid == ONE / 2 && platform_paid == ONE / 2, 'amounts paid');
    assert(s.strk.balance_of(CREATOR()) == creator_before + ONE / 2, 'creator paid');
    assert(s.strk.balance_of(TREASURY()) == treasury_before + ONE / 2, 'treasury paid');
    assert(s.strk.balance_of(BOB()) == 100_000 * ONE, 'the caller got nothing');

    let after = curve.get_state();
    assert(after.creator_fees == 0 && after.platform_fees == 0, 'nothing left owed');
    assert(s.strk.balance_of(curve.contract_address) == after.quote_raised, 'only the reserve remains');
}

#[test]
#[should_panic(expected: 'CURVE_NO_FEES')]
fn a_creator_claim_with_nothing_owed_is_refused() {
    let s = deploy_fee_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    claim_creator_as(curve, CREATOR());
}

#[test]
#[should_panic(expected: 'CURVE_NO_FEES')]
fn fees_cannot_be_claimed_twice() {
    let s = deploy_fee_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    buy_as(curve, ALICE(), 100 * ONE);
    claim_platform_as(curve, TREASURY());
    claim_platform_as(curve, TREASURY());
}

#[test]
fn the_platform_claim_follows_a_changed_fee_recipient() {
    let s = deploy_fee_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    buy_as(curve, ALICE(), 100 * ONE);
    let owed = curve.get_state().platform_fees;
    assert(owed > 0, 'something owed');

    // The platform moves its treasury. Curves launched earlier follow it, because the recipient is
    // asked at claim time and trading never depends on it.
    let new_treasury: ContractAddress = 'new_treasury'.try_into().unwrap();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_fee_recipient(new_treasury);
    stop_cheat_caller_address(s.factory.contract_address);

    let old_before = s.strk.balance_of(TREASURY());
    claim_platform_as(curve, ALICE());
    assert(s.strk.balance_of(new_treasury) == owed, 'new treasury paid');
    assert(s.strk.balance_of(TREASURY()) == old_before, 'old treasury not paid');
}

#[test]
fn the_creator_keeps_earning_whoever_the_buyers_are() {
    let s = deploy_fee_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (_, alice_tokens) = buy_as(curve, ALICE(), 50 * ONE);
    buy_as(curve, BOB(), 70 * ONE);
    sell_as(token, curve, ALICE(), alice_tokens);
    let creator_owed = curve.get_state().creator_fees;
    assert(creator_owed > 0, 'creator earned from trades');
    assert(claim_creator_as(curve, ALICE()) == creator_owed, 'creator paid in full');
}

#[test]
fn usdc_fees_are_paid_in_usdc_with_six_decimals() {
    let s = deploy_fee_setup();
    let (_, curve) = launch_usdc(s, 1, 0);
    let strk_before = s.strk.balance_of(ALICE());

    // 101 USDC budget: 100 into the curve and 1 USDC of fee, half to each side.
    let (total, _) = buy_as(curve, ALICE(), 101 * USDC_ONE);

    assert(total == 101 * USDC_ONE, 'paid 101 usdc');
    let state = curve.get_state();
    assert(state.quote_raised == 100 * USDC_ONE, 'curve got 100 usdc');
    assert(state.creator_fees == USDC_ONE / 2 && state.platform_fees == USDC_ONE / 2, 'half a usdc each');
    assert(s.strk.balance_of(ALICE()) == strk_before, 'no strk involved');
    let paid = claim_creator_as(curve, BOB());
    assert(paid == USDC_ONE / 2, 'creator claimed 0.5 usdc');
    assert(s.usdc.balance_of(CREATOR()) >= USDC_ONE / 2, 'creator holds usdc');
}

#[test]
fn a_tiny_usdc_trade_still_pays_a_whole_unit_of_fee() {
    let s = deploy_fee_setup();
    let (_, curve) = launch_usdc(s, 1, 0);
    // 2 units budget: 1 unit goes in, and the fee on 1 unit rounds UP to 1 unit.
    let (total, _) = buy_as(curve, ALICE(), 2);
    assert(total == 2, 'one unit in, one unit fee');
    let state = curve.get_state();
    assert(state.quote_raised == 1, 'one unit in the curve');
    assert(state.creator_fees + state.platform_fees == 1, 'a whole unit of fee');
}

#[test]
#[should_panic(expected: 'CURVE_DUST_TRADE')]
fn a_trade_too_small_to_cover_its_own_fee_is_rejected() {
    let s = deploy_fee_setup();
    let (_, curve) = launch_usdc(s, 1, 0);
    // One unit cannot pay for a unit of curve plus a unit of fee.
    buy_as(curve, ALICE(), 1);
}

#[test]
fn buying_after_graduation_still_pays_the_fee() {
    let s = deploy_fee_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let (_, tokens) = buy_as(curve, ALICE(), 5_000 * ONE);
    sell_as(token, curve, ALICE(), tokens / 2);
    let fees_before = curve.get_state().creator_fees + curve.get_state().platform_fees;
    buy_as(curve, BOB(), 100 * ONE);
    let fees_after = curve.get_state().creator_fees + curve.get_state().platform_fees;
    assert(fees_after > fees_before, 'reopened curve charges the fee');
}

#[test]
fn the_events_report_the_fee_and_the_curve_side_amount() {
    let s = deploy_fee_setup();
    let (token, curve) = launch_strk(s, 1, 0);
    let mut spy = spy_events();
    let (_, tokens) = buy_as(curve, ALICE(), 505 * ONE / 10);
    let state = curve.get_state();
    spy
        .assert_emitted(
            @array![
                (
                    curve.contract_address,
                    BondingCurve::Event::TokensBought(
                        BondingCurve::TokensBought {
                            buyer: ALICE(),
                            quote_in: 50 * ONE,
                            fee: ONE / 2,
                            tokens_out: tokens,
                            quote_reserve: state.quote_reserve,
                            token_reserve: state.token_reserve,
                        },
                    ),
                ),
            ],
        );

    sell_as(token, curve, ALICE(), tokens);
    let state = curve.get_state();
    spy
        .assert_emitted(
            @array![
                (
                    curve.contract_address,
                    BondingCurve::Event::TokensSold(
                        BondingCurve::TokensSold {
                            seller: ALICE(),
                            tokens_in: tokens,
                            quote_out: 50 * ONE,
                            fee: ONE / 2,
                            quote_reserve: state.quote_reserve,
                            token_reserve: state.token_reserve,
                        },
                    ),
                ),
            ],
        );

    claim_creator_as(curve, BOB());
    spy
        .assert_emitted(
            @array![
                (
                    curve.contract_address,
                    BondingCurve::Event::FeesClaimed(
                        BondingCurve::FeesClaimed { recipient: CREATOR(), creator: true, amount: ONE / 2 },
                    ),
                ),
            ],
        );
}

#[test]
fn a_zero_fee_factory_makes_zero_fee_curves() {
    let s = deploy_setup();
    let (_, curve) = launch_strk(s, 1, 0);
    let (total, _) = buy_as(curve, ALICE(), 100 * ONE);
    assert(total == 100 * ONE, 'no fee on top');
    let state = curve.get_state();
    assert(state.creator_fees == 0 && state.platform_fees == 0, 'nothing accrued');
    assert(state.quote_raised == 100 * ONE, 'the whole amount went in');
}

// ----------------------------------------------------- fee settings on the factory

#[test]
fn the_owner_can_change_the_trade_fee_and_only_new_launches_get_it() {
    let s = deploy_fee_setup();
    let (_, old_curve) = launch_strk(s, 1, 0);

    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_trade_fee(200, 6_000);
    stop_cheat_caller_address(s.factory.contract_address);
    let (fee, share) = s.factory.trade_fee();
    assert(fee == 200 && share == 6_000, 'setting stored');

    let (_, new_curve) = launch_strk(s, 1, 0);
    assert(new_curve.get_state().trade_fee_bps == 200, 'new curve has the new fee');
    assert(new_curve.get_state().creator_fee_share_bps == 6_000, 'and the new split');
    // The curve launched before the change keeps the terms it was created with, forever.
    assert(old_curve.get_state().trade_fee_bps == 100, 'old curve unchanged');
    assert(old_curve.get_state().creator_fee_share_bps == 5_000, 'old split unchanged');
}

#[test]
#[should_panic(expected: 'FACTORY_TRADE_FEE_HIGH')]
fn the_trade_fee_cannot_exceed_three_percent() {
    let s = deploy_fee_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_trade_fee(301, 5_000);
}

#[test]
fn a_three_percent_fee_is_allowed() {
    let s = deploy_fee_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_trade_fee(300, 5_000);
    let (fee, _) = s.factory.trade_fee();
    assert(fee == 300, 'cap value allowed');
}

#[test]
#[should_panic(expected: 'FACTORY_BAD_FEE_SHARE')]
fn the_creator_share_cannot_exceed_the_whole_fee() {
    let s = deploy_fee_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_trade_fee(100, 10_001);
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn only_the_owner_can_change_the_trade_fee() {
    let s = deploy_fee_setup();
    start_cheat_caller_address(s.factory.contract_address, ALICE());
    s.factory.set_trade_fee(0, 0);
}

#[test]
fn the_fee_can_be_switched_off_for_future_launches() {
    let s = deploy_fee_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_trade_fee(0, 0);
    stop_cheat_caller_address(s.factory.contract_address);
    let (_, curve) = launch_strk(s, 1, 0);
    let (total, _) = buy_as(curve, ALICE(), 100 * ONE);
    assert(total == 100 * ONE, 'no fee');
}

#[test]
fn a_curve_refuses_a_fee_above_the_cap_even_if_deployed_directly() {
    // The factory checks the cap, and so does every curve, so the limit does not depend on the
    // factory staying honest.
    let s = deploy_fee_setup();
    let curve_class = declare("BondingCurve").unwrap().contract_class();
    let mut calldata: Array<felt252> = array![];
    let token: ContractAddress = 'some_token'.try_into().unwrap();
    token.serialize(ref calldata);
    s.strk.contract_address.serialize(ref calldata);
    CREATOR().serialize(ref calldata);
    CURVE_SUPPLY.serialize(ref calldata);
    (200_000_000 * ONE * 1_000_000_000).serialize(ref calldata);
    STRK_RAISE.serialize(ref calldata);
    STRK_RAISE.serialize(ref calldata);
    s.factory.contract_address.serialize(ref calldata);
    let too_high: u16 = 301;
    too_high.serialize(ref calldata);
    let share: u16 = 5_000;
    share.serialize(ref calldata);
    assert(curve_class.deploy(@calldata).is_err(), 'a 3.01 percent curve deployed');
}

// ------------------------------------------------------------------ plain getters

#[test]
fn the_factory_and_curve_report_how_they_are_wired() {
    let s = deploy_fee_setup();
    assert(!s.factory.launches_paused(), 'not paused at the start');
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_launches_paused(true);
    stop_cheat_caller_address(s.factory.contract_address);
    assert(s.factory.launches_paused(), 'paused after being paused');

    let (token_class, curve_class) = s.factory.class_hashes();
    assert(token_class.into() != 0_felt252 && curve_class.into() != 0_felt252, 'class hashes recorded');
    assert(token_class != curve_class, 'two different classes');

    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_launches_paused(false);
    stop_cheat_caller_address(s.factory.contract_address);
    let (_, curve) = launch_strk(s, 1, 0);
    assert(curve.factory() == s.factory.contract_address, 'curve knows its factory');
}


// ------------------------------------------------- deploy fee paid in USDC, curve trades in STRK

#[test]
fn paying_the_fee_in_usdc_still_makes_a_strk_curve() {
    let s = deploy_setup();
    let usdc_before = s.usdc.balance_of(CREATOR());
    let strk_before = s.strk.balance_of(CREATOR());
    let (token, curve) = launch_paying_in(s, s.usdc, PAY_USDC_FEE, 1, 200);

    // The token trades in STRK, never in USDC.
    assert(curve.quote_token() == s.strk.contract_address, 'curve must trade in strk');
    assert(token.total_supply() == TOTAL_SUPPLY, 'supply not fixed');
    assert(token.balance_of(s.factory.contract_address) == 0, 'factory kept tokens');
    assert(s.factory.curve_of(token.contract_address) == curve.contract_address, 'registry');

    // The fee went to the treasury in USDC. The creator's STRK was not touched.
    assert(s.usdc.balance_of(TREASURY()) == PAY_USDC_FEE, 'treasury usdc fee');
    assert(s.usdc.balance_of(CREATOR()) == usdc_before - PAY_USDC_FEE, 'creator usdc charge');
    assert(s.strk.balance_of(TREASURY()) == 0, 'no strk charged');
    assert(s.strk.balance_of(CREATOR()) == strk_before, 'creator strk untouched');
    assert(s.usdc.balance_of(s.factory.contract_address) == 0, 'factory kept usdc');
    // The curve holds no USDC at all.
    assert(s.usdc.balance_of(curve.contract_address) == 0, 'curve holds usdc');
}

#[test]
fn paying_the_fee_in_strk_charges_the_strk_fee() {
    let s = deploy_setup();
    let strk_before = s.strk.balance_of(CREATOR());
    let (_, curve) = launch_paying_in(s, s.strk, PAY_STRK_FEE, 1, 0);
    assert(curve.quote_token() == s.strk.contract_address, 'strk curve');
    assert(s.strk.balance_of(TREASURY()) == PAY_STRK_FEE, 'treasury strk fee');
    assert(s.strk.balance_of(CREATOR()) == strk_before - PAY_STRK_FEE, 'creator charged');
    assert(s.usdc.balance_of(TREASURY()) == 0, 'no usdc charged');
}

#[test]
fn a_usdc_paid_launch_uses_the_strk_raise_and_graduates_in_strk() {
    let s = deploy_setup();
    let (token, curve) = launch_paying_in(s, s.usdc, PAY_USDC_FEE, 1, 0);
    assert(curve.get_state().curve_supply == CURVE_SUPPLY, 'curve supply');
    // Alice offers far more STRK than the curve needs; it takes about the STRK raise and no USDC.
    let usdc_before = s.usdc.balance_of(ALICE());
    let (spent, tokens) = buy_as(curve, ALICE(), 5_000 * ONE);
    assert(spent <= STRK_RAISE && spent + 10 >= STRK_RAISE, 'should cost the strk raise');
    assert(curve.get_state().graduated, 'should have graduated');
    assert(token.balance_of(ALICE()) == tokens, 'alice got tokens');
    assert(s.usdc.balance_of(ALICE()) == usdc_before, 'usdc untouched by trading');
}

#[test]
fn trading_fees_on_a_usdc_paid_launch_accrue_in_strk() {
    let s = deploy_fee_setup();
    let (_, curve) = launch_paying_in(s, s.usdc, PAY_USDC_FEE, 1, 0);
    // 101 STRK budget: 100 into the curve and 1 STRK of fee, half to each side.
    let (total, _) = buy_as(curve, ALICE(), 101 * ONE);
    assert(total == 101 * ONE, 'paid 101 strk');
    let state = curve.get_state();
    assert(state.creator_fees == ONE / 2 && state.platform_fees == ONE / 2, 'half a strk each');
    let before = s.strk.balance_of(CREATOR());
    let paid = curve.claim_creator_fees();
    assert(paid == ONE / 2, 'creator claimed 0.5 strk');
    assert(s.strk.balance_of(CREATOR()) == before + ONE / 2, 'creator holds strk');
    assert(s.usdc.balance_of(curve.contract_address) == 0, 'curve holds no usdc');
}

#[test]
fn launch_created_reports_the_fee_asset_and_the_strk_curve() {
    let s = deploy_fee_setup();
    let mut spy = spy_events();
    let (token, curve) = launch_paying_in(s, s.usdc, PAY_USDC_FEE, 2, 0);
    spy
        .assert_emitted(
            @array![
                (
                    s.factory.contract_address,
                    TokenFactory::Event::LaunchCreated(
                        TokenFactory::LaunchCreated {
                            creator: CREATOR(),
                            token: token.contract_address,
                            curve: curve.contract_address,
                            quote_token: s.strk.contract_address,
                            launch_id: 0,
                            name: "Cairo Builders",
                            symbol: "CAIRO",
                            metadata_uri: "ipfs://meta",
                            preset: 2,
                            creator_bps: 0,
                            graduation_raise: STRK_RAISE,
                            deploy_fee: PAY_USDC_FEE,
                            trade_fee_bps: 100,
                            creator_fee_share_bps: 5_000,
                            fee_token: s.usdc.contract_address,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn fee_assets_report_their_fee_and_decimals() {
    let s = deploy_setup();
    let strk = s.factory.fee_asset_config(s.strk.contract_address);
    let usdc = s.factory.fee_asset_config(s.usdc.contract_address);
    assert(strk.enabled && usdc.enabled, 'both enabled');
    assert(strk.unit == ONE && usdc.unit == USDC_ONE, 'units read from tokens');
    assert(strk.deploy_fee == PAY_STRK_FEE && usdc.deploy_fee == PAY_USDC_FEE, 'fees');
    assert(!s.factory.fee_asset_config('nobody'.try_into().unwrap()).enabled, 'unknown disabled');
    assert(s.factory.default_quote_token() == s.strk.contract_address, 'default quote is strk');
}

#[test]
#[should_panic(expected: 'FACTORY_FEE_ASSET_NOT_ALLOWED')]
fn paying_in_an_unlisted_asset_is_rejected() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch_paying_in("Name", "SYM", "", 'rando'.try_into().unwrap(), 1, 0);
}

#[test]
#[should_panic(expected: 'ERC20: insufficient allowance')]
fn paying_in_usdc_without_approving_usdc_fails() {
    // A STRK approval does not pay a USDC fee.
    let s = deploy_setup();
    start_cheat_caller_address(s.strk.contract_address, CREATOR());
    s.strk.approve(s.factory.contract_address, 1_000 * ONE);
    stop_cheat_caller_address(s.strk.contract_address);
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch_paying_in("Cairo Builders", "CAIRO", "", s.usdc.contract_address, 1, 0);
}

#[test]
#[should_panic(expected: 'FACTORY_FEE_ASSET_NOT_ALLOWED')]
fn a_disabled_fee_asset_cannot_pay_for_launches() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_fee_asset(s.usdc.contract_address, false, 0);
    stop_cheat_caller_address(s.factory.contract_address);
    assert(!s.factory.fee_asset_config(s.usdc.contract_address).enabled, 'disabled');
    assert(s.factory.fee_asset_config(s.usdc.contract_address).deploy_fee == PAY_USDC_FEE, 'fee kept');
    launch_paying_in(s, s.usdc, PAY_USDC_FEE, 1, 0);
}

#[test]
fn owner_can_reprice_the_usdc_fee_without_touching_strk() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_fee_asset(s.usdc.contract_address, true, 3 * USDC_ONE);
    stop_cheat_caller_address(s.factory.contract_address);
    assert(s.factory.fee_asset_config(s.usdc.contract_address).deploy_fee == 3 * USDC_ONE, 'usdc fee');
    assert(s.factory.fee_asset_config(s.strk.contract_address).deploy_fee == PAY_STRK_FEE, 'strk fee');
    launch_paying_in(s, s.usdc, 3 * USDC_ONE, 1, 0);
    assert(s.usdc.balance_of(TREASURY()) == 3 * USDC_ONE, 'new fee charged');
}

#[test]
fn a_zero_fee_is_allowed_and_charges_nothing() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_fee_asset(s.usdc.contract_address, true, 0);
    stop_cheat_caller_address(s.factory.contract_address);
    let before = s.usdc.balance_of(CREATOR());
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch_paying_in("Free", "FREE", "", s.usdc.contract_address, 1, 0);
    assert(s.usdc.balance_of(CREATOR()) == before, 'nothing charged');
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn only_the_owner_can_set_fee_assets() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, ALICE());
    s.factory.set_fee_asset(s.usdc.contract_address, true, 0);
}

#[test]
#[should_panic(expected: 'FACTORY_FEE_TOO_HIGH')]
fn a_usdc_fee_cannot_exceed_100_usdc_when_paying_in() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_fee_asset(s.usdc.contract_address, true, MAX_DEPLOY_FEE_UNITS * USDC_ONE + 1);
}

#[test]
fn a_fee_asset_fee_exactly_at_the_cap_is_allowed() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_fee_asset(s.usdc.contract_address, true, MAX_DEPLOY_FEE_UNITS * USDC_ONE);
    assert(
        s.factory.fee_asset_config(s.usdc.contract_address).deploy_fee == MAX_DEPLOY_FEE_UNITS * USDC_ONE,
        'cap fee',
    );
}

#[test]
#[should_panic(expected: 'FACTORY_LAUNCHES_PAUSED')]
fn pausing_launches_also_stops_launches_paid_in_usdc() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_launches_paused(true);
    stop_cheat_caller_address(s.factory.contract_address);
    launch_paying_in(s, s.usdc, PAY_USDC_FEE, 1, 0);
}

#[test]
fn setting_a_fee_asset_announces_it_for_the_indexer() {
    let s = deploy_setup();
    let mut spy = spy_events();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_fee_asset(s.usdc.contract_address, true, 5 * USDC_ONE);
    s.factory.set_fee_asset(s.usdc.contract_address, false, 0);
    spy
        .assert_emitted(
            @array![
                (
                    s.factory.contract_address,
                    TokenFactory::Event::FeeAssetSet(
                        TokenFactory::FeeAssetSet {
                            fee_token: s.usdc.contract_address, enabled: true, deploy_fee: 5 * USDC_ONE,
                        },
                    ),
                ),
                (
                    s.factory.contract_address,
                    TokenFactory::Event::FeeAssetSet(
                        TokenFactory::FeeAssetSet {
                            fee_token: s.usdc.contract_address, enabled: false, deploy_fee: 5 * USDC_ONE,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn the_default_quote_asset_must_be_a_listed_quote_asset() {
    let strk_class = declare("MockSTRK").unwrap().contract_class();
    let (strk_address, _) = strk_class.deploy(@array![]).unwrap();
    let token_class = *declare("OryvnToken").unwrap().contract_class().class_hash;
    let curve_class = *declare("BondingCurve").unwrap().contract_class().class_hash;
    let factory_class = declare("TokenFactory").unwrap().contract_class();

    let mut calldata: Array<felt252> = array![];
    OWNER().serialize(ref calldata);
    TREASURY().serialize(ref calldata);
    token_class.serialize(ref calldata);
    curve_class.serialize(ref calldata);
    array![QuoteInit { token: strk_address, deploy_fee: STRK_FEE, graduation_raise: STRK_RAISE }]
        .serialize(ref calldata);
    0_u16.serialize(ref calldata);
    0_u16.serialize(ref calldata);
    // The default points at something that was never listed as a quote asset.
    let unlisted: ContractAddress = 'unlisted'.try_into().unwrap();
    unlisted.serialize(ref calldata);
    array![FeeAssetInit { token: strk_address, deploy_fee: PAY_STRK_FEE }].serialize(ref calldata);
    match factory_class.deploy(@calldata) {
        Result::Ok(_) => panic!("deploy should have been refused"),
        Result::Err(reason) => assert(*reason.at(0) == 'FACTORY_BAD_DEFAULT_QUOTE', 'wrong refusal'),
    }
}

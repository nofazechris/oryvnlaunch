use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use crate::curve::BondingCurve;
use crate::factory::TokenFactory;
use crate::factory::TokenFactory::{MAX_DEPLOY_FEE_UNITS, TOTAL_SUPPLY};
use crate::interfaces::{
    IBondingCurveDispatcher, IBondingCurveDispatcherTrait, ITokenFactoryDispatcher,
    ITokenFactoryDispatcherTrait, QuoteInit,
};
use crate::mock_strk::{IMockMintDispatcher, IMockMintDispatcherTrait};

// STRK has 18 decimals, USDC has 6. Every behaviour below is checked against both.
const ONE: u256 = 1_000_000_000_000_000_000; // 1 STRK
const USDC_ONE: u256 = 1_000_000; // 1 USDC

const STRK_RAISE: u256 = 1_000_000_000_000_000_000_000; // 1,000 STRK to graduate
const STRK_FEE: u256 = 10_000_000_000_000_000_000; // 10 STRK deploy fee
const USDC_RAISE: u256 = 10_000_000_000; // 10,000 USDC to graduate
const USDC_FEE: u256 = 15_000_000; // 15 USDC deploy fee (USDC launches cost more)
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

fn deploy_setup() -> Setup {
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
    let s = deploy_setup();
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
fn usdc_curve_keeps_selling_open_after_graduation() {
    let s = deploy_setup();
    let (token, curve) = launch_usdc(s, 1, 0);
    let (spent, tokens) = buy_as(curve, ALICE(), 50_000 * USDC_ONE);
    assert(curve.get_state().graduated, 'not graduated');

    let out = sell_as(token, curve, ALICE(), tokens / 2);
    assert(out > 0 && out < spent, 'sell after graduation');
    let (spend, got, _) = curve.quote_buy(10 * USDC_ONE);
    assert(spend == 0 && got == 0, 'buying stays frozen');
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
#[should_panic(expected: 'CURVE_GRADUATED')]
fn buying_is_frozen_after_graduation() {
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

    let half = tokens / 2;
    let out = sell_as(token, curve, ALICE(), half);
    assert(out > 0 && out < spent, 'sell after graduation');
    assert(curve.get_state().graduated, 'graduation should stick');
    let (spend, got, _) = curve.quote_buy(10 * ONE);
    assert(spend == 0 && got == 0, 'quote should be empty');
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

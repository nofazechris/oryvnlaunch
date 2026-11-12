use openzeppelin_interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{
    ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, declare, spy_events,
    start_cheat_caller_address, stop_cheat_caller_address,
};
use starknet::ContractAddress;
use crate::curve::BondingCurve;
use crate::factory::TokenFactory;
use crate::factory::TokenFactory::{MAX_DEPLOY_FEE, TOTAL_SUPPLY};
use crate::interfaces::{
    IBondingCurveDispatcher, IBondingCurveDispatcherTrait, ITokenFactoryDispatcher,
    ITokenFactoryDispatcherTrait,
};
use crate::mock_strk::{IMockMintDispatcher, IMockMintDispatcherTrait};

const ONE: u256 = 1_000_000_000_000_000_000;
const RAISE: u256 = 1_000_000_000_000_000_000_000; // 1,000 STRK to graduate
const FEE: u256 = 10_000_000_000_000_000_000; // 10 STRK deploy fee
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
    factory: ITokenFactoryDispatcher,
}

fn deploy_setup() -> Setup {
    let strk_class = declare("MockSTRK").unwrap().contract_class();
    let (strk_address, _) = strk_class.deploy(@array![]).unwrap();

    let token_class = *declare("OryvnToken").unwrap().contract_class().class_hash;
    let curve_class = *declare("BondingCurve").unwrap().contract_class().class_hash;
    let factory_class = declare("TokenFactory").unwrap().contract_class();

    let mut calldata: Array<felt252> = array![];
    OWNER().serialize(ref calldata);
    strk_address.serialize(ref calldata);
    TREASURY().serialize(ref calldata);
    token_class.serialize(ref calldata);
    curve_class.serialize(ref calldata);
    FEE.serialize(ref calldata);
    RAISE.serialize(ref calldata);
    let (factory_address, _) = factory_class.deploy(@calldata).unwrap();

    // Everyone gets 100k STRK to play with.
    let minter = IMockMintDispatcher { contract_address: strk_address };
    let hundred_k = 100_000 * ONE;
    minter.mint(CREATOR(), hundred_k);
    minter.mint(ALICE(), hundred_k);
    minter.mint(BOB(), hundred_k);

    Setup {
        strk: IERC20Dispatcher { contract_address: strk_address },
        factory: ITokenFactoryDispatcher { contract_address: factory_address },
    }
}

/// CREATOR approves the fee and launches. Returns (token, curve).
fn launch(s: Setup, preset: u8, creator_bps: u16) -> (IERC20Dispatcher, IBondingCurveDispatcher) {
    start_cheat_caller_address(s.strk.contract_address, CREATOR());
    s.strk.approve(s.factory.contract_address, FEE);
    stop_cheat_caller_address(s.strk.contract_address);

    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    let (token, curve) = s
        .factory
        .create_launch("Cairo Builders", "CAIRO", "ipfs://meta", preset, creator_bps);
    stop_cheat_caller_address(s.factory.contract_address);

    (IERC20Dispatcher { contract_address: token }, IBondingCurveDispatcher { contract_address: curve })
}

fn buy_as(
    s: Setup, curve: IBondingCurveDispatcher, who: ContractAddress, strk_in: u256,
) -> (u256, u256) {
    start_cheat_caller_address(s.strk.contract_address, who);
    s.strk.approve(curve.contract_address, strk_in);
    stop_cheat_caller_address(s.strk.contract_address);

    start_cheat_caller_address(curve.contract_address, who);
    let result = curve.buy(strk_in, 0);
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
fn launch_splits_supply_charges_fee_and_leaves_factory_empty() {
    let s = deploy_setup();
    let creator_before = s.strk.balance_of(CREATOR());
    let (token, curve) = launch(s, 1, 300); // 3% creator allocation

    // Fixed supply, fully accounted for.
    assert(token.total_supply() == TOTAL_SUPPLY, 'supply not fixed');
    let creator_amount = TOTAL_SUPPLY * 300 / 10_000;
    assert(token.balance_of(CREATOR()) == creator_amount, 'creator allocation');
    assert(token.balance_of(curve.contract_address) == TOTAL_SUPPLY - creator_amount, 'curve funding');
    assert(token.balance_of(s.factory.contract_address) == 0, 'factory kept tokens');

    // The deploy fee went to the treasury, not the factory.
    assert(s.strk.balance_of(TREASURY()) == FEE, 'treasury not paid');
    assert(s.strk.balance_of(CREATOR()) == creator_before - FEE, 'creator charged wrong');
    assert(s.strk.balance_of(s.factory.contract_address) == 0, 'factory kept strk');

    // Registry and curve metadata.
    assert(s.factory.launch_count() == 1, 'launch count');
    assert(s.factory.curve_of(token.contract_address) == curve.contract_address, 'registry');
    assert(curve.token() == token.contract_address, 'curve token');
    assert(curve.creator() == CREATOR(), 'curve creator');

    let state = curve.get_state();
    assert(state.curve_supply == CURVE_SUPPLY, 'curve supply');
    assert(state.reserved_supply == TOTAL_SUPPLY - CURVE_SUPPLY - creator_amount, 'reserved');
    assert(state.tokens_sold == 0 && state.strk_raised == 0 && !state.graduated, 'fresh state');
}

#[test]
fn launch_emits_everything_the_indexer_needs() {
    let s = deploy_setup();
    let mut spy = spy_events();
    let (token, curve) = launch(s, 2, 0);

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
                            launch_id: 0,
                            name: "Cairo Builders",
                            symbol: "CAIRO",
                            metadata_uri: "ipfs://meta",
                            preset: 2,
                            creator_bps: 0,
                            graduation_raise: RAISE,
                            deploy_fee: FEE,
                        },
                    ),
                ),
            ],
        );
}

#[test]
fn two_launches_get_separate_addresses() {
    let s = deploy_setup();
    let (token_a, curve_a) = launch(s, 0, 0);
    let (token_b, curve_b) = launch(s, 0, 0);
    assert(token_a.contract_address != token_b.contract_address, 'same token');
    assert(curve_a.contract_address != curve_b.contract_address, 'same curve');
    assert(s.factory.launch_count() == 2, 'count');
}

#[test]
#[should_panic(expected: 'FACTORY_CREATOR_CAP')]
fn creator_allocation_is_capped_at_five_percent() {
    let s = deploy_setup();
    launch(s, 1, 501);
}

#[test]
#[should_panic(expected: 'FACTORY_BAD_PRESET')]
fn unknown_preset_is_rejected() {
    let s = deploy_setup();
    launch(s, 3, 0);
}

#[test]
#[should_panic(expected: 'FACTORY_BAD_SYMBOL')]
fn empty_symbol_is_rejected() {
    let s = deploy_setup();
    start_cheat_caller_address(s.strk.contract_address, CREATOR());
    s.strk.approve(s.factory.contract_address, FEE);
    stop_cheat_caller_address(s.strk.contract_address);
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch("Name", "", "", 1, 0);
}

#[test]
#[should_panic(expected: 'ERC20: insufficient allowance')]
fn launch_without_approving_the_fee_fails() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch("Cairo Builders", "CAIRO", "", 1, 0);
}

#[test]
fn owner_can_change_the_fee_and_it_applies_to_new_launches() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_deploy_fee(2 * FEE);
    stop_cheat_caller_address(s.factory.contract_address);
    assert(s.factory.deploy_fee() == 2 * FEE, 'fee not updated');

    start_cheat_caller_address(s.strk.contract_address, CREATOR());
    s.strk.approve(s.factory.contract_address, 2 * FEE);
    stop_cheat_caller_address(s.strk.contract_address);
    start_cheat_caller_address(s.factory.contract_address, CREATOR());
    s.factory.create_launch("Cairo Builders", "CAIRO", "", 1, 0);
    assert(s.strk.balance_of(TREASURY()) == 2 * FEE, 'new fee not charged');
}

#[test]
#[should_panic(expected: 'FACTORY_FEE_TOO_HIGH')]
fn fee_cannot_exceed_the_hard_cap() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_deploy_fee(MAX_DEPLOY_FEE + 1);
}

#[test]
#[should_panic(expected: 'Caller is not the owner')]
fn only_the_owner_can_set_the_fee() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, ALICE());
    s.factory.set_deploy_fee(0);
}

#[test]
#[should_panic(expected: 'FACTORY_LAUNCHES_PAUSED')]
fn paused_factory_rejects_launches() {
    let s = deploy_setup();
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_launches_paused(true);
    stop_cheat_caller_address(s.factory.contract_address);
    launch(s, 1, 0);
}

#[test]
fn pausing_launches_does_not_stop_trading_on_existing_curves() {
    let s = deploy_setup();
    let (_, curve) = launch(s, 1, 0);
    start_cheat_caller_address(s.factory.contract_address, OWNER());
    s.factory.set_launches_paused(true);
    stop_cheat_caller_address(s.factory.contract_address);

    let (_, tokens) = buy_as(s, curve, ALICE(), 50 * ONE);
    assert(tokens > 0, 'trading blocked by pause');
}

// ------------------------------------------------------------------ curve

#[test]
fn buy_pays_strk_and_delivers_the_quoted_tokens() {
    let s = deploy_setup();
    let (token, curve) = launch(s, 1, 0);
    let spend = 100 * ONE;
    let (quoted_spend, quoted_tokens, _) = curve.quote_buy(spend);

    let before = s.strk.balance_of(ALICE());
    let (spent, tokens) = buy_as(s, curve, ALICE(), spend);

    assert(spent == quoted_spend && tokens == quoted_tokens, 'quote != trade');
    assert(token.balance_of(ALICE()) == tokens, 'tokens not delivered');
    assert(s.strk.balance_of(ALICE()) == before - spent, 'strk not charged');
    assert(s.strk.balance_of(curve.contract_address) == spent, 'curve strk');

    let state = curve.get_state();
    assert(state.tokens_sold == tokens && state.strk_raised == spent, 'state not updated');
    assert(!state.graduated, 'graduated too early');
}

#[test]
fn price_rises_as_people_buy() {
    let s = deploy_setup();
    let (_, curve) = launch(s, 1, 0);
    let p0 = curve.spot_price();
    buy_as(s, curve, ALICE(), 100 * ONE);
    let p1 = curve.spot_price();
    buy_as(s, curve, BOB(), 100 * ONE);
    let p2 = curve.spot_price();
    assert(p1 > p0 && p2 > p1, 'price should climb');
}

#[test]
fn selling_everything_back_returns_at_most_what_was_paid() {
    let s = deploy_setup();
    let (token, curve) = launch(s, 1, 0);
    let (spent, tokens) = buy_as(s, curve, ALICE(), 200 * ONE);
    let out = sell_as(token, curve, ALICE(), tokens);

    assert(out <= spent, 'seller profited from nothing');
    assert(spent - out < 1_000, 'round trip lost too much');
    assert(token.balance_of(ALICE()) == 0, 'tokens not taken');
    // The curve is back to (almost) where it started.
    let state = curve.get_state();
    assert(state.tokens_sold == 0, 'sold not reset');
    assert(state.strk_raised == spent - out, 'raised should be dust');
}

#[test]
fn a_later_buyer_exits_at_a_higher_price_than_an_earlier_one_entered() {
    let s = deploy_setup();
    let (token, curve) = launch(s, 1, 0);
    let (alice_spent, alice_tokens) = buy_as(s, curve, ALICE(), 100 * ONE);
    let (_, _) = buy_as(s, curve, BOB(), 300 * ONE);
    let alice_out = sell_as(token, curve, ALICE(), alice_tokens);
    assert(alice_out > alice_spent, 'early buyer should profit');
}

#[test]
#[should_panic(expected: 'CURVE_SLIPPAGE')]
fn buy_reverts_when_slippage_limit_is_not_met() {
    let s = deploy_setup();
    let (_, curve) = launch(s, 1, 0);
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
    let (token, curve) = launch(s, 1, 0);
    let (_, tokens) = buy_as(s, curve, ALICE(), 100 * ONE);
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
    let (_, curve) = launch(s, 1, 0);
    start_cheat_caller_address(curve.contract_address, ALICE());
    curve.buy(0, 0);
}

#[test]
#[should_panic(expected: 'CURVE_SELL_EXCEEDS_SOLD')]
fn cannot_sell_more_than_the_curve_has_sold() {
    // The creator's allocation did not come out of the curve, so even a creator holding
    // 5% cannot dump it into a curve that has sold nothing.
    let s = deploy_setup();
    let (token, curve) = launch(s, 1, 500);
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
    let (_, curve) = launch(s, 1, 0);
    start_cheat_caller_address(curve.contract_address, ALICE());
    curve.buy(10 * ONE, 0);
}

#[test]
fn buying_emits_a_trade_event_with_post_trade_reserves() {
    let s = deploy_setup();
    let (_, curve) = launch(s, 1, 0);
    let mut spy = spy_events();
    let (spent, tokens) = buy_as(s, curve, ALICE(), 100 * ONE);
    let state = curve.get_state();

    spy
        .assert_emitted(
            @array![
                (
                    curve.contract_address,
                    BondingCurve::Event::TokensBought(
                        BondingCurve::TokensBought {
                            buyer: ALICE(),
                            strk_in: spent,
                            tokens_out: tokens,
                            strk_reserve: state.strk_reserve,
                            token_reserve: state.token_reserve,
                        },
                    ),
                ),
            ],
        );
}

// ------------------------------------------------------------- graduation

#[test]
fn filling_the_curve_graduates_it_and_only_charges_what_is_needed() {
    let s = deploy_setup();
    let (token, curve) = launch(s, 1, 0);

    // Alice offers far more than the curve needs. She is only charged ~1,000 STRK.
    let offered = 5_000 * ONE;
    let before = s.strk.balance_of(ALICE());
    let mut spy = spy_events();
    let (spent, tokens) = buy_as(s, curve, ALICE(), offered);

    assert(tokens == CURVE_SUPPLY, 'should take whole curve');
    assert(spent < RAISE + 1_000 && spent + 1_000 > RAISE, 'should cost the raise');
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
                            strk_raised: state.strk_raised, tokens_sold: state.tokens_sold,
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
    let (_, curve) = launch(s, 1, 0);
    buy_as(s, curve, ALICE(), 5_000 * ONE);
    buy_as(s, curve, BOB(), 10 * ONE);
}

#[test]
fn selling_stays_open_after_graduation() {
    let s = deploy_setup();
    let (token, curve) = launch(s, 1, 0);
    let (spent, tokens) = buy_as(s, curve, ALICE(), 5_000 * ONE);
    assert(curve.get_state().graduated, 'not graduated');

    // A holder can still exit, and buying stays frozen.
    let half = tokens / 2;
    let out = sell_as(token, curve, ALICE(), half);
    assert(out > 0 && out < spent, 'sell after graduation');
    assert(curve.get_state().graduated, 'graduation should stick');
    let (spend, got, _) = curve.quote_buy(10 * ONE);
    assert(spend == 0 && got == 0, 'quote should be empty');
}

#[test]
fn every_preset_graduates_at_the_same_raise() {
    let s = deploy_setup();
    let mut preset: u8 = 0;
    while preset <= 2 {
        let (_, curve) = launch(s, preset, 0);
        let (spent, _) = buy_as(s, curve, ALICE(), 5_000 * ONE);
        assert(spent < RAISE + 1_000 && spent + 1_000 > RAISE, 'raise differs by preset');
        preset += 1;
    };
}

#[test]
fn steeper_presets_start_cheaper_and_end_pricier() {
    let s = deploy_setup();
    let (_, gentle) = launch(s, 0, 0);
    let (_, steep) = launch(s, 2, 0);
    // Same raise and same supply: the steep curve opens at a lower price...
    assert(steep.spot_price() < gentle.spot_price(), 'steep should open cheaper');
    // ...and finishes at a higher one.
    buy_as(s, gentle, ALICE(), 5_000 * ONE);
    buy_as(s, steep, BOB(), 5_000 * ONE);
    assert(steep.spot_price() > gentle.spot_price(), 'steep should end pricier');
}

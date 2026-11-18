#!/usr/bin/env bash
# End-to-end smoke test against a LOCAL devnet. It uses the factory that
# `scripts/deploy.sh` wrote to deployments/devnet.json, then does a real launch on a real
# node: pay the deploy fee, deploy token + curve, buy, sell, graduate, check the curve keeps trading
# both ways afterwards, and claim the 1% trading fees.
#
# Why this exists on top of `snforge test`: the unit tests run in a simulator. This runs the
# compiled, declared contracts through an actual node, including the factory deploying two
# contracts from inside one transaction.
#
#   scripts/devnet.sh start      (terminal 1)
#   scripts/devnet.sh accounts   (once)
#   ACCOUNT=devnet-deployer FACTORY_OWNER=<addr> FEE_RECIPIENT=<addr> NETWORK=devnet \
#     RPC_URL=http://127.0.0.1:5050/rpc ACCOUNTS_FILE=devnet-accounts.json scripts/deploy.sh --yes
#   scripts/smoke.sh
#
# Devnet only: it spends the throwaway devnet accounts and refuses any other RPC. Devnet has
# no USDC, so this exercises the STRK-fee path on a real node; paying the fee in USDC (6 decimals) is covered
# by `snforge test` and, on Sepolia, by launching with Circle's testnet USDC.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$HOME/.asdf/shims:$PATH"
URL="http://127.0.0.1:5050/rpc"
ACCOUNTS_FILE="devnet-accounts.json"
STRK="0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
CREATOR="devnet-deployer"
BUYER="devnet-user"

die() { echo "FAIL: $*" >&2; exit 1; }
curl -sf "http://127.0.0.1:5050/is_alive" >/dev/null || die "no devnet on 127.0.0.1:5050 (scripts/devnet.sh start)"
[ -f deployments/devnet.json ] || die "no deployments/devnet.json (run scripts/deploy.sh against devnet first)"
[ -f "$ACCOUNTS_FILE" ] || die "no $ACCOUNTS_FILE (run scripts/devnet.sh accounts)"

FACTORY="$(python3 -c "import json; print(json.load(open('deployments/devnet.json'))['factory']['address'])")"
FEE_RECIPIENT="$(python3 -c "import json; print(json.load(open('deployments/devnet.json'))['feeRecipient'])")"
FEE_WEI="$(python3 -c "import json; print(json.load(open('deployments/devnet.json'))['quoteTokens']['STRK']['deployFeeUnits'])")"
account_address() {
  python3 -c "import json, sys; d = json.load(open('$ACCOUNTS_FILE')); print(next(iter(d.values()))[sys.argv[1]]['address'])" "$1"
}
CREATOR_ADDR="$(account_address "$CREATOR")"
BUYER_ADDR="$(account_address "$BUYER")"

last_json() { grep -E '"type":"response"' | tail -n 1; }
call_raw() { # contract function [arguments]  -> space separated felts
  local out
  out="$(sncast --json call --url "$URL" --contract-address "$1" --function "$2" ${3:+--arguments "$3"} 2>&1 | last_json)" \
    || die "call $2 failed"
  [ -n "$out" ] || die "call $2 returned nothing"
  printf '%s' "$out" | python3 -c "import sys, json; print(' '.join(json.loads(sys.stdin.read())['response_raw']))"
}
u256_of() { python3 -c "import sys; print(int(sys.argv[1], 0) + (int(sys.argv[2], 0) << 128))" "$1" "$2"; }
balance() { # token holder -> integer
  local raw; raw="$(call_raw "$1" balance_of "$2")"
  # shellcheck disable=SC2086
  u256_of $raw
}
send() { # account contract function arguments
  local out
  out="$(sncast --accounts-file "$ACCOUNTS_FILE" --account "$1" --json invoke --url "$URL" \
    --contract-address "$2" --function "$3" ${4:+--arguments "$4"} 2>&1)" || { echo "$out" >&2; return 1; }
  printf '%s\n' "$out" | last_json | python3 -c "import sys, json; print(json.loads(sys.stdin.read()).get('transaction_hash', ''))"
}
ok() { echo "   ok  $*"; }
# Bash integers are 64-bit and 10 STRK is 1e19 wei, so all amount maths goes through python.
py() { python3 -c "print(int($1))"; }
true_that() { python3 -c "import sys; sys.exit(0 if ($1) else 1)"; }
STRK_UNIT=1000000000000000000
S1="$STRK_UNIT"
S50="$(py "50 * $STRK_UNIT")"
S505="$(py "505 * $STRK_UNIT // 10")"   # 50.5: 50 into the curve plus a 0.5 fee at 1%
S5000="$(py "5000 * $STRK_UNIT")"

# One u256 field of get_state, by the position of its low felt. Layout: quote_reserve 0, token_reserve 2,
# quote_raised 4, tokens_sold 6, curve_supply 8, reserved_supply 10, graduated 12, trade_fee_bps 13,
# creator_fee_share_bps 14, creator_fees 15, platform_fees 17.
state_u256() {
  local raw; raw="$(call_raw "$CURVE" get_state)"
  # shellcheck disable=SC2086
  python3 -c "import sys; f = sys.argv[2:]; i = int(sys.argv[1]); print(int(f[i], 0) + (int(f[i + 1], 0) << 128))" "$1" $raw
}

echo ">> factory $FACTORY"

echo ">> 1. launch (pays the deploy fee)"
TREASURY_BEFORE="$(balance "$STRK" "$FEE_RECIPIENT")"
COUNT_BEFORE="$(python3 -c "import sys; print(int(sys.argv[1], 0))" "$(call_raw "$FACTORY" launch_count)")"
send "$CREATOR" "$STRK" approve "$FACTORY, ${FEE_WEI}_u256" >/dev/null || die "approve fee"
send "$CREATOR" "$FACTORY" create_launch_paying_in "\"Smoke Test\", \"SMOKE\", \"ipfs://smoke\", $STRK, 1_u8, 200_u16" >/dev/null || die "create_launch_paying_in"
TREASURY_AFTER="$(balance "$STRK" "$FEE_RECIPIENT")"
COUNT_AFTER="$(python3 -c "import sys; print(int(sys.argv[1], 0))" "$(call_raw "$FACTORY" launch_count)")"
true_that "$TREASURY_AFTER - $TREASURY_BEFORE == $FEE_WEI" || die "treasury got $(py "$TREASURY_AFTER - $TREASURY_BEFORE"), expected $FEE_WEI"
ok "treasury received the deploy fee ($FEE_WEI wei)"
[ "$COUNT_AFTER" = "$(py "$COUNT_BEFORE + 1")" ] || die "launch count $COUNT_BEFORE -> $COUNT_AFTER"
ok "launch count $COUNT_BEFORE -> $COUNT_AFTER"

# Find the new token and curve from the factory's last event (LaunchCreated).
read -r TOKEN CURVE < <(curl -sf -X POST "$URL" -H 'content-type: application/json' -d "{
  \"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"starknet_getEvents\",
  \"params\":{\"filter\":{\"from_block\":{\"block_number\":0},\"to_block\":\"latest\",\"address\":\"$FACTORY\",\"chunk_size\":1000}}}" \
  | python3 -c "
import sys, json
events = json.load(sys.stdin)['result']['events']
last = events[-1]
print(last['keys'][2], last['data'][0])
")
[ -n "$TOKEN" ] && [ -n "$CURVE" ] || die "could not read token/curve from LaunchCreated"
ok "token $TOKEN"
ok "curve $CURVE"
[ "$(python3 -c "import sys; print(int(sys.argv[1],0))" "$(call_raw "$FACTORY" curve_of "$TOKEN")")" = "$(python3 -c "import sys; print(int(sys.argv[1],0))" "$CURVE")" ] \
  || die "factory registry disagrees about the curve"
ok "factory registry matches"

TOTAL_SUPPLY=1000000000000000000000000000
CREATOR_TOKENS="$(balance "$TOKEN" "$CREATOR_ADDR")"
true_that "$CREATOR_TOKENS == $TOTAL_SUPPLY * 200 // 10000" || die "creator allocation wrong: $CREATOR_TOKENS"
ok "creator received 2% allocation"
[ "$(balance "$TOKEN" "$FACTORY")" = "0" ] || die "factory kept tokens"
ok "factory holds no tokens"

echo ">> 2. buy: 50.5 STRK budget = 50 into the curve + 0.5 fee"
CURVE_BAL_BEFORE_BUY="$(balance "$STRK" "$CURVE")"
send "$BUYER" "$STRK" approve "$CURVE, ${S505}_u256" >/dev/null || die "approve curve"
send "$BUYER" "$CURVE" buy "${S505}_u256, 1_u256" >/dev/null || die "buy"
BOUGHT="$(balance "$TOKEN" "$BUYER_ADDR")"
true_that "$BOUGHT > 0" || die "buyer received no tokens"
ok "buyer holds $BOUGHT token wei"
# The curve's own balance is the honest witness: the buyer's balance also pays gas.
true_that "$(balance "$STRK" "$CURVE") - $CURVE_BAL_BEFORE_BUY == $S505" || die "curve did not receive exactly 50.5 STRK"
ok "curve received exactly 50.5 STRK: 50 of reserve and 0.5 of fee"
true_that "$(state_u256 4) == $S50" || die "reserve is not 50"
true_that "$(state_u256 15) == $(py "$STRK_UNIT // 4") and $(state_u256 17) == $(py "$STRK_UNIT // 4")" || die "fee not split in half"
ok "reserve 50, and the 0.5 fee accrued half to the creator, half to the platform"
# shellcheck disable=SC2046
PRICE_AFTER_BUY="$(u256_of $(call_raw "$CURVE" spot_price))"

echo ">> 3. sell everything back"
# The buyer's own STRK balance also pays gas for the approve and sell transactions, so it can't
# be used to check the payout. The curve's STRK balance can: it must drop by exactly the quote.
# shellcheck disable=SC2046
QUOTE="$(u256_of $(call_raw "$CURVE" quote_sell "${BOUGHT}_u256"))"
CURVE_STRK_BEFORE="$(balance "$STRK" "$CURVE")"
send "$BUYER" "$TOKEN" approve "$CURVE, ${BOUGHT}_u256" >/dev/null || die "approve token"
send "$BUYER" "$CURVE" sell "${BOUGHT}_u256, 1_u256" >/dev/null || die "sell"
CURVE_STRK_AFTER="$(balance "$STRK" "$CURVE")"
true_that "$CURVE_STRK_BEFORE - $CURVE_STRK_AFTER == $QUOTE" || die "curve paid $(py "$CURVE_STRK_BEFORE - $CURVE_STRK_AFTER"), quote was $QUOTE"
ok "curve paid out exactly the quoted $QUOTE wei"
true_that "$QUOTE == $(py "495 * $STRK_UNIT // 10")" || die "seller would get $QUOTE, expected 49.5 STRK"
ok "the curve gives up 50 STRK and the seller gets 49.5 (99%): the 1% fee comes off the payout"
[ "$(balance "$TOKEN" "$BUYER_ADDR")" = "0" ] || die "buyer still holds tokens"

echo ">> 4. graduate the curve"
send "$BUYER" "$STRK" approve "$CURVE, ${S5000}_u256" >/dev/null || die "approve for graduation"
send "$BUYER" "$CURVE" buy "${S5000}_u256, 1_u256" >/dev/null || die "graduating buy"
# get_state: strk_reserve(2) token_reserve(2) strk_raised(2) tokens_sold(2) curve_supply(2) reserved(2) graduated(1)
STATE="$(call_raw "$CURVE" get_state)"
GRADUATED="$(echo "$STATE" | awk '{print $13}')"
[ "$GRADUATED" = "0x1" ] || die "curve did not graduate (state: $STATE)"
ok "curve graduated"
RAISED="$(state_u256 4)"
python3 - "$RAISED" "$STRK_UNIT" <<'PY' || die "graduation raise is not ~1000 STRK"
import sys
raised, unit = int(sys.argv[1]), int(sys.argv[2])
assert abs(raised - 1000 * unit) < 10_000, raised
PY
ok "the curve's reserve is ~1000 STRK (the graduation raise); the rest of the 5000 offered was not taken"
FEES_OWED="$(py "$(state_u256 15) + $(state_u256 17)")"
python3 - "$FEES_OWED" "$STRK_UNIT" <<'PY' || die "accrued fees are not ~11 STRK"
import sys
fees, unit = int(sys.argv[1]), int(sys.argv[2])
# 1 from the earlier round trip (0.5 + 0.5) and ~10 from the graduating buy, which is 1% of the ~1000 the curve took
assert abs(fees - 11 * unit) < 10_000, fees
PY
ok "~11 STRK of fees accrued: 1 from the round trip, ~10 from the graduating buy (1% of what the curve took, not of the 5000 offered)"
true_that "$(balance "$STRK" "$CURVE") == $RAISED + $FEES_OWED" || die "curve balance is not reserve plus owed fees"
ok "the curve holds exactly its reserve plus the fees it owes, nothing else"

echo ">> 5. sold out: nothing to buy, selling works, and buying reopens"
# Every curve token is sold, so there is nothing left to buy. That is arithmetic, not a lock.
if send "$BUYER" "$CURVE" buy "${S1}_u256, 1_u256" >/dev/null 2>&1; then
  die "a buy succeeded on a sold-out curve"
fi
ok "buy on a sold-out curve is rejected (nothing left to sell)"
HELD="$(balance "$TOKEN" "$BUYER_ADDR")"
HALF="$(py "$HELD // 2")"
send "$BUYER" "$TOKEN" approve "$CURVE, ${HALF}_u256" >/dev/null || die "approve half"
send "$BUYER" "$CURVE" sell "${HALF}_u256, 1_u256" >/dev/null || die "sell after graduation"
ok "sell after graduation works"

# The sell made room, so someone else can now buy in. Nobody is locked out.
CREATOR_TOKENS_BEFORE="$(balance "$TOKEN" "$CREATOR_ADDR")"
send "$CREATOR" "$STRK" approve "$CURVE, $(py "20 * $STRK_UNIT")_u256" >/dev/null || die "approve second buyer"
send "$CREATOR" "$CURVE" buy "$(py "20 * $STRK_UNIT")_u256, 1_u256" >/dev/null || die "buy after sells made room"
CREATOR_TOKENS_AFTER="$(balance "$TOKEN" "$CREATOR_ADDR")"
true_that "$CREATOR_TOKENS_AFTER > $CREATOR_TOKENS_BEFORE" || die "second buyer received no tokens"
ok "a new buyer can buy again once room opens"
STATE="$(call_raw "$CURVE" get_state)"
[ "$(echo "$STATE" | awk '{print $13}')" = "0x1" ] || die "graduation did not stay set"
ok "graduation stays set; it is a milestone, not a lock"

echo ">> 6. claim the fees (anyone can trigger it; the money only goes to its owner)"
OWED_CREATOR="$(state_u256 15)"
OWED_PLATFORM="$(state_u256 17)"
true_that "$OWED_CREATOR > 0 and $OWED_PLATFORM > 0" || die "nothing to claim"
CURVE_BEFORE_CLAIMS="$(balance "$STRK" "$CURVE")"
TREASURY_BEFORE_CLAIM="$(balance "$STRK" "$FEE_RECIPIENT")"
# The buyer account (not the creator, not the treasury) triggers both claims.
send "$BUYER" "$CURVE" claim_creator_fees "" >/dev/null || die "claim creator fees"
send "$BUYER" "$CURVE" claim_platform_fees "" >/dev/null || die "claim platform fees"
true_that "$(balance "$STRK" "$FEE_RECIPIENT") - $TREASURY_BEFORE_CLAIM == $OWED_PLATFORM" || die "treasury did not receive exactly the platform fees"
ok "the treasury received exactly the platform's share ($OWED_PLATFORM wei)"
true_that "$CURVE_BEFORE_CLAIMS - $(balance "$STRK" "$CURVE") == $OWED_CREATOR + $OWED_PLATFORM" || die "curve did not pay out exactly what it owed"
ok "the curve paid out exactly the fees it owed, creator share included ($OWED_CREATOR wei)"
true_that "$(state_u256 15) == 0 and $(state_u256 17) == 0" || die "fees still owed after claiming"
ok "nothing left owed"
if send "$BUYER" "$CURVE" claim_creator_fees "" >/dev/null 2>&1; then
  die "a second claim succeeded with nothing owed"
fi
ok "claiming again is rejected"
true_that "$(balance "$STRK" "$CURVE") == $(state_u256 4)" || die "after claiming, the curve should hold only its reserve"
ok "after claiming, the curve holds only its reserve"

echo
echo "PASS: launch, buy, sell, graduate, sell-out, reopen and fee claims all behave on a real node."

#!/usr/bin/env bash
# End-to-end smoke test against a LOCAL devnet. It uses the factory that
# `scripts/deploy.sh` wrote to deployments/devnet.json, then does a real launch on a real
# node: pay the fee, deploy token + curve, buy, sell, graduate, and check buying is frozen.
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
# Devnet only: it spends the throwaway devnet accounts and refuses any other RPC.
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
FEE_WEI="$(python3 -c "import json; print(json.load(open('deployments/devnet.json'))['deployFeeWei'])")"
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
    --contract-address "$2" --function "$3" --arguments "$4" 2>&1)" || { echo "$out" >&2; return 1; }
  printf '%s\n' "$out" | last_json | python3 -c "import sys, json; print(json.loads(sys.stdin.read()).get('transaction_hash', ''))"
}
ok() { echo "   ok  $*"; }
# Bash integers are 64-bit and 10 STRK is 1e19 wei, so all amount maths goes through python.
py() { python3 -c "print(int($1))"; }
true_that() { python3 -c "import sys; sys.exit(0 if ($1) else 1)"; }
STRK_UNIT=1000000000000000000
S1="$STRK_UNIT"
S50="$(py "50 * $STRK_UNIT")"
S5000="$(py "5000 * $STRK_UNIT")"

echo ">> factory $FACTORY"

echo ">> 1. launch (pays the deploy fee)"
TREASURY_BEFORE="$(balance "$STRK" "$FEE_RECIPIENT")"
COUNT_BEFORE="$(python3 -c "import sys; print(int(sys.argv[1], 0))" "$(call_raw "$FACTORY" launch_count)")"
send "$CREATOR" "$STRK" approve "$FACTORY, ${FEE_WEI}_u256" >/dev/null || die "approve fee"
send "$CREATOR" "$FACTORY" create_launch '"Smoke Test", "SMOKE", "ipfs://smoke", 1_u8, 200_u16' >/dev/null || die "create_launch"
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

echo ">> 2. buy 50 STRK"
send "$BUYER" "$STRK" approve "$CURVE, ${S50}_u256" >/dev/null || die "approve curve"
send "$BUYER" "$CURVE" buy "${S50}_u256, 1_u256" >/dev/null || die "buy"
BOUGHT="$(balance "$TOKEN" "$BUYER_ADDR")"
true_that "$BOUGHT > 0" || die "buyer received no tokens"
ok "buyer holds $BOUGHT token wei"
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
true_that "$QUOTE <= $S50 and $S50 - $QUOTE < 1000" || die "round trip lost $(py "$S50 - $QUOTE") wei, expected only rounding dust"
ok "round trip returned $(py "$S50 - ($S50 - $QUOTE)") of 50 STRK: never more, and only rounding dust short"
[ "$(balance "$TOKEN" "$BUYER_ADDR")" = "0" ] || die "buyer still holds tokens"

echo ">> 4. graduate the curve"
send "$BUYER" "$STRK" approve "$CURVE, ${S5000}_u256" >/dev/null || die "approve for graduation"
send "$BUYER" "$CURVE" buy "${S5000}_u256, 1_u256" >/dev/null || die "graduating buy"
# get_state: strk_reserve(2) token_reserve(2) strk_raised(2) tokens_sold(2) curve_supply(2) reserved(2) graduated(1)
STATE="$(call_raw "$CURVE" get_state)"
GRADUATED="$(echo "$STATE" | awk '{print $13}')"
[ "$GRADUATED" = "0x1" ] || die "curve did not graduate (state: $STATE)"
ok "curve graduated"
SPENT="$(balance "$STRK" "$CURVE")"
python3 - "$SPENT" "$STRK_UNIT" <<'PY' || die "graduation raise is not ~1000 STRK"
import sys
spent, unit = int(sys.argv[1]), int(sys.argv[2])
assert abs(spent - 1000 * unit) < 10_000, spent
PY
ok "curve holds ~1000 STRK (the graduation raise), the rest of the 5000 offered was not taken"

echo ">> 5. buying is frozen, selling still works"
if send "$BUYER" "$CURVE" buy "${S1}_u256, 1_u256" >/dev/null 2>&1; then
  die "a buy succeeded after graduation"
fi
ok "buy after graduation is rejected"
HELD="$(balance "$TOKEN" "$BUYER_ADDR")"
HALF="$(py "$HELD // 2")"
send "$BUYER" "$TOKEN" approve "$CURVE, ${HALF}_u256" >/dev/null || die "approve half"
send "$BUYER" "$CURVE" sell "${HALF}_u256, 1_u256" >/dev/null || die "sell after graduation"
ok "sell after graduation works"

echo
echo "PASS: launch, buy, sell, graduate and freeze all behave on a real node."

#!/usr/bin/env bash
# Deploy the oryvnlaunch contracts: declare OryvnToken, BondingCurve and TokenFactory, then
# deploy the factory with its quote assets (STRK, and USDC when configured). Token and curve
# instances are deployed later, by the factory, one pair per launch.
#
# Run it inside WSL/Linux from anywhere:   bash contracts/scripts/deploy.sh
#
# Required environment:
#   ACCOUNT          sncast account name that pays for the deployment
#   FACTORY_OWNER    address that will own the factory (fee, asset and pause powers)
#   FEE_RECIPIENT    address that receives every deploy fee (your treasury)
# Optional:
#   NETWORK                 sepolia (default) or devnet. mainnet is refused, see below.
#   ACCOUNTS_FILE           sncast accounts file (default: sncast's own default location)
#   RPC_URL                 use this RPC instead of sncast's public provider for the network
#   STRK_DEPLOY_FEE         STRK charged to deploy a token when paying in STRK, default 10
#   STRK_GRADUATION_RAISE   STRK every curve raises before graduating, default 1000
#   USDC_ADDRESS            native USDC token. Default on sepolia: Circle's testnet USDC.
#                           Default on devnet: none. Set to "none" to accept STRK fees only.
#   USDC_DEPLOY_FEE         USDC charged to deploy a token when paying in USDC, default 2.
#                           USDC is ONLY a way to pay the deploy fee: every token trades in STRK.
#   TRADE_FEE_BPS           trading fee per buy and sell, in basis points of the trade: 100 = 1%
#                           (default 100, capped on-chain at 300 = 3%)
#   CREATOR_FEE_SHARE_BPS   creator's share of each fee, in basis points of the fee: 5000 = half
#                           (default 5000). The platform gets the rest.
# Flags:
#   --yes            skip the confirmation prompt
#   --dry-run        build and estimate only; nothing is sent
#
# Deploy fees are capped on-chain at 100 whole units of each asset, and the trading fee at 3%. The defaults above are testnet
# numbers: on mainnet, price the fee and the raise in dollars at the time you deploy.
#
# No key ever passes through this script: signing is done by sncast with the account you
# name. Create or import that account yourself (see contracts/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$HOME/.asdf/shims:$PATH"

# STRK is the same address on Sepolia and mainnet, and devnet predeploys it at that address.
# Source: https://docs.starknet.io/learn/cheatsheets/chain-info
STRK_ADDRESS="0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
# Circle's native USDC on Starknet Sepolia (symbol USDC, 6 decimals, checked on chain).
# Source: https://developers.circle.com/stablecoins/usdc-contract-addresses
SEPOLIA_USDC_ADDRESS="0x0512feAc6339Ff7889822cb5aA2a86C848e9D392bB0E3E237C008674feeD8343"
MAX_FEE_UNITS=100

NETWORK="${NETWORK:-sepolia}"
STRK_DEPLOY_FEE="${STRK_DEPLOY_FEE:-10}"
STRK_GRADUATION_RAISE="${STRK_GRADUATION_RAISE:-1000}"
USDC_DEPLOY_FEE="${USDC_DEPLOY_FEE:-2}"
TRADE_FEE_BPS="${TRADE_FEE_BPS:-100}"
CREATOR_FEE_SHARE_BPS="${CREATOR_FEE_SHARE_BPS:-5000}"
MAX_TRADE_FEE_BPS=300
if [ -z "${USDC_ADDRESS:-}" ]; then
  if [ "$NETWORK" = "sepolia" ]; then USDC_ADDRESS="$SEPOLIA_USDC_ADDRESS"; else USDC_ADDRESS="none"; fi
fi
ASSUME_YES=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,42p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

die() { echo "error: $*" >&2; exit 1; }

# --- guard rails ---------------------------------------------------------------------------
case "$NETWORK" in
  sepolia|devnet) ;;
  mainnet)
    die "mainnet is not supported by this script. The curve maths has not been independently reviewed, and the factory owner should be a multisig, not a single key. Do both first."
    ;;
  *) die "NETWORK must be sepolia or devnet (got '$NETWORK')" ;;
esac
[ -n "${ACCOUNT:-}" ] || die "set ACCOUNT to your sncast account name"
[ -n "${FACTORY_OWNER:-}" ] || die "set FACTORY_OWNER to the address that should own the factory"
[ -n "${FEE_RECIPIENT:-}" ] || die "set FEE_RECIPIENT to the address that should receive deploy fees"
for v in FACTORY_OWNER FEE_RECIPIENT; do
  [[ "${!v}" =~ ^0x[0-9a-fA-F]{1,64}$ ]] || die "$v must be a 0x-prefixed hex address"
done
USE_USDC=true
if [ "$USDC_ADDRESS" = "none" ]; then
  USE_USDC=false
else
  [[ "$USDC_ADDRESS" =~ ^0x[0-9a-fA-F]{1,64}$ ]] || die "USDC_ADDRESS must be a 0x-prefixed hex address or 'none'"
fi
[[ "$TRADE_FEE_BPS" =~ ^[0-9]+$ ]] || die "TRADE_FEE_BPS must be a whole number of basis points (100 = 1%)"
[ "$TRADE_FEE_BPS" -le "$MAX_TRADE_FEE_BPS" ] || die "TRADE_FEE_BPS is above the contract's hard cap of $MAX_TRADE_FEE_BPS (3%)"
[[ "$CREATOR_FEE_SHARE_BPS" =~ ^[0-9]+$ ]] || die "CREATOR_FEE_SHARE_BPS must be a whole number of basis points (5000 = half)"
[ "$CREATOR_FEE_SHARE_BPS" -le 10000 ] || die "CREATOR_FEE_SHARE_BPS cannot exceed 10000 (the whole fee)"
command -v sncast >/dev/null || die "sncast not found (install Starknet Foundry with starkup)"
command -v scarb >/dev/null || die "scarb not found (install it with starkup)"
command -v python3 >/dev/null || die "python3 not found"

# --- parameters -> smallest units ----------------------------------------------------------
to_units() { # value decimals
  python3 - "$1" "$2" <<'PY'
import sys
from decimal import Decimal, InvalidOperation
try:
    v = Decimal(sys.argv[1])
except InvalidOperation:
    sys.exit("not a number: " + sys.argv[1])
if v < 0:
    sys.exit("must not be negative")
units = v * 10 ** int(sys.argv[2])
if units != units.to_integral_value():
    sys.exit("more than %s decimal places" % sys.argv[2])
print(int(units))
PY
}
check_fee_cap() { # name units decimals
  python3 -c "import sys; sys.exit(0 if int(sys.argv[1]) <= int(sys.argv[2]) * 10**int(sys.argv[3]) else 1)" "$2" "$MAX_FEE_UNITS" "$3" \
    || die "$1 is above the contract's hard cap of $MAX_FEE_UNITS whole units"
}
STRK_FEE_UNITS="$(to_units "$STRK_DEPLOY_FEE" 18)" || die "bad STRK_DEPLOY_FEE"
STRK_RAISE_UNITS="$(to_units "$STRK_GRADUATION_RAISE" 18)" || die "bad STRK_GRADUATION_RAISE"
[ "$STRK_RAISE_UNITS" != "0" ] || die "STRK_GRADUATION_RAISE must be greater than zero"
check_fee_cap STRK_DEPLOY_FEE "$STRK_FEE_UNITS" 18
if $USE_USDC; then
  USDC_FEE_UNITS="$(to_units "$USDC_DEPLOY_FEE" 6)" || die "bad USDC_DEPLOY_FEE"
  check_fee_cap USDC_DEPLOY_FEE "$USDC_FEE_UNITS" 6
fi

# --- sncast flags --------------------------------------------------------------------------
NET_FLAGS=()
if [ -n "${RPC_URL:-}" ]; then NET_FLAGS=(--url "$RPC_URL"); else NET_FLAGS=(--network "$NETWORK"); fi
ACCT_FLAGS=(--account "$ACCOUNT")
if [ -n "${ACCOUNTS_FILE:-}" ]; then ACCT_FLAGS+=(--accounts-file "$ACCOUNTS_FILE"); fi
SEND_FLAGS=()
$DRY_RUN && SEND_FLAGS+=(--dry-run)

sncast_json() {
  # Run sncast with --json and print only its last JSON line (it can emit warnings before it).
  local out
  out="$("$@" 2>&1)" || { echo "$out" >&2; return 1; }
  printf '%s\n' "$out" | grep -E '^\{' | tail -n 1
}
jget() { python3 -c "import sys, json; d = json.loads(sys.stdin.read()); print(d.get(sys.argv[1], ''))" "$1"; }
call_raw() { # contract function [arguments] -> space-separated felts
  sncast_json sncast --json call "${NET_FLAGS[@]}" --contract-address "$1" --function "$2" ${3:+--arguments "$3"} \
    | python3 -c "import sys, json; print(' '.join(json.loads(sys.stdin.read())['response_raw']))"
}
norm() { python3 -c "import sys; print(hex(int(sys.argv[1], 0)))" "$1"; }
u256_of() { python3 -c "import sys; print(int(sys.argv[1],0) + (int(sys.argv[2],0) << 128))" "$1" "$2"; }

# A wrong USDC address is the easiest expensive mistake here, so ask the token itself.
if $USE_USDC; then
  echo ">> checking USDC token $USDC_ADDRESS"
  USDC_DECIMALS="$(call_raw "$USDC_ADDRESS" decimals 2>/dev/null || true)"
  [ "$(norm "${USDC_DECIMALS:-0x0}")" = "0x6" ] \
    || die "the token at USDC_ADDRESS does not report 6 decimals on $NETWORK (got '${USDC_DECIMALS:-nothing}'). Wrong address or wrong network?"
fi

# --- confirm -------------------------------------------------------------------------------
cat <<EOF

  oryvnlaunch deployment
  ----------------------
  network            $NETWORK
  deployer account   $ACCOUNT
  factory owner      $FACTORY_OWNER
  fee recipient      $FEE_RECIPIENT

  trading fee        $(python3 -c "import sys; print(f'{int(sys.argv[1])/100:g}%')" "$TRADE_FEE_BPS") per trade, creator gets $(python3 -c "import sys; print(f'{int(sys.argv[1])/100:g}%')" "$CREATOR_FEE_SHARE_BPS") of it, platform the rest

  every token trades in STRK ($STRK_ADDRESS)
    graduation raise $STRK_GRADUATION_RAISE STRK

  deploy fee, paid in STRK:  $STRK_DEPLOY_FEE STRK
EOF
if $USE_USDC; then
cat <<EOF
  deploy fee, paid in USDC:  $USDC_DEPLOY_FEE USDC   ($USDC_ADDRESS)
EOF
else
  echo "  deploy fee in USDC: not enabled (STRK fees only)"
fi
cat <<EOF

  mode               $($DRY_RUN && echo "dry run, nothing is sent" || echo "LIVE, this sends transactions")

EOF
if ! $ASSUME_YES && ! $DRY_RUN; then
  read -r -p "  Check the fee recipient and owner carefully. Type 'deploy' to continue: " reply
  [ "$reply" = "deploy" ] || die "cancelled"
fi

# --- build ---------------------------------------------------------------------------------
echo ">> building"
scarb build >/dev/null

# --- declare -------------------------------------------------------------------------------
declare_class() {
  local name="$1" out hash
  # Idempotent: if the class is already on chain, reuse its hash instead of failing.
  hash="$(sncast_json sncast --json utils class-hash --contract-name "$name" | jget class_hash)"
  [ -n "$hash" ] || die "could not compute class hash for $name"
  if out="$(sncast "${ACCT_FLAGS[@]}" --json declare "${NET_FLAGS[@]}" "${SEND_FLAGS[@]}" --contract-name "$name" 2>&1)"; then
    :
  elif printf '%s' "$out" | grep -qi 'already declared'; then
    echo "   $name already declared" >&2
  else
    echo "$out" >&2
    die "declare $name failed"
  fi
  echo "$hash"
}

echo ">> declaring"
TOKEN_CLASS="$(declare_class OryvnToken)"
echo "   OryvnToken    $TOKEN_CLASS"
CURVE_CLASS="$(declare_class BondingCurve)"
echo "   BondingCurve  $CURVE_CLASS"
FACTORY_CLASS="$(declare_class TokenFactory)"
echo "   TokenFactory  $FACTORY_CLASS"

if $DRY_RUN; then
  echo ">> dry run complete: declares estimated, factory not deployed"
  exit 0
fi

# --- deploy the factory --------------------------------------------------------------------
# Constructor: owner, fee_recipient, token_class_hash, curve_class_hash, then an array of
# quote assets: length, and for each one: address, deploy_fee (u256), graduation_raise (u256); then
# the trading fee, the creator's share, the default quote asset (STRK), and an array of deploy-fee
# assets: length, and for each one: address, deploy_fee (u256).
# u256 values are passed as low, high 128-bit felts.
u256_felts() { python3 -c "import sys; v=int(sys.argv[1]); print(v & (2**128-1), v >> 128)" "$1"; }
QUOTE_ARGS=()
QUOTE_COUNT=0
add_quote() { # address fee_units raise_units
  local flo fhi rlo rhi
  read -r flo fhi < <(u256_felts "$2")
  read -r rlo rhi < <(u256_felts "$3")
  QUOTE_ARGS+=("$1" "$flo" "$fhi" "$rlo" "$rhi")
  QUOTE_COUNT=$((QUOTE_COUNT + 1))
}
# Only STRK is a curve (trading) asset. USDC is never one.
add_quote "$STRK_ADDRESS" "$STRK_FEE_UNITS" "$STRK_RAISE_UNITS"
FEE_ARGS=()
FEE_COUNT=0
add_fee_asset() { # address fee_units
  local flo fhi
  read -r flo fhi < <(u256_felts "$2")
  FEE_ARGS+=("$1" "$flo" "$fhi")
  FEE_COUNT=$((FEE_COUNT + 1))
}
add_fee_asset "$STRK_ADDRESS" "$STRK_FEE_UNITS"
$USE_USDC && add_fee_asset "$USDC_ADDRESS" "$USDC_FEE_UNITS"

echo ">> deploying factory"
DEPLOY_OUT="$(sncast_json sncast "${ACCT_FLAGS[@]}" --json deploy "${NET_FLAGS[@]}" \
  --class-hash "$FACTORY_CLASS" \
  --constructor-calldata "$FACTORY_OWNER" "$FEE_RECIPIENT" "$TOKEN_CLASS" "$CURVE_CLASS" \
  "$QUOTE_COUNT" "${QUOTE_ARGS[@]}" "$TRADE_FEE_BPS" "$CREATOR_FEE_SHARE_BPS" \
  "$STRK_ADDRESS" "$FEE_COUNT" "${FEE_ARGS[@]}")" || die "factory deploy failed"
FACTORY_ADDRESS="$(printf '%s' "$DEPLOY_OUT" | jget contract_address)"
TX_HASH="$(printf '%s' "$DEPLOY_OUT" | jget transaction_hash)"
[ -n "$FACTORY_ADDRESS" ] || die "no contract address in deploy output: $DEPLOY_OUT"
echo "   TokenFactory  $FACTORY_ADDRESS"

# The block the factory was deployed in. The indexer must start reading no later than this block, or
# it silently misses launches, so it is recorded here once instead of being copied by hand later.
DEPLOY_BLOCK=""
for attempt in 1 2 3 4 5 6; do
  DEPLOY_BLOCK="$(sncast_json sncast --json get tx-receipt "${NET_FLAGS[@]}" "$TX_HASH" 2>/dev/null | jget block_number || true)"
  [[ "$DEPLOY_BLOCK" =~ ^[0-9]+$ ]] && break
  DEPLOY_BLOCK=""
  sleep 5
done
[ -n "$DEPLOY_BLOCK" ] || die "the factory deployed at $FACTORY_ADDRESS, but its block number could not be read. Find it on the block explorer and put it in deployments/$NETWORK.json as factory.deployBlock before running the indexer."
echo "   deployed in block $DEPLOY_BLOCK"

# --- verify what is on chain matches what we asked for ---------------------------------------
echo ">> verifying"
check() { # name, got, want
  [ "$2" = "$3" ] || die "verification failed for $1: on chain $2, expected $3"
  echo "   ok  $1"
}
check_quote() { # label address fee_units raise_units decimals
  # quote_config returns: enabled, deploy_fee (lo hi), graduation_raise (lo hi), unit (lo hi)
  local raw enabled flo fhi rlo rhi ulo uhi
  raw="$(call_raw "$FACTORY_ADDRESS" quote_config "$2")"
  read -r enabled flo fhi rlo rhi ulo uhi <<<"$raw"
  check "$1 enabled" "$(norm "$enabled")" "0x1"
  check "$1 deploy fee" "$(u256_of "$flo" "$fhi")" "$3"
  check "$1 graduation raise" "$(u256_of "$rlo" "$rhi")" "$4"
  check "$1 unit (decimals)" "$(u256_of "$ulo" "$uhi")" "$(python3 -c "print(10**$5)")"
}
check_fee_asset() { # label address fee_units decimals
  # fee_asset_config returns: enabled, deploy_fee (lo hi), unit (lo hi)
  local raw enabled flo fhi ulo uhi
  raw="$(call_raw "$FACTORY_ADDRESS" fee_asset_config "$2")"
  read -r enabled flo fhi ulo uhi <<<"$raw"
  check "$1 fee asset enabled" "$(norm "$enabled")" "0x1"
  check "$1 deploy fee" "$(u256_of "$flo" "$fhi")" "$3"
  check "$1 unit (decimals)" "$(u256_of "$ulo" "$uhi")" "$(python3 -c "print(10**$4)")"
}
check_quote STRK "$STRK_ADDRESS" "$STRK_FEE_UNITS" "$STRK_RAISE_UNITS" 18
check "default quote asset (curves trade in)" "$(norm "$(call_raw "$FACTORY_ADDRESS" default_quote_token)")" "$(norm "$STRK_ADDRESS")"
check_fee_asset STRK "$STRK_ADDRESS" "$STRK_FEE_UNITS" 18
$USE_USDC && check_fee_asset USDC "$USDC_ADDRESS" "$USDC_FEE_UNITS" 6
read -r got_fee_bps got_fee_share <<<"$(call_raw "$FACTORY_ADDRESS" trade_fee)"
check "trade fee (bps)" "$(python3 -c "import sys; print(int(sys.argv[1],0))" "$got_fee_bps")" "$TRADE_FEE_BPS"
check "creator fee share (bps)" "$(python3 -c "import sys; print(int(sys.argv[1],0))" "$got_fee_share")" "$CREATOR_FEE_SHARE_BPS"
check fee_recipient "$(norm "$(call_raw "$FACTORY_ADDRESS" fee_recipient)")" "$(norm "$FEE_RECIPIENT")"
check owner "$(norm "$(call_raw "$FACTORY_ADDRESS" owner)")" "$(norm "$FACTORY_OWNER")"
check launches_paused "$(call_raw "$FACTORY_ADDRESS" launches_paused)" "0x0"

# --- record -----------------------------------------------------------------------------------
mkdir -p deployments
RECORD="deployments/$NETWORK.json"
USDC_JSON="None"
if $USE_USDC; then
  USDC_JSON="{\"address\": \"$USDC_ADDRESS\", \"decimals\": 6, \"deployFeeUnits\": \"$USDC_FEE_UNITS\"}"
fi
python3 - "$RECORD" <<PY
import json, sys, datetime
record = {
    "network": "$NETWORK",
    "deployedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "factory": {"address": "$FACTORY_ADDRESS", "transaction": "$TX_HASH", "classHash": "$FACTORY_CLASS", "deployBlock": $DEPLOY_BLOCK},
    "classHashes": {"OryvnToken": "$TOKEN_CLASS", "BondingCurve": "$CURVE_CLASS", "TokenFactory": "$FACTORY_CLASS"},
    "owner": "$FACTORY_OWNER",
    "feeRecipient": "$FEE_RECIPIENT",
    "tradeFeeBps": $TRADE_FEE_BPS,
    "creatorFeeShareBps": $CREATOR_FEE_SHARE_BPS,
    "defaultQuoteToken": "$STRK_ADDRESS",
    "quoteTokens": {
        "STRK": {"address": "$STRK_ADDRESS", "decimals": 18, "deployFeeUnits": "$STRK_FEE_UNITS", "graduationRaiseUnits": "$STRK_RAISE_UNITS"},
    },
    # Assets a creator can pay the deploy fee in. USDC is here only: no token ever trades in it.
    "feeAssets": {
        "STRK": {"address": "$STRK_ADDRESS", "decimals": 18, "deployFeeUnits": "$STRK_FEE_UNITS"},
        "USDC": $USDC_JSON,
    },
}
json.dump(record, open(sys.argv[1], "w"), indent=2)
open(sys.argv[1], "a").write("\n")
PY
echo ">> wrote contracts/$RECORD"
echo
echo "Done. Factory: $FACTORY_ADDRESS ($NETWORK), deployed in block $DEPLOY_BLOCK"
echo
echo "To index it, put this in the repo's .env (the indexer then reads the address and the block from"
echo "contracts/$RECORD, so there is nothing to copy by hand):"
echo "  NETWORK=$NETWORK"

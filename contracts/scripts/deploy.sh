#!/usr/bin/env bash
# Deploy the oryvnlaunch contracts: declare OryvnToken, BondingCurve and TokenFactory, then
# deploy the factory wired to them. Token and curve instances are deployed later, by the
# factory, one per launch.
#
# Run it inside WSL/Linux from anywhere:   contracts/scripts/deploy.sh
#
# Required environment:
#   ACCOUNT          sncast account name that pays for the deployment
#   FACTORY_OWNER    address that will own the factory (fee and pause powers)
#   FEE_RECIPIENT    address that receives every deploy fee (your treasury)
# Optional:
#   NETWORK                 sepolia (default) or devnet. mainnet is refused, see below.
#   ACCOUNTS_FILE           sncast accounts file (default: sncast's own default location)
#   DEPLOY_FEE_STRK         deploy fee in STRK, default 10 (hard cap on-chain: 100)
#   GRADUATION_RAISE_STRK   STRK a curve raises before graduating, default 1000
#   RPC_URL                 use this RPC instead of sncast's public provider for the network
# Flags:
#   --yes            skip the confirmation prompt
#   --dry-run        build and estimate only; nothing is sent
#
# No key ever passes through this script: signing is done by sncast with the account you
# name. Create or import that account yourself (see contracts/README.md).
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$HOME/.asdf/shims:$PATH"

# STRK is the same address on Sepolia and mainnet, and devnet predeploys it at that address.
# Source: https://docs.starknet.io/learn/cheatsheets/chain-info
STRK_ADDRESS="0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"
MAX_FEE_STRK=100

NETWORK="${NETWORK:-sepolia}"
DEPLOY_FEE_STRK="${DEPLOY_FEE_STRK:-10}"
GRADUATION_RAISE_STRK="${GRADUATION_RAISE_STRK:-1000}"
ASSUME_YES=false
DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=true ;;
    --dry-run) DRY_RUN=true ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
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
command -v sncast >/dev/null || die "sncast not found (install Starknet Foundry with starkup)"
command -v scarb >/dev/null || die "scarb not found (install it with starkup)"
command -v python3 >/dev/null || die "python3 not found"

# --- parameters -> wei ---------------------------------------------------------------------
to_wei() {
  python3 - "$1" <<'PY'
import sys
from decimal import Decimal, InvalidOperation
try:
    v = Decimal(sys.argv[1])
except InvalidOperation:
    sys.exit("not a number: " + sys.argv[1])
if v < 0:
    sys.exit("must not be negative")
wei = v * 10**18
if wei != wei.to_integral_value():
    sys.exit("more than 18 decimal places")
print(int(wei))
PY
}
FEE_WEI="$(to_wei "$DEPLOY_FEE_STRK")" || die "bad DEPLOY_FEE_STRK"
RAISE_WEI="$(to_wei "$GRADUATION_RAISE_STRK")" || die "bad GRADUATION_RAISE_STRK"
[ "$RAISE_WEI" != "0" ] || die "GRADUATION_RAISE_STRK must be greater than zero"
python3 -c "import sys; sys.exit(0 if int(sys.argv[1]) <= int(sys.argv[2])*10**18 else 1)" "$FEE_WEI" "$MAX_FEE_STRK" \
  || die "DEPLOY_FEE_STRK is above the contract's hard cap of $MAX_FEE_STRK STRK"

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

# --- confirm -------------------------------------------------------------------------------
cat <<EOF

  oryvnlaunch deployment
  ----------------------
  network            $NETWORK
  deployer account   $ACCOUNT
  factory owner      $FACTORY_OWNER
  fee recipient      $FEE_RECIPIENT
  deploy fee         $DEPLOY_FEE_STRK STRK (cap $MAX_FEE_STRK)
  graduation raise   $GRADUATION_RAISE_STRK STRK
  STRK token         $STRK_ADDRESS
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
# Constructor: owner, strk, fee_recipient, token_class_hash, curve_class_hash, deploy_fee (u256),
# graduation_raise (u256). u256 values are passed as low, high 128-bit felts.
u256_felts() { python3 -c "import sys; v=int(sys.argv[1]); print(v & (2**128-1), v >> 128)" "$1"; }
read -r FEE_LO FEE_HI < <(u256_felts "$FEE_WEI")
read -r RAISE_LO RAISE_HI < <(u256_felts "$RAISE_WEI")

echo ">> deploying factory"
DEPLOY_OUT="$(sncast_json sncast "${ACCT_FLAGS[@]}" --json deploy "${NET_FLAGS[@]}" \
  --class-hash "$FACTORY_CLASS" \
  --constructor-calldata "$FACTORY_OWNER" "$STRK_ADDRESS" "$FEE_RECIPIENT" "$TOKEN_CLASS" "$CURVE_CLASS" \
  "$FEE_LO" "$FEE_HI" "$RAISE_LO" "$RAISE_HI")" || die "factory deploy failed"
FACTORY_ADDRESS="$(printf '%s' "$DEPLOY_OUT" | jget contract_address)"
TX_HASH="$(printf '%s' "$DEPLOY_OUT" | jget transaction_hash)"
[ -n "$FACTORY_ADDRESS" ] || die "no contract address in deploy output: $DEPLOY_OUT"
echo "   TokenFactory  $FACTORY_ADDRESS"

# --- verify what is on chain matches what we asked for ---------------------------------------
echo ">> verifying"
call_felts() {
  sncast_json sncast --json call "${NET_FLAGS[@]}" --contract-address "$FACTORY_ADDRESS" --function "$1" \
    | python3 -c "import sys, json; print(' '.join(json.loads(sys.stdin.read())['response_raw']))"
}
norm() { python3 -c "import sys; print(hex(int(sys.argv[1], 0)))" "$1"; }
check() { # name, got, want
  [ "$2" = "$3" ] || die "verification failed for $1: on chain $2, expected $3"
  echo "   ok  $1"
}
read -r got_fee_lo got_fee_hi <<<"$(call_felts deploy_fee)"
check deploy_fee "$(python3 -c "import sys; print(int(sys.argv[1],0) + (int(sys.argv[2],0) << 128))" "$got_fee_lo" "$got_fee_hi")" "$FEE_WEI"
read -r got_raise_lo got_raise_hi <<<"$(call_felts graduation_raise)"
check graduation_raise "$(python3 -c "import sys; print(int(sys.argv[1],0) + (int(sys.argv[2],0) << 128))" "$got_raise_lo" "$got_raise_hi")" "$RAISE_WEI"
check fee_recipient "$(norm "$(call_felts fee_recipient)")" "$(norm "$FEE_RECIPIENT")"
check strk_token "$(norm "$(call_felts strk_token)")" "$(norm "$STRK_ADDRESS")"
check owner "$(norm "$(call_felts owner)")" "$(norm "$FACTORY_OWNER")"
check launches_paused "$(call_felts launches_paused)" "0x0"

# --- record -----------------------------------------------------------------------------------
mkdir -p deployments
RECORD="deployments/$NETWORK.json"
python3 - "$RECORD" <<PY
import json, sys, datetime
record = {
    "network": "$NETWORK",
    "deployedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
    "factory": {"address": "$FACTORY_ADDRESS", "transaction": "$TX_HASH", "classHash": "$FACTORY_CLASS"},
    "classHashes": {"OryvnToken": "$TOKEN_CLASS", "BondingCurve": "$CURVE_CLASS", "TokenFactory": "$FACTORY_CLASS"},
    "strk": "$STRK_ADDRESS",
    "owner": "$FACTORY_OWNER",
    "feeRecipient": "$FEE_RECIPIENT",
    "deployFeeWei": "$FEE_WEI",
    "graduationRaiseWei": "$RAISE_WEI",
}
json.dump(record, open(sys.argv[1], "w"), indent=2)
open(sys.argv[1], "a").write("\n")
PY
echo ">> wrote contracts/$RECORD"
echo
echo "Done. Factory: $FACTORY_ADDRESS ($NETWORK)"

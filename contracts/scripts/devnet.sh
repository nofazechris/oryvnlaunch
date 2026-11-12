#!/usr/bin/env bash
# Local Starknet devnet for rehearsing a deployment end to end.
#
#   scripts/devnet.sh start    start starknet-devnet in the foreground (Ctrl-C to stop)
#   scripts/devnet.sh accounts import its predeployed accounts into devnet-accounts.json
#
# Devnet is started with --seed 0, so its accounts and private keys are the same public
# throwaway values everyone gets. They are only ever valid on your own machine. Never use
# them, or import them, anywhere else.
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$HOME/.asdf/shims:$PATH"
URL="http://127.0.0.1:5050"
ACCOUNTS_FILE="devnet-accounts.json"

case "${1:-}" in
  start)
    exec starknet-devnet --seed 0 --accounts 3 --initial-balance 1000000000000000000000000 \
      --host 127.0.0.1 --port 5050
    ;;
  accounts)
    curl -sf "$URL/is_alive" >/dev/null || { echo "devnet is not running on $URL (run: scripts/devnet.sh start)" >&2; exit 1; }
    rm -f "$ACCOUNTS_FILE"
    curl -sf -X POST "$URL/rpc" -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"devnet_getPredeployedAccounts","params":{}}' > /tmp/oryvn-devnet-accounts.json
    names=(devnet-deployer devnet-treasury devnet-user)
    for i in 0 1 2; do
      read -r addr key < <(python3 - "$i" <<'PY'
import json, sys
a = json.load(open("/tmp/oryvn-devnet-accounts.json"))["result"][int(sys.argv[1])]
print(a["address"], a["private_key"])
PY
)
      sncast --accounts-file "$ACCOUNTS_FILE" account import --name "${names[$i]}" \
        --address "$addr" --private-key "$key" --type oz --url "$URL/rpc" --silent >/dev/null
      echo "${names[$i]}  $addr"
    done
    rm -f /tmp/oryvn-devnet-accounts.json
    ;;
  *)
    echo "usage: $0 start|accounts" >&2
    exit 2
    ;;
esac

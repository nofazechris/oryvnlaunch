# indexer

Reads the factory's and every curve's events from Starknet and keeps Postgres (Neon) in step.
Safe to restart, retry and re-run: a block range is rebuilt from the chain, never patched, and
it follows a reorg or a rolled-back chain by comparing block hashes.

```bash
STARKNET_RPC_URL=... DATABASE_URL=postgres://... NETWORK=sepolia \
  pnpm --filter @launchpad/indexer start
```

Configuration is validated at startup (see `src/config.ts` and `/.env.example`). With `NETWORK`
(`sepolia`, `devnet` or `mainnet`) the indexer reads the factory address and the block it was
deployed in from `contracts/deployments/<network>.json`, which `scripts/deploy.sh` writes. If you
set `FACTORY_ADDRESS` yourself instead, `START_BLOCK` must be the factory's deploy block:
launches made before it are never indexed.

Indexed: `LaunchCreated`, `QuoteTokenSet`, `TokensBought`, `TokensSold`, `Graduated`.

It polls `starknet_getEvents` (one call per curve per pass) instead of using Apibara, so it runs
against devnet, Sepolia or any provider with no extra account. `ChainSource` in `src/indexer.ts`
is the seam for an Apibara source when the number of launches makes polling wasteful.

Tests: `pnpm --filter @launchpad/indexer test`. Add `DEVNET_RPC=http://127.0.0.1:5050/rpc` to also
run the end-to-end tests against a live devnet that has run `contracts/scripts/smoke.sh`.

Full design, guarantees and limits: `docs/architecture/data-layer.md`.

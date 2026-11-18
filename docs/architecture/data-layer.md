# Data layer: indexer, database and API

The contracts are the source of truth for money. This layer reads what they emit, stores it in a
shape that is quick to query, and serves it. Nothing here can move funds or change a launch, and
every row can be rebuilt from the chain.

```
Starknet  ──events──▶  @launchpad/indexer  ──rows──▶  Postgres (Neon)  ◀──reads──  @launchpad/api  ◀──  web
 (factory + curves)     (polls, decodes,              (launches, trades,            (read-only
                         rebuilds on reorg)            quote-asset history)           HTTP, strings for amounts)
```

| Piece | Where | What it is |
|---|---|---|
| Chain access | `packages/chain` | JSON-RPC client, decoders for every factory and curve event, and the market maths (price, market cap, graduation progress). |
| Database | `packages/db` | Drizzle schema, SQL migrations, typed access that works on Neon in production and PGlite in tests. |
| Indexer | `apps/indexer` | Reads events, writes rows. Safe to restart, retry and re-run. |
| API | `apps/api` | NestJS on Fastify. Read-only. |

## Rules the code keeps

- **Exact arithmetic.** Amounts are `numeric(78,0)` in the database and decimal strings in the API.
  A JSON number cannot hold a 256-bit value, so no amount, price or market cap is ever a number.
- **Idempotent.** Applying the same block range twice leaves the database exactly as applying it
  once. A range is rebuilt (rewound, then re-applied from the chain) rather than patched.
- **Reorg-safe.** The indexer stores the hash of the last block it processed. If the node's block at
  that height is a different block, or the node's head is behind the indexer, it goes back
  `REORG_OVERLAP_BLOCKS` (default 10) and rebuilds. Everything from the rewind point onward is
  cleared first, so a rolled-back chain leaves nothing behind.
- **All or nothing.** A batch, its snapshots and the cursor commit in one transaction. A decode
  error, a missing timestamp or an unknown curve stops the indexer and writes nothing, rather than
  skipping an event and storing a wrong number.
- **Snapshots are recomputed, not nudged.** `launches` price, market cap, volume and trade count
  are rebuilt from the `trades` table on every batch, so they cannot drift.
- **Decoding is strict.** Running out of felts, or leaving any unread, is an error. The decoders
  are tested against real events captured from the real contracts.

## Database (Neon)

Tables: `launches` (one per token, with a market snapshot and the fee terms it was created with), `trades` (every buy and sell, with the fee each paid),
`quote_token_events` (history of every quote-asset change; the current setting is the newest row),
`indexer_state` (cursor and its block hash). See `packages/db/src/schema.ts`.

### Setting up Neon

You create the project; nothing here can do it for you.

1. At <https://neon.tech> create a project (pick a region near where the indexer will run).
2. Open **Connect** in the Neon console. You need two strings for the same database:
   - the **pooled** one (host contains `-pooler`) as `DATABASE_URL`: the indexer and API use it;
   - the **direct** one (no `-pooler`) as `DATABASE_URL_DIRECT`: only migrations use it.
3. Copy `.env.example` to `.env` (git ignores it) and paste the two strings in. Never commit it,
   and never paste a connection string into chat, an issue or a screenshot: it contains the
   password.
4. Check it: `pnpm --filter @launchpad/db db:check`. It says whether each string works and whether
   the tables exist, and it never prints the password. It also warns if the pooled and direct
   strings are swapped.
5. Create the tables: `pnpm --filter @launchpad/db db:migrate` (safe to run again).
6. Run `db:check` once more: it should say "tables are in place". Then start the indexer and the
   API (below). They read the same `.env` automatically.

The pooled connection goes through PgBouncer in transaction mode, which does not support prepared
statements, so the code turns them off. That is already done in `connect()`.

Use a separate Neon *branch* for experiments rather than your main one. Branching a database is
instant and free of risk to the main data.

## Running it

```bash
pnpm install
pnpm turbo run build                        # packages must be built before the apps use them
pnpm --filter @launchpad/db db:migrate      # needs DATABASE_URL_DIRECT in the environment
pnpm --filter @launchpad/indexer start      # needs DATABASE_URL, STARKNET_RPC_URL, FACTORY_ADDRESS
pnpm --filter @launchpad/api start          # needs DATABASE_URL
```

For local work against devnet, deploy the factory first (`contracts/README.md`) and point
`STARKNET_RPC_URL` at `http://127.0.0.1:5050/rpc` and `FACTORY_ADDRESS` at the deployed factory.

## API

All GET. Amounts are decimal strings in the asset's smallest unit; use `quote.decimals` to format.

| Route | Returns |
|---|---|
| `GET /launches` | List. `sort=newest` (default), `progress`, `marketcap`, `volume`; filters `quote`, `creator`, `graduated`; `limit` (1-100), `offset`. |
| `GET /launches/:token` | One launch with its market numbers and graduation progress. |
| `GET /launches/:token/trades` | Trades, newest first. |
| `GET /quote-tokens` | The assets a creator can launch in now, with each one's fee and raise. |
| `GET /health` | Database reachability and the indexer's latest block and its age. |

Decisions worth knowing:

- **No ranking by market cap or volume across assets.** STRK has 18 decimals and USDC has 6, so the
  raw numbers are not comparable. `sort=marketcap|volume` requires `quote=<asset>` and returns a 400
  that says so otherwise. `sort=progress` (how close to graduating) and `sort=newest` do compare
  across assets. A true cross-asset "highest value" ranking needs a price feed, which is not built.
- **Fees are reported, not hidden.** A trade's `quoteAmount` is the curve-side amount, `fee` is the
  1% on it, and `traderAmount` is what the trader actually paid (buy) or received (sell). A launch
  reports its `tradeFee` terms and the total collected so far. Volume and market cap are curve-side
  amounts, fees excluded.
- **Graduated means 100%.** Selling after graduation lowers the curve's reserve, but a graduated
  launch always reports `progressBps: 10000`, both in the number and in the sort order.
- **Unknown assets are labelled unknown** (`symbol: null`, `decimals: null`) instead of guessed.
- **No write routes, and CORS allows nothing unless `CORS_ORIGIN` is set**, and then only GET.

## What was verified, and how

- 61 tests in `packages/chain`, including decoding of real events and the price maths checked against
  the contract's own `spot_price`.
- 21 tests in `packages/db` on a real Postgres engine (PGlite): exact 256-bit values, constraints.
- 45 tests in `apps/indexer`: the whole real scenario, chunking, restarts, same-height reorgs,
  rollbacks, a devnet reset, atomic failure, retries, and the production driver over the network
  protocol. Two of them run against a live devnet when `DEVNET_RPC` is set.
- 49 tests in `apps/api`: ranking, filters, validation, exact big numbers, CORS.
- The indexer and the API were also started as real processes against the live devnet and queried
  over HTTP.
- Each suite was checked by breaking the code on purpose and confirming a test fails. That found
  two gaps, which are now covered.

## What is not verified, or not built

- **Real Neon.** Nothing has run against Neon itself. The tests use PGlite, and the production driver
  was exercised over TCP against PGlite's server, which is Postgres-compatible but not Postgres.
  Run the migration and the indexer against a Neon branch before relying on it.
- **Polling, not Apibara.** The PRD names Apibara. This indexer polls `starknet_getEvents`, which
  works against devnet, Sepolia and any provider with no extra account, and is testable end to end.
  It makes one call per curve per pass, which is fine for hundreds of launches and wasteful for
  tens of thousands. `ChainSource` in `apps/indexer/src/indexer.ts` is the seam for an
  Apibara-backed source.
- **Reorg depth is bounded.** A reorg deeper than `REORG_OVERLAP_BLOCKS` is not fully corrected.
- **The start block matters.** A launch made before it is never indexed. With `NETWORK` set it comes from the deployment record, so it cannot be set wrong; with `FACTORY_ADDRESS` it is on you.
- **A cross-asset value ranking** (needs a STRK/USD price feed) and the landing page's "ranked by
  value" with real launches.
- **No rate limiting, authentication or caching** on the API yet.
- **No API deployment, no process supervision**, no metrics beyond `/health`.
- **Workers, Redis and the AI services** from the PRD are not started.

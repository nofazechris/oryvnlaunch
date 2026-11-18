# Launching on Starknet Sepolia (testnet)

The code is ready for this. These are the steps, in order. Steps marked **you** need something only
you can do (an account, a key, a connection string). Never paste a private key or a connection
string into chat, an issue or a screenshot.

## What you need first

| | What | Where |
|---|---|---|
| you | A Neon project (the database) | <https://neon.tech> |
| you | A Starknet **Sepolia deployer account**, funded with testnet STRK | steps 2 below, faucet: <https://faucet.starknet.io> |
| you | A Starknet **RPC URL** for Sepolia. Public endpoints work for a trial but rate-limit; a keyed endpoint from an RPC provider is steadier | your provider's dashboard |
| optional | Testnet USDC, to try paying the deploy fee in USDC | <https://faucet.circle.com> |
| done | Contracts, deploy script, indexer, API, database schema | this repo |

Which database? **Neon**, which is serverless Postgres. The schema and migrations are in
`packages/db`.

## 1. The database (you)

1. Create a Neon project. Open **Connect** and copy two connection strings for the same database:
   the **pooled** one (host contains `-pooler`) and the **direct** one.
2. Copy `.env.example` to `.env` and paste them in as `DATABASE_URL` (pooled) and
   `DATABASE_URL_DIRECT` (direct). `.env` is git-ignored.
3. Check it: `pnpm db:check`. It tells you whether each string works and never prints the password.
4. Create the tables: `pnpm db:migrate`. Safe to run again.
5. `pnpm db:check` once more: it should say "tables are in place".

## 2. The deployer account (you)

Inside WSL (Ubuntu), from `contracts/`. The private key stays in sncast's own store, never in this repo.

```bash
sncast account create --network sepolia --name oryvn-deployer
# It prints an address. Fund that address with Sepolia STRK from the faucet, then:
sncast account deploy --network sepolia --name oryvn-deployer
```

Use two other addresses for the **factory owner** and the **fee recipient** (your own wallets, for
example Argent X or Braavos). Do not use the deployer for those.

## 3. Deploy the contracts (you)

```bash
cd contracts
ACCOUNT=oryvn-deployer \
FACTORY_OWNER=0x... \
FEE_RECIPIENT=0x... \
bash scripts/deploy.sh --dry-run     # estimates only, sends nothing
bash scripts/deploy.sh               # the real one: shows a summary, you type 'deploy'
```

Defaults: every token trades in STRK and graduates after raising 1,000 STRK. The one-time deploy fee is
10 STRK if paid in STRK, or 2 USDC if paid in USDC (USDC is only a way to pay the fee). 1% trading fee,
half to the creator. Change them with the variables listed at the top of
`scripts/deploy.sh`. These are testnet numbers: price them in dollars before mainnet.

It declares the classes, deploys the factory, **reads every setting back from the chain**, records the
**block it was deployed in**, and writes `contracts/deployments/sepolia.json`. Commit that file: it holds
addresses only, no secrets, and it is how the indexer and the front end find the contracts.

## 4. Run everything

Add to `.env`: the RPC URL and the network name.

```
STARKNET_RPC_URL=https://...your sepolia rpc...
NETWORK=sepolia
```

Then, from the repo root:

```bash
pnpm install
pnpm dev        # builds the packages, then starts the web app, the API and the indexer
```

The indexer reads the factory address **and the start block** from `contracts/deployments/sepolia.json`
because of `NETWORK=sepolia`, so there is nothing to copy by hand and no way to start after the deploy
block by mistake.

## 5. Check it is alive

First the all-in-one check. It reads your `.env` and `apps/web/.env.local`, asks the node and the factory
real questions, and tells you in plain words what to fix. It never prints a connection string.

```bash
pnpm preflight
```

Then, with the API running:

```bash
curl http://localhost:4000/health          # database ok, and the indexer's latest block
curl http://localhost:4000/fee-assets      # STRK and USDC, each with its deploy fee
curl http://localhost:4000/prices          # what one STRK is worth in dollars
curl http://localhost:4000/launches        # empty until someone launches
```

### Running it for real (not `pnpm dev`)

Whatever you host on (Render, Railway, Fly, a VPS), the three services are three commands. The build is
the same for all of them, and the whole workspace builds cleanly for production:

| Service | Build | Start |
|---|---|---|
| API | `pnpm install --frozen-lockfile && pnpm build` | `pnpm --filter @launchpad/api start` |
| Indexer | (same build) | `pnpm --filter @launchpad/indexer start` |
| Web | (same build) | `pnpm --filter @launchpad/web start` |

Give the API and the indexer the pooled `DATABASE_URL`, the indexer `STARKNET_RPC_URL` and `NETWORK`, and
the API `CORS_ORIGIN` (your web app's address). Run `pnpm db:migrate` against the direct connection string
before the first start and after every update that adds a migration. **Run exactly one indexer.** Run the
API behind HTTPS. Back the database up: token images live in it and cannot be rebuilt from the chain.

## 6. Make the first launch

The web app reads everything from the API and launches through your own wallet. Put these in
`apps/web/.env.local` (see `apps/web/.env.example`):

```
NEXT_PUBLIC_API_URL=<where the API runs>
NEXT_PUBLIC_NETWORK=sepolia
NEXT_PUBLIC_FACTORY_ADDRESS=<factory.address from contracts/deployments/sepolia.json>
NEXT_PUBLIC_RPC_URL=<a Sepolia RPC the browser can call, for balances and trade previews>
```

Then open `/launch`, connect Argent X or Braavos (set to Sepolia), and launch. The app sends one
transaction that approves the deploy fee and calls `create_launch`, then waits for the indexer to see it.
You can still launch from the command line with `sncast` instead: approve the deploy fee on the STRK
token for the factory, then call `create_launch`. Either way the launch appears in `/launches` after a few
seconds and `/launches/<token>/trades` fills as people trade. The curve and fee behaviour is rehearsed end
to end on a local node by `contracts/scripts/smoke.sh`.

## What is not done, so you are not surprised

- **The web app has no demo data left, but its wallet flow has not met a real wallet yet.** Reading is
  tested against the real API. The launch transaction's calldata is unit-tested, but no Argent X or
  Braavos has signed one yet, so the first launch from the app is the real test.
- **Buying and selling work from the token page and the terminal.** One transaction approves exactly the
  trade amount and trades, with a preview from the curve itself, slippage protection and plain-words
  errors. Against a real devnet, the app's launch, buy and sell calls matched the curve's own previews to
  the last unit. Like launching, it has not been signed by a real Argent X / Braavos yet.
- **Holders, descriptions, links and images work.** Holder balances are built from every transfer of
  each token and match the token contract's own `balance_of` on a live devnet. A creator's description and
  links are read from the launch record and checked field by field; the picture is uploaded to the API
  (PNG, JPEG, WebP or GIF, up to 512 KB) and stored by the hash of its bytes. Anyone can upload, because a
  testnet launch needs no account. Before mainnet, require a wallet signature for uploads.
- **Nothing has run on real Neon or on Sepolia yet.** Everything is tested locally.
- **Graduation does not create a DEX pool yet.** The curve keeps trading both ways after it sells out.
- **The contracts are unaudited.** Testnet only. Do not deploy to mainnet before an independent audit.
- The scripts refuse mainnet on purpose.

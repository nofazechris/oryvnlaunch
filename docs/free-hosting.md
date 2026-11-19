# Putting oryvnlaunch online for $0

Testnet only. Everything here is on free tiers, so there are trade-offs, listed at the bottom.

| Piece | Where | Cost |
| --- | --- | --- |
| Website | Vercel (Hobby plan) | Free |
| API + indexer (one service) | Render (free web service) | Free |
| Database | Neon | Free |
| Test tokens | Starknet and Circle faucets | Free |

You need free accounts on GitHub (done), Neon (done), Render and Vercel. Sign in to Render and Vercel with
GitHub: it is one click and gives them read access to the repo.

## Before you start: have these three values ready

You already have them in your local `.env`. Keep them private. Paste them only into the host's own settings
screen. Never put them in a file in the repo, a chat or a screenshot.

1. **Neon pooled connection string.** The host name contains `-pooler`.
2. **Starknet Sepolia node URL.** The Chainstack URL from your `.env` (it contains a key).
3. The website address, which you get in step 2 below.

## Step 1: the API and indexer on Render

1. In Render choose **New**, then **Blueprint**, and pick the `oryvnlaunch` repo. Render reads `render.yaml`
   and proposes one free web service called `oryvnlaunch-api`.
2. It asks for the three settings the file leaves blank:
   - `DATABASE_URL`: the Neon pooled string.
   - `STARKNET_RPC_URL`: your Sepolia node URL.
   - `CORS_ORIGIN`: type `https://placeholder.example` for now. You fix it in step 3.
3. Create it and wait for the build (a few minutes). When it is live Render shows an address like
   `https://oryvnlaunch-api.onrender.com`. Open `<that address>/health`. You should see
   `"status":"ok"` and an indexer block number.

The service runs the API and the indexer together (`scripts/start-free.mjs`). If the indexer stops it restarts
by itself. If the API stops, Render restarts the whole thing.

## Step 2: the website on Vercel

1. In Vercel choose **Add New, Project**, and import the repo.
2. Set **Root Directory** to `apps/web`. Leave the framework as Next.js and the build settings as they are.
3. Add these environment variables (all values below are public, none is a secret):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_NETWORK` | `sepolia` |
   | `NEXT_PUBLIC_API_URL` | your Render address, with no trailing slash |
   | `NEXT_PUBLIC_FACTORY_ADDRESS` | `0x03b2c34572f3c6ac64eebb4003c0bd82cca354d48fa64cc61cfffe56e2b182b5` |
   | `NEXT_PUBLIC_RPC_URL` | `https://starknet-sepolia-rpc.publicnode.com` |
   | `TRUST_PROXY` | `1` |

   Optional, server only: `ANTHROPIC_API_KEY` if you want the AI assistant to answer. Without it the AI parts
   show an "AI is offline" notice. **Never** give a secret a name that starts with `NEXT_PUBLIC_`, because those
   are sent to every visitor's browser.
4. Deploy. Vercel gives you an address like `https://oryvnlaunch.vercel.app`.

## Step 3: tell the API where the website is

Back in Render, open the service, then **Environment**, and change `CORS_ORIGIN` to the Vercel address exactly,
with `https://` and no trailing slash. Save. Render redeploys. Without this the browser will refuse to talk to
the API.

## Check it works

- The website loads and the landing page shows real launches.
- `<render address>/health` says ok and the indexer block is close to the chain head.
- Connect a wallet on Sepolia (with test STRK from the faucet) and try a launch.

## What to expect on free tiers

- **The API sleeps after about 15 minutes with no visitors.** The next visitor waits up to about a minute while
  it wakes. The website says so instead of showing a hard error. Render's own docs describe this.
- **Data lags a little after a sleep.** The indexer remembers where it stopped and catches up when the service
  wakes, so nothing is lost. It processed roughly a thousand blocks every few seconds when we measured.
- **Render gives 750 free hours a month per account.** One always-awake service fits. Do not run a second free one.
- **Vercel's free plan is for personal, non-commercial use.** Fine for a testnet demo. Move to a paid plan before
  you charge real fees.
- **The filesystem is temporary on Render.** Nothing important lives on it: token images are stored in the database.
- Free-tier rules change. Check the current terms on the Render and Vercel pricing pages.

## When it is time to pay

The first upgrade worth making is a paid always-on instance for the API and indexer: no sleeping, so no wake-up
wait and no lag. The `render.yaml` change is one line, `plan: free` to a paid plan.

## If something fails

| Symptom | Likely cause |
| --- | --- |
| Render build fails on `pnpm install` | The build command must keep `--prod=false` so the build tools install |
| `/health` says the indexer is `null` | The first pass has not finished yet. Wait a minute and refresh |
| Website says "The data service is not answering" | The API is waking up. Wait about a minute |
| The browser console shows a CORS error | `CORS_ORIGIN` on Render does not exactly match the Vercel address |
| Launching or trading fails with "needs a Starknet node" | `NEXT_PUBLIC_RPC_URL` is missing on Vercel |

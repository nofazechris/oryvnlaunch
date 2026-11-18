# contracts

Cairo contracts for oryvnlaunch: a non-custodial token factory and bonding curve on
Starknet. Contracts are the source of truth for balances, reserves, pricing and fees.

Toolchain: Scarb 2.21.0, Starknet Foundry 0.64.1 (`snforge`, `sncast`), OpenZeppelin
Contracts for Cairo 4.0.1. On Windows, run everything inside WSL (Ubuntu), installed with
[starkup](https://github.com/software-mansion/starkup).

```bash
scarb build
snforge test
```

## Contracts

| Contract | What it does |
|---|---|
| `TokenFactory` | One call (`create_launch`) charges the deploy fee, deploys a token and its curve, and distributes the supply. Ends the call holding nothing. Keeps the list of quote assets and each one's fee and raise. |
| `OryvnToken` | ERC-20, 1,000,000,000 supply, 18 decimals. No mint, no owner, no pause, no upgrade. |
| `BondingCurve` | One per launch. Holds the tokens and the quote asset, prices every trade on-chain, pays traders directly, and accrues the 1% trading fee for the creator and the platform to claim. No owner, no admin keys, no upgrade. |
| `curve_math` | Pure pricing functions, unit and fuzz tested on their own, at STRK and USDC scale. |

## Trading asset and deploy-fee asset

Two different things, kept apart on purpose:

- **Every token trades in STRK.** The factory's `default_quote_token` is STRK, and
  `create_launch_paying_in` always builds a STRK curve. Nothing is converted inside the contracts, and no
  token trades in USDC.
- **A creator can pay the one-time deploy fee in STRK or in USDC.** Each fee asset has its own fee
  (`set_fee_asset`), paid straight from the creator to the fee recipient in that asset. Choosing USDC only
  changes how the creator pays: the token is still a STRK token.

Why: it keeps trading in one asset (so market caps, rankings and fees are all in STRK and can be shown in
dollars with one rate), and keeps Circle's pause and blocklist powers away from every trade. The only thing
USDC can affect is whether a launch paid in USDC goes through.

- The fee is priced **per asset, in dollars you choose**, because "10 STRK" and "2 USDC" are different money
  and STRK's price moves. The owner reprices a fee asset with `set_fee_asset` as the market moves.
- The factory reads each asset's `decimals()` itself, so the fee cap is "100 whole units" of whichever asset
  and a wrong-decimals token cannot sneak in. Only assets with 6 to 18 decimals are accepted.
- Disabling a fee asset only stops *new* launches paid in it. Existing curves are unaffected.
- The original `create_launch` (curve and fee in the same asset) is still in the contract, and the curve code
  is still generic over any asset, but the product does not list USDC as a curve asset, so nothing uses it.
- `spot_price` is returned scaled by 1e18 so that any asset keeps its precision.
- **USDC is issued by Circle and can be paused, blocklisted or upgraded by Circle.** If Circle pauses it,
  launches paid in USDC fail until it is lifted; launches paid in STRK and all trading are unaffected. Use
  Circle's native USDC, not the older bridged "USDC.e".
- Paying with an asset you don't hold is meant to be a one-click swap bundled in the same wallet transaction
  by the frontend. It is not contract logic, and it is not built yet.

## Decisions

- **Curve:** constant product with a virtual reserve of the quote asset. Presets set the reserve
  as a share of the graduation raise `R`: Gentle `v = R` (4x price from first trade to
  graduation), Standard `v = R/2` (9x), Steep `v = R/4` (25x). Selling the full curve supply
  always raises `R`, whichever preset. Fully diluted value at graduation is about 2.5R, 3.75R
  and 6.25R respectively (all 1B tokens at the final price). Every division rounds in the
  curve's favour, so `x * y >= k` always holds and rounding cannot drain it (fuzz tested).
- **Supply split:** 80% sold on the curve, 0 to 5% to the creator (`creator_bps`, capped at
  500), the rest held by the curve, untouched, for the post-graduation pool.
- **Graduation is a milestone, not a lock.** When the last curve token is bought, `graduated`
  is set (once, for good) and `Graduated` is emitted. The trading rules do not change: the curve
  keeps pricing both ways. While every token is sold there is nothing left to buy, so a buy
  reverts with `CURVE_SOLD_OUT`; as soon as a holder sells some back, buying works again. Nobody
  is locked out and nobody is trapped. The final buy only charges what the remaining tokens
  cost. (An earlier version kept buying switched off after graduation while selling stayed open.
  That was unfair to later buyers and protected nothing, since sells drained the curve anyway,
  so it was removed.)
- **Deploy fee:** paid straight from the creator to the fee recipient (it never sits in the
  factory). Owner-settable per asset, hard-capped at 100 whole units. Changing it only affects new
  launches.
- **Trading fee: 1% per trade, half to the creator and half to the platform.** Together with the
  deploy fee this is where the platform earns, and it gives creators a reason to build a token
  people trade.
  - *What it is charged on:* the curve-side amount of the trade. A buyer pays that amount plus 1%;
    a seller receives that amount minus 1%. It is rounded up, so a tiny trade still pays at least one
    unit of fee. The price on the curve is not affected: the same tokens cost the same curve amount
    with or without a fee.
  - *Where it goes:* it is **accrued** inside the curve, separately from the reserve, and paid out
    when someone calls `claim_creator_fees()` or `claim_platform_fees()`. Anyone can call either
    (for example a bot, or the creator's app), but the money can only go to the creator or to the
    factory's current fee recipient. Trading never sends money to a third party, so a recipient that
    cannot receive (for example an address Circle has blocklisted for USDC) cannot block anyone's
    trade. The platform's claim asks the factory who the recipient is at claim time, so the platform
    can move its treasury and every existing curve follows.
  - *Limits:* the fee is capped at 3% in the factory **and** in every curve, so even a compromised
    owner key cannot raise it above that, and a curve's fee is fixed for its whole life. The owner
    can change the fee and the split for future launches only (`set_trade_fee`).
  - *The curve always holds exactly its reserve plus the fees it owes, and nothing else* (tested).
- **Owner powers (factory only):** list/enable/disable quote assets and set their fee and raise,
  set the trading fee and its split (for future launches, capped at 3%), change the fee recipient,
  and pause *new* launches. Nothing the owner does can touch an existing token or curve, and
  trading never goes through the factory.
- **Slippage:** `buy(max_quote_in, min_tokens_out)` and `sell(tokens_in, min_quote_out)`.
  `max_quote_in` is the most the buyer pays *in total, fee included*; `min_quote_out` is the least
  the seller receives *after the fee*. Both revert if the limit is not met. Quotes (`quote_buy`,
  `quote_sell`) match the executed trade exactly, fee included.

## Events (for the indexer)

- `TokenFactory::LaunchCreated`: creator, token, curve, quote token, launch id, name, symbol,
  metadata URI, preset, creator bps, graduation raise, deploy fee, trading fee (bps) and the
  creator's share of it.
- `TokenFactory::QuoteTokenSet`: an asset was enabled, disabled or repriced.
- `BondingCurve::TokensBought` / `TokensSold`: trader, the curve-side amount in the quote asset's
  smallest unit, the fee, and the reserves *after* the trade, so price and market cap can be
  derived from the event alone. A buyer paid `quote_in + fee`; a seller received `quote_out - fee`.
- `BondingCurve::Graduated`.
- `BondingCurve::FeesClaimed`: who was paid, whether it was the creator's share, and how much.

## Deploying

Everything runs inside WSL (Ubuntu). Use `bash scripts/<name>.sh` from `contracts/`.

`scripts/deploy.sh` declares the three classes, deploys the factory with its quote assets, reads
every setting back from the chain to confirm it, and writes `deployments/<network>.json`. Token
and curve instances are not deployed by hand: the factory deploys one pair per launch.

It never touches a key. Signing is done by `sncast` with the account you name, so create that
account yourself, and use a *different* address for the factory owner and the fee recipient.

### Sepolia

```bash
# 1. A deployer account. The private key stays in sncast's own store, not in this repo.
sncast account create --network sepolia --name oryvn-deployer
# 2. Fund the address it prints with Sepolia STRK from https://faucet.starknet.io, then:
sncast account deploy --network sepolia --name oryvn-deployer

# 3. Deploy. OWNER and TREASURY are your own wallet addresses (Argent X / Braavos).
ACCOUNT=oryvn-deployer \
FACTORY_OWNER=0x...     \
FEE_RECIPIENT=0x...     \
bash scripts/deploy.sh
```

By default it enables STRK (10 STRK fee, 1,000 STRK raise) and Circle's Sepolia USDC (15 USDC
fee, 10,000 USDC raise), with a 1% trading fee split half and half. Change them with
`STRK_DEPLOY_FEE`, `STRK_GRADUATION_RAISE`, `USDC_DEPLOY_FEE`, `USDC_GRADUATION_RAISE`,
`TRADE_FEE_BPS` (100 = 1%, refused above 300) and `CREATOR_FEE_SHARE_BPS` (5000 = half); set
`USDC_ADDRESS=none` for a STRK-only factory. Before
sending anything it asks the USDC token for its decimals and refuses if it isn't 6, which catches
a wrong address or network. It prints a summary and waits for you to type `deploy`. `--dry-run`
estimates without sending; `--yes` skips the prompt.

To test a USDC launch you need Sepolia USDC, which Circle's faucet hands out for free
(https://faucet.circle.com).

The script refuses mainnet on purpose: review the curve maths and put the owner behind a multisig
first. On mainnet, set the fee and raise from a dollar target at the STRK price that day, not
from these testnet defaults. Once `deployments/sepolia.json` exists, commit it so the frontend and
indexer read their addresses from one place.

### Rehearse locally first

```bash
bash scripts/devnet.sh start      # terminal 1: local node (public throwaway test keys)
bash scripts/devnet.sh accounts   # terminal 2: import its accounts into devnet-accounts.json
# deploy.sh with NETWORK=devnet RPC_URL=http://127.0.0.1:5050/rpc ACCOUNTS_FILE=devnet-accounts.json
bash scripts/smoke.sh             # launch, buy, sell, graduate, sell out and reopen, on a real node
```

Devnet predeploys STRK at the real address, so the rehearsal uses the same STRK constructor
arguments as Sepolia. Devnet has no USDC, so the smoke test covers the STRK path on a real node;
the USDC path (6 decimals) is covered by `snforge test`, and on Sepolia by a real USDC launch.

## Not done yet

- A real-network USDC launch. The USDC path is tested in the simulator and the script checks the
  Sepolia USDC token on chain, but no launch has been run against Circle's contract yet.
- The swap-to-pay flow (pay with USDC, buy a STRK token, and the reverse).
- Post-graduation pool creation (the reserved supply and raised assets are not migrated). Because
  the curve stays open both ways, whatever the curve holds at migration time is what seeds the
  pool; the raise is not locked away in the meantime.
- Independent review of the curve maths before mainnet. The tests are not an audit.
- Using the real STRK and Circle USDC addresses is a constructor argument: double-check them
  against Starknet's and Circle's docs before any mainnet deploy.

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
| `BondingCurve` | One per launch. Holds the tokens and the quote asset, prices every trade on-chain, pays traders directly. No owner, no admin keys, no upgrade. |
| `curve_math` | Pure pricing functions, unit and fuzz tested on their own, at STRK and USDC scale. |

## Quote assets: STRK or USDC

A creator chooses the quote asset when launching, and the token's curve is paired with it for
life: a STRK launch trades in STRK, a USDC launch trades in USDC. Nothing is converted inside the
contracts.

- Each asset has its **own deploy fee, paid in that asset**, and its **own graduation raise**,
  because "10 STRK" and "10 USDC" are different money. USDC launches are meant to cost more.
- The factory reads each asset's `decimals()` itself, so the fee cap is "100 whole units" of
  whichever asset (100 STRK, 100 USDC) and a wrong-decimals token cannot sneak in. Only assets
  with 6 to 18 decimals are accepted.
- The owner can list a new asset, change an asset's fee or raise, or disable it. Disabling only
  stops *new* launches; existing curves keep trading.
- The curve maths works in the asset's smallest unit and does not know which asset it is.
  `spot_price` is returned scaled by 1e18 so 6-decimal assets keep their precision.
- **USDC is issued by Circle and can be paused, blocklisted or upgraded by Circle.** Its Starknet
  contract has those controls. If Circle freezes an address or pauses the token, payouts in USDC
  stop with it and the curve cannot work around that. Say so in the interface before a creator
  or buyer picks USDC. Use Circle's native USDC, not the older bridged "USDC.e".
- Paying with an asset you don't hold (for example buying a STRK token with USDC) is meant to be
  a one-click swap bundled in the same wallet transaction by the frontend. It is not contract
  logic, and it is not built yet.

## Decisions

- **Curve:** constant product with a virtual reserve of the quote asset. Presets set the reserve
  as a share of the graduation raise `R`: Gentle `v = R` (4x price from first trade to
  graduation), Standard `v = R/2` (9x), Steep `v = R/4` (25x). Selling the full curve supply
  always raises `R`, whichever preset. Fully diluted value at graduation is about 2.5R, 3.75R
  and 6.25R respectively (all 1B tokens at the final price). Every division rounds in the
  curve's favour, so `x * y >= k` always holds and rounding cannot drain it (fuzz tested).
- **Supply split:** 80% sold on the curve, 0 to 5% to the creator (`creator_bps`, capped at
  500), the rest held by the curve, untouched, for the post-graduation pool.
- **Graduation:** when the last curve token is bought, buying freezes and selling stays
  open. The final buy only charges what the remaining tokens cost.
- **Deploy fee:** paid straight from the creator to the fee recipient (it never sits in the
  factory). Owner-settable per asset, hard-capped at 100 whole units. This is the platform's
  revenue. Changing it only affects new launches.
- **Owner powers (factory only):** list/enable/disable quote assets and set their fee and raise,
  change the fee recipient, and pause *new* launches. Nothing the owner does can touch an
  existing token or curve, and trading never goes through the factory.
- **Slippage:** `buy(max_quote_in, min_tokens_out)` and `sell(tokens_in, min_quote_out)`.
  Both revert if the limit is not met. Quotes (`quote_buy`, `quote_sell`) match the
  executed trade exactly.

## Events (for the indexer)

- `TokenFactory::LaunchCreated`: creator, token, curve, quote token, launch id, name, symbol,
  metadata URI, preset, creator bps, graduation raise, deploy fee.
- `TokenFactory::QuoteTokenSet`: an asset was enabled, disabled or repriced.
- `BondingCurve::TokensBought` / `TokensSold`: trader, amounts in the quote asset's smallest
  unit, and the reserves *after* the trade, so price and market cap can be derived from the
  event alone.
- `BondingCurve::Graduated`.

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
fee, 10,000 USDC raise). Change them with `STRK_DEPLOY_FEE`, `STRK_GRADUATION_RAISE`,
`USDC_DEPLOY_FEE`, `USDC_GRADUATION_RAISE`; set `USDC_ADDRESS=none` for a STRK-only factory. Before
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
bash scripts/smoke.sh             # launch, buy, sell, graduate and freeze, on a real node
```

Devnet predeploys STRK at the real address, so the rehearsal uses the same STRK constructor
arguments as Sepolia. Devnet has no USDC, so the smoke test covers the STRK path on a real node;
the USDC path (6 decimals) is covered by `snforge test`, and on Sepolia by a real USDC launch.

## Not done yet

- A real-network USDC launch. The USDC path is tested in the simulator and the script checks the
  Sepolia USDC token on chain, but no launch has been run against Circle's contract yet.
- The swap-to-pay flow (pay with USDC, buy a STRK token, and the reverse).
- Post-graduation pool creation (the reserved supply and raised assets are not migrated).
- Independent review of the curve maths before mainnet. The tests are not an audit.
- Using the real STRK and Circle USDC addresses is a constructor argument: double-check them
  against Starknet's and Circle's docs before any mainnet deploy.

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
| `TokenFactory` | One call (`create_launch`) charges the deploy fee, deploys a token and its curve, and distributes the supply. Ends the call holding nothing. |
| `OryvnToken` | ERC-20, 1,000,000,000 supply, 18 decimals. No mint, no owner, no pause, no upgrade. |
| `BondingCurve` | One per launch. Holds the tokens and the STRK, prices every trade on-chain, pays traders directly. No owner, no admin keys, no upgrade. |
| `curve_math` | Pure pricing functions, unit and fuzz tested on their own. |

## Decisions

- **Curve:** constant product with a virtual STRK reserve. Presets set the reserve as a
  share of the graduation raise `R`: Gentle `v = R` (4x price from first trade to
  graduation), Standard `v = R/2` (9x), Steep `v = R/4` (25x). Selling the full curve
  supply always raises `R`, whichever preset. Every division rounds in the curve's favour,
  so `x * y >= k` always holds and rounding cannot drain it (fuzz tested).
- **Supply split:** 80% sold on the curve, 0 to 5% to the creator (`creator_bps`, capped at
  500), the rest held by the curve, untouched, for the post-graduation pool.
- **Graduation:** when the last curve token is bought, buying freezes and selling stays
  open. The final buy only charges what the remaining tokens cost.
- **Deploy fee:** paid in STRK, straight from the creator to the fee recipient (it never
  sits in the factory). Owner-settable, hard-capped at 100 STRK. This is the platform's
  revenue. Changing it only affects new launches.
- **Owner powers (factory only):** set the deploy fee, fee recipient and graduation raise,
  and pause *new* launches. Nothing the owner does can touch an existing token or curve,
  and trading never goes through the factory.
- **Slippage:** `buy(max_strk_in, min_tokens_out)` and `sell(tokens_in, min_strk_out)`.
  Both revert if the limit is not met. Quotes (`quote_buy`, `quote_sell`) match the
  executed trade exactly.

## Events (for the indexer)

- `TokenFactory::LaunchCreated`: creator, token, curve, launch id, name, symbol, metadata
  URI, preset, creator bps, graduation raise, deploy fee.
- `BondingCurve::TokensBought` / `TokensSold`: trader, amounts, and the reserves *after*
  the trade, so price and market cap can be derived from the event alone.
- `BondingCurve::Graduated`.

## Deploying

Everything runs inside WSL (Ubuntu). Use `bash scripts/<name>.sh` from `contracts/`.

`scripts/deploy.sh` declares the three classes, deploys the factory wired to them, reads every
setting back from the chain to confirm it, and writes `deployments/<network>.json`. Token and
curve instances are not deployed by hand: the factory deploys one pair per launch.

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
DEPLOY_FEE_STRK=10      \
GRADUATION_RAISE_STRK=1000 \
bash scripts/deploy.sh
```

It prints a summary and waits for you to type `deploy`. `--dry-run` estimates without sending;
`--yes` skips the prompt. The script refuses mainnet on purpose: review the curve maths and put
the owner behind a multisig first. Once `deployments/sepolia.json` exists, commit it so the
frontend and indexer read their addresses from one place.

### Rehearse locally first

```bash
bash scripts/devnet.sh start      # terminal 1: local node (public throwaway test keys)
bash scripts/devnet.sh accounts   # terminal 2: import its accounts into devnet-accounts.json
# deploy.sh with NETWORK=devnet RPC_URL=http://127.0.0.1:5050/rpc ACCOUNTS_FILE=devnet-accounts.json
bash scripts/smoke.sh             # launch, buy, sell, graduate and freeze, on a real node
```

Devnet predeploys STRK at the real address, so the rehearsal uses the same constructor
arguments as Sepolia.

## Not done yet

- Post-graduation pool creation (the reserved supply and raised STRK are not migrated).
- Independent review of the curve maths before mainnet. The tests are not an audit.
- Deployment scripts and a Sepolia deployment.
- The STRK address is a constructor argument; use the real STRK token on Sepolia/mainnet.

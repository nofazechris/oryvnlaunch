# Funding: getting STRK or USDC into a Starknet wallet

oryvnlaunch lives entirely on Starknet. Tokens are deployed on Starknet, curves trade in STRK or
USDC on Starknet, and nothing about a launch happens on another chain. "Funding" is only the
question of how a user ends up holding STRK or USDC in their own Starknet wallet. It is a
front-end flow around the contracts, not part of them, and **we never build or run a bridge.**

## The three situations

| The user has | Needs | How |
|---|---|---|
| The right asset on Starknet | nothing | Pay directly: STRK launches in STRK, USDC launches in USDC. |
| The *other* Starknet asset (USDC for a STRK token, or the reverse) | a swap | One wallet confirmation: approve, swap on a DEX aggregator, approve the curve, then `buy` or `create_launch`. Same flow backwards for selling. |
| Funds on another chain | a bridge, then the above | "Add funds": bridge into their own Starknet wallet, then continue as above. |

## Decision: integrate through Starkzap

Use [Starkzap](https://docs.starknet.io/build/starkzap/configuration), Starknet's own TypeScript
toolkit, as the integration layer for both swaps and bridging, instead of wiring individual
providers by hand.

- **Bridging in:** deposits from Ethereum and Solana (Layerswap; Solana also via Hyperlane). It
  exposes a call that lists which tokens can be bridged from a source chain
  (`getBridgingTokens`), a fee estimate, and a deposit call that returns a transaction hash.
- **Swapping inside Starknet:** routed through AVNU and Ekubo. This covers the STRK/USDC swap.
- **Not custodial:** the bridge delivers to the user's own Starknet address. Funds never pass
  through an account we control. The UI must show the destination address and never offer to
  receive on the user's behalf.

Keep a thin adapter of our own around it (`FundingProvider`: list routes, quote, start, track
status). Screens talk to the adapter, never to the SDK. That way a provider can be replaced, or
a second one added, without touching the UI. USDC arriving from Ethereum-family chains can later
use Circle's CCTP through the same adapter: it mints native USDC on Starknet, which is exactly
the asset USDC launches need.

### Why not the others as the primary

- **Layerswap directly:** it is what Starkzap uses for Ethereum deposits anyway, so going direct
  adds work without adding reach.
- **rhino.fi:** quote, commit, then a contract call. Workable, but more of our own plumbing.
- **Orbiter:** no Starknet integration docs found; verify before considering it.
- **StarkGate:** the official Ethereum-to-Starknet bridge. Reliable, but slow and Ethereum-only. A
  fallback to mention, not the main path.

## Behaviour rules for the flow

- **Two steps, not one click.** Bridging and buying happen on different chains and cannot succeed
  or fail together. After "Add funds", show progress, and when the funds arrive let the user
  confirm the buy. Never auto-buy a bridged amount, because the price may have moved.
- **Quote before signing:** show fee, expected amount and arrival time from the provider.
- **Swap-to-pay slippage:** the swap's guaranteed minimum output is what the curve is approved
  for. `buy(max_quote_in, min_tokens_out)` already takes a maximum and a minimum, so leftover dust
  simply stays in the user's wallet.
- **Disclose USDC:** USDC is issued by Circle, which can pause or blocklist it. Say so wherever
  USDC is offered.
- **Prefer native USDC, never bridged USDC.e**, as an input or a launch asset.

## What is not verified yet

These are open until tested, and none of them is claimed here:

- Fees, limits and rate limits of the providers, and whether Layerswap's API key has terms or a
  cost.
- Which tokens each route supports, in particular whether STRK and USDC are both available from
  the chains we care about. Query `getBridgingTokens` and the swap quotes before promising it.
- Maturity: the Starkzap docs were being revised while this was written (a "V4" docs change was
  open). Pin a version and re-read the docs when integrating.
- Testnet coverage. Layerswap is described as available on testnet and Hyperlane on devnet, so
  some of this may be testable without real money; swaps and CCTP need mainnet with small amounts.
- Whether the "best price" claims made for the swap router hold up. Compare a few quotes.

## Build order

Funding needs real wallets, the backend and the indexer first, so it comes after them:

1. Real Starknet wallet connection (replacing the simulated one).
2. Swap-to-pay between STRK and USDC (no new chain, no bridge).
3. "Add funds" from other chains through the `FundingProvider` adapter.
4. CCTP for USDC if users ask for it.

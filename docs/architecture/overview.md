# Architecture overview

See the Technical PRD for the authoritative specification. Key invariants:

- **Smart contracts are the source of truth** for token balances, reserves, trade
  execution and fees. The frontend is never trusted to determine financial outcomes.
- **Non-custodial**: the platform never requests or stores seed phrases or private keys.
  Every financial transaction is authorised by the user's wallet. Starknet smart-account
  signature model (not Ethereum EOA assumptions).
- **AI is advisory only**: it never signs transactions, moves funds, changes contract
  permissions, or presents invented data as verified. Uses indexed on-chain data.
- **Exact arithmetic**: token amounts and financial values use integer / arbitrary-
  precision representations. No JS floating point as a source of truth.
- **Confirm on-chain**: deployment/trade success is confirmed via chain tx status and
  indexed events, never a frontend callback alone.

## Build order (do not reverse)

1. Token factory → 2. Bonding-curve contracts + buy/sell → 3. Indexing & market data →
4. AI integration → 5. Creator/portfolio/trading UX → 6. Testing & hardening →
7. Bridge (Phase 8) → 8. Post-graduation ecosystem (Phase 9).

## Engineering decisions log

- **2026-11-09** — Monorepo scaffolded (pnpm workspaces + Turborepo). Frontend landing
  page implemented first in `apps/web` to preserve the design PRD aesthetic (Phase 1).
  Stack pinned: Next.js 15, React 19, TypeScript 5.7, Tailwind 3.4, Framer Motion 11,
  Zustand 5. Landing-page data is preview/mock, labelled as not live.

- **2026-11-12** — Contracts: virtual-reserve constant-product curve with Gentle/Standard/Steep
  presets; creators launch in STRK or USDC, each with its own deploy fee (the platform's revenue,
  capped on-chain at 100 whole units) and graduation raise; buys freeze at graduation, sells stay
  open. See `contracts/README.md`.
- **2026-11-12** — Funding from other chains goes through an existing bridge (Starkzap, Layerswap
  underneath), never our own, behind our own thin adapter. See `docs/architecture/funding.md`.
- **2026-11-12** — Data layer: Postgres on Neon, Drizzle, a polling indexer instead of Apibara
  (testable against devnet/Sepolia with no extra account; Apibara can replace the `ChainSource`
  later), and a read-only NestJS API. Amounts are exact: `numeric(78,0)` in the database, decimal
  strings in JSON. See `docs/architecture/data-layer.md`.

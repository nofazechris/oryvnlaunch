# Launchpad — AI-powered Starknet token launchpad

A non-custodial, AI-assisted token launchpad on Starknet. Creators connect a wallet,
configure a token, deploy it through an audited factory, launch it on a bonding curve,
and users buy/sell directly on the curve. AI assists with naming, tokenomics, contract
intelligence and research — it never controls funds or signs transactions.

> Smart contracts are the source of truth for balances, reserves, trade execution and
> fees. The frontend and backend never determine financial outcomes.

## Monorepo layout

```
launchpad/
├── apps/
│   ├── web/        # Next.js frontend (implemented — landing page live)
│   ├── api/        # NestJS backend        (planned — Phase 1+)
│   ├── indexer/    # Apibara event indexer (planned — Phase 4)
│   └── workers/    # BullMQ background jobs (planned — Phase 4)
├── contracts/      # Cairo contracts (factory, bonding curve, fees) (planned — Phase 2)
├── services/
│   └── ai/         # Python AI/analytics — introduced only when the workload needs it
├── packages/       # ui, shared, config, starknet, validation, types (extracted as needed)
├── infrastructure/ # docker, monitoring, deployment
└── docs/           # architecture, contracts, api, security
```

Per the PRD, empty services are **not** scaffolded just to match the diagram — each
app/package is introduced when the work reaches it. Directory placeholders document intent.

## Current status

**Phase 1 (Foundation) — in progress.** The frontend landing page from the design PRD
("oryvnlaunch") is implemented in `apps/web`, preserving the dark editorial aesthetic,
flowing contour background, token cards, animations and the AI launch-assistant panel.

Data on the landing page is **preview/mock** (ported from the design's `oryvn-data.js`)
and clearly labelled "Preview data · not live". It will be replaced with indexer/RPC
data as the backend and contracts come online.

## Prerequisites

- Node.js >= 20 (tested on 24)
- pnpm 9

## Getting started

```bash
pnpm install
pnpm dev          # runs all apps via Turborepo
# or just the web app:
pnpm --filter @launchpad/web dev
```

The web app runs at http://localhost:3000.

### AI launch assistant

The landing page's "Create with AI" panel calls `POST /api/ai/launch-assistant`. Set
`ANTHROPIC_API_KEY` in `apps/web/.env.local` to use Claude; without a key it returns a
deterministic local fallback so the UI stays functional. See `apps/web/.env.example`.

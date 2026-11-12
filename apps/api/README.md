# api

Read-only HTTP API (NestJS on Fastify) over the indexed data. It cannot move funds or change a
launch, and has no write routes.

```bash
DATABASE_URL=postgres://... CORS_ORIGIN=http://localhost:3000 pnpm --filter @launchpad/api start
```

| Route | Returns |
|---|---|
| `GET /launches` | List; `sort=newest\|progress\|marketcap\|volume`, filters `quote`, `creator`, `graduated`, `limit`, `offset` |
| `GET /launches/:token` | One launch with market numbers and graduation progress |
| `GET /launches/:token/trades` | Trades, newest first |
| `GET /quote-tokens` | Assets creators can launch in, with each one's fee and raise |
| `GET /health` | Database reachability, and the indexer's latest block and age |

Every amount is a decimal string in the asset's smallest unit; format with `quote.decimals`.
`sort=marketcap` and `sort=volume` need `quote=<asset>` because STRK and USDC amounts are not
comparable; `sort=progress` and `sort=newest` compare across assets.

Planned and not built: auth, rate limiting, caching, the PRD's other modules (wallets, portfolio,
AI, notifications). Full notes: `docs/architecture/data-layer.md`.

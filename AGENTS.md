# AGENTS.md

## What this is

Online Reset (AI Solutions NZ) is a white-labelled AEO/GEO platform: it measures how AI answer engines mention, cite and recommend a client's business, audits the client's site, finds evidence-backed opportunities, and runs an approval-gated optimisation workflow. It is a fork of Elmo (MIT) — a **pnpm + Turborepo monorepo** on **Node.js 24**, **TypeScript**, **PostgreSQL**. Read `BUILD-STATUS.md` first, then `docs/research/05-recommended-architecture.md`.

- `apps/web` — dashboard + API + MCP (TanStack Start, port 3000)
- `apps/worker` — pg-boss background jobs
- `apps/cli` — upstream deployment CLI (not used by Online Reset yet)
- `packages/lib` — shared logic, Drizzle schema/migrations
- `packages/or-core` — Online Reset domain logic (measurement rules, matcher, SoV, NZ geo, scoring)
- `packages/ui`, `packages/config`, `packages/deployment`, `packages/api-spec`, `packages/og`, `packages/site-audit`

## Non-negotiable rules

- Never commit credentials, API keys or customer data. Use `.env` (git-ignored); `.env.example` holds placeholders only.
- Never call a paid provider in tests. Fixture providers are labelled `collection_method = fixture` and must never be shown or aggregated as live results.
- Never aggregate metrics across different `collection_method` values.
- Raw provider output (`prompt_runs.raw_output`) is immutable.
- Nothing is published to a client system without a recorded approval; publishing is idempotent.
- Code copied from another project keeps its licence header and is listed in `UPSTREAM.md` and `THIRD_PARTY_NOTICES.md`. Never copy GPL/AGPL/FSL/enterprise-licensed code.
- Tenant data access from new code goes through `withTenant()` (database-enforced RLS).

## Commands

- `pnpm dev` — all dev servers (turbo)
- `pnpm test` — Vitest unit tests
- `pnpm build` — build all packages
- `pnpm format` — Biome format
- `pnpm lint` — Biome check (errors only; warnings are not gated)
- `pnpm lint:fix` — apply everything Biome can fix on its own
- Migrations: from `packages/lib`, `pnpm exec drizzle-kit migrate` (NEVER RUN THESE UNLESS EXPLICITLY INSTRUCTED BY THE USER)
- E2E tests need Playwright browsers (`pnpm exec playwright install`) and a running app; they are separate from unit tests
- shadcn components: always install with the CLI (`pnpm dlx shadcn@latest add <component>`, from `packages/ui` or `apps/www` — each has its own `components.json`) — never hand-create them

Don't run formatting, linting, type checks, or tests after every change — only to diagnose what you're working on, or when asked.

Before handing work back or opening a PR, run `pnpm lint` and get it passing; CI fails on it. `pnpm lint:fix` handles the rest. Never silence a lint error with `biome-ignore` — fix the code.

## Tests

- Add tests for the purpose and externally observable behavior of the code, not its implementation shape. Do not test that internal helpers, component structure, configuration objects, or incidental markup have a particular form unless that form is itself a supported contract.
- Prefer tests that exercise a user outcome, public API, business rule, failure mode, or regression. A refactor that preserves behavior should not require test changes.

## Package management and supply-chain security

- **Always use pnpm.** Never install or run dependencies with npm, yarn, or `npx` — that sidesteps the workspace's protections.
- A dependency that more than one package uses is versioned once, in the `catalog` in `pnpm-workspace.yaml`, and each package depends on it as `"catalog:"`. Peer dependency ranges stay as written: they state compatibility, not the version we install.
- This repo enforces [pnpm supply-chain security](https://pnpm.io/supply-chain-security) via `pnpm-workspace.yaml`: `minimumReleaseAge` (a multi-day cooldown on new releases), `trustPolicy: no-downgrade`, `blockExoticSubdeps`, and an `allowBuilds` allowlist for install scripts.
- **Never weaken or bypass these controls**: don't add `minimumReleaseAgeExclude` entries, don't flip packages to `true` in `allowBuilds`, don't suppress `pnpm audit` advisories, and don't remove `overrides` (many are scoped security patches or dedup anchors). If an install fails because of these controls, that is the system working — report it instead of working around it.

## Environment

`.env` must exist at **both** the repo root and `apps/web/.env` (Vite reads its project root; the worker reads `apps/web/.env` via `--env-file`). Minimum for local mode: `DATABASE_URL`, `DEPLOYMENT_MODE=local`, `BETTER_AUTH_SECRET`, `ELMO_ENCRYPTION_KEY` (`openssl rand -base64 32`), `APP_URL`/`VITE_APP_URL`, `DISABLE_TELEMETRY=1`, and `SCRAPE_TARGETS` plus the keys of the providers it names. Env validation also requires one direct LLM key (`OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `ANTHROPIC_API_KEY`, or `MISTRAL_API_KEY`) for onboarding and the Opportunities report, and the worker needs `TYPESAFE_API_KEY`, or `OPENROUTER_API_KEY` to call Jev through OpenRouter (Jev judges mentions and sentiment). For UI-only work, `SCRAPE_TARGETS=stub:stub`, `ONBOARDING_LLM_TARGET=stub:stub` and `TYPESAFE_API_KEY=stub` need no keys at all.


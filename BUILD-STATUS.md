# Online Reset: Build Status

_Last updated: 2026-11-07. Current milestone: **5 (reporting and platform QA)**. A first pass of every milestone is implemented, but some items remain open; see "Missing functionality"._

## How to verify everything below

```bash
pnpm install
pnpm test                                    # 2,008 unit tests (9 packages)
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/elmo_test \
  pnpm -C packages/lib test:integration      # 54 Postgres tests
# same for apps/worker (34) and apps/web (65)
pnpm lint                                    # Biome, 878 files, 0 errors
DATABASE_URL=postgres://… pnpm -C apps/worker or:demo -- --org default   # Christchurch demo
```

## Repository

- **The GitHub repository was not created.** This session's GitHub access only covers `ai-solutions-nz/fix-issues`, and repository creation is not permitted here. The project exists as a local git repository (`/home/user/online-reset-platform`). To make it permanent:
  1. Create an empty private repository, `ai-solutions-nz/online-reset-platform`.
  2. Attach it to the session.
  3. Push `main`.
- The fork keeps Elmo's history. `upstream` points at `elmohq/elmo`, and the base is `db2d52b`.

## Completed features (each has implementation and test evidence)

| Area | What works | Evidence |
|---|---|---|
| **M1 Foundation** | Elmo fork; PostHog telemetry removed (worker, CLI, web fallback key); upstream-only workflows removed (including the scheduled live-provider job that spent API credit); research imported into `docs/research/`. | Baseline: 1,974 unit + 63 integration Elmo tests passed before any change. |
| M1 Tenant isolation | `or_tenant` role, row-level-security (RLS) policy per table derived from its tenancy column (deny by default), `withTenant()`, the shared `db` handle follows the tenant transaction, `client` role limited to granted brands. | `packages/lib/src/db/tenant.integration.test.ts` (9 tests): cross-tenant reads return nothing, writes are rejected, untenanted tables are denied, every keyed table has a policy. `or/tenant-scope.integration.test.ts` (3). |
| M1 Audit log | Append-only `or_audit_log`; a trigger rejects update and delete. Every workflow step writes to it. | Isolation suite; the optimisation suite asserts the full action sequence. |
| M1 Credentials | CMS secrets encrypted with Elmo's AES-GCM keyring, bound to their row (AAD), and decrypted only in memory. | Optimisation suite asserts no plaintext is stored. |
| **M2 Evidence model** | Every run stores collection method, requested and applied location, methodology version, model, timestamp and immutable raw output. Metrics refuse to mix methods. | `or-core/measurement.test.ts`, `lib/or/collection.test.ts`. |
| M2 NZ location | OpenAI and Anthropic web search get `user_location` (Christchurch, Canterbury, NZ). DataForSEO SERP, AI-mode and scraper calls get `location_name`. Elmo's hard-coded US location is replaced. Runs record whether the location was applied. | Request-payload tests in `openai-api.test.ts`, `anthropic-api.test.ts`, `dataforseo.test.ts`, `geo.test.ts`. |
| M2 Buyer questions | Intent-diverse local templates (no model spend), validation with reasons, near-duplicate merging, and re-seeding that skips rewordings. | `questions.test.ts`; `visibility-service.integration.test.ts`. The demo seeds exactly 30. |
| M2 Analysis | Deterministic mention, list-rank and recommendation detection (Limelit port). Share of voice with publication floors (Canonry port). Per-engine, weekly, per-question, competitor and cited-source summaries, recomputed from stored evidence. | 33 ported Limelit cases + 24 phrase cases; `visibility.test.ts`; integration suite. |
| M2 Collection | Fixture provider (simulated, always `collection_method=fixture`) goes through the real extraction path. The mandatory paid judge is replaced by a deterministic fallback. | `fixture.test.ts`, `deterministic-judge.test.ts`; the demo ran 600 runs through `processPromptJob` and `deriveRuns`. |
| M2 Scheduling | Elmo pg-boss cadence (seeded questions are picked up by the 5-minute maintenance sweep). `or-retest` runs a prompt outside its cadence but respects the daily ceiling. | Demo step 6 retest (20 new runs). |
| **M3 Audits** | Real crawl reused from Elmo `site-audit` (AI crawler access, readability, agent readiness), plus brand identity and phone consistency, LocalBusiness schema presence, completeness and accuracy, content quality, service and area coverage, and competitor topic gaps. Scored by category, with brand completeness. | `audits.test.ts` (8); `audit-service.integration.test.ts` crawls local fictional sites and finds the planted defects. |
| M3 Keywords | DataForSEO keyword ideas (NZ) and organic rank checks from the city, behind a provider interface, plus a fixture provider. | `keywords.test.ts` (mocked HTTP; **never called live**). |
| M3 Opportunities | Priority = demand × gap × winnability × value × confidence. Each opportunity carries its run and finding evidence and is labelled a hypothesis. A human's status survives recomputation. | `opportunities.test.ts`; audit integration suite. |
| M3 Jobs | Weekly `or-audit-sweep` (Pacific/Auckland) → singleton `or-brand-audit` jobs, with retries, backoff and dead-letter queue. | Worker type-check; job code paths exercised through services. |
| **M4 Workflow** | Opportunity → research brief → fact-only draft → QA gate (no unknown phone numbers, prices, guarantees, or unanswered reviewer placeholders) → hash-bound approval (agency or client) → publish → verify live page → retest → before/after measurement labelled "association, not proof" → rollback from snapshot. | `content.test.ts` (5); `optimisation.integration.test.ts` (8 end-to-end tests against a mock WordPress). |
| M4 Unauthorised or duplicate publishing | A DB trigger refuses any publication whose content hash differs from the approval. A unique idempotency key means a retried publish creates one page. | Same suite ("refuses, in the database…", "publishes once even when retried"). |
| M4 CMS adapters | WordPress REST with Application Passwords (adapted from Canonry), Shopify Admin GraphQL. | WordPress: integration suite (mock server). Shopify: `shopify.test.ts` (mock only). |
| **M5 Dashboard** | "AI Performance" page with five tabs: AI Visibility (KPIs, by engine, brand vs competitors, question coverage, cited sources, weekly history), Audit, Opportunities, Content and Approvals (queue, editor with QA results, publish, history with measured change, rollback), Report. An evidence dialog shows the stored answer with highlighted mentions, method, model, location and run id. Simulated data carries banners. | Browser tour with Playwright (`scripts/or/ui-smoke.cjs`), 0 page errors; screenshots in `docs/demo/screenshots/`. |
| M5 Reports | Self-contained HTML client report: per method, with sample sizes and run ids, audit findings, prioritised opportunities and measured changes. | `docs/demo/christchurch-demo-report-SIMULATED.html`. |
| M5 Rebrand (partial) | Default app name "Online Reset", logo wordmark, auth side panel (Elmo testimonial and cloud upsell removed), page titles. | `route-head.test.ts`. |

## Christchurch demonstration (Step 8)

`apps/worker/scripts/or-demo.ts` sets up a **fictional** business, *Kōwhai Plumbing & Gas* (Christchurch), with three fictional competitors. All domains are reserved `.example` names and all phone numbers are invented. The demo's last recorded run produced:

- **Questions:** 30 buyer questions (validated, 13 near-duplicates merged).
- **Collection:** 600 automated runs through the real worker code path, using the fixture provider (simulated answers; Christchurch requested; `location_applied = none`, which is honest for fixtures).
- **Audit:** real crawl of the local demo sites, 37 findings, brand completeness 73%, agent readiness 63.
- **Opportunities:** prioritised and evidence-linked.
- **Optimisation workflow:**
  1. Draft for "Hot water cylinder replacement"; QA blocked it until reviewer placeholders were answered.
  2. Revision v2 approved by the client role.
  3. Published to a local mock WordPress and verified live.
  4. Retested: 20 runs.
  5. Measured change: 0% → 100% (fixture data), reported as an association.
- **Report:** `report.html`.

**Every figure in the demo is SIMULATED.** No live AI provider was called (see external services).

## Reused code and original sources

See `UPSTREAM.md` (commits and paths) and `THIRD_PARTY_NOTICES.md` (licences, plus Limelit's NOTICE in `licenses/`).

| Source | How it is used |
|---|---|
| **Elmo (MIT)** | Fork base. |
| **Limelit Open (Apache-2.0)** | Matcher, its tests and the phrase-name test data, ported to TypeScript. |
| **Canonry (MIT)** | Clustering, share of voice, the `user_location` request shape, and the WordPress client. |
| **GeoLook, SEOMachine (MIT)** | Approaches only; no code copied. |

## Main files created or modified

**Created**
- `packages/or-core/` (domain logic: measurement, geo, mentions, share of voice, clustering, questions, visibility, audits, opportunities, content).
- `packages/lib/src/db/{schema-or,tenant}.ts`.
- Migrations `0033`–`0038`.
- `packages/lib/src/or/` (tenancy scope, collection, visibility, audit, opportunity, optimisation, connections, publishing, dashboard, report, keywords, deterministic judge, demo).
- `packages/lib/src/providers/registry/fixture.ts`.
- `apps/worker/src/or-jobs.ts`, `apps/worker/scripts/or-demo.ts`.
- `apps/web/src/server/online-reset.ts`.
- `apps/web/src/routes/_authed/app/org/$org/brand/$brand/online-reset.tsx`.

**Modified Elmo files**
- `db.ts` (tenant-aware handle).
- `schema.ts` (`prompt_runs` evidence columns).
- `providers/types.ts`, `openai-api.ts`, `anthropic-api.ts`, `dataforseo.ts` (location).
- `mention-judge/analyze.ts` (deterministic fallback).
- `text-extraction.ts`.
- `auth/permissions.ts`, `auth/server.ts` (content, approval and client roles).
- `site-audit` (opt-in parsed pages).
- `process-prompt.ts` (location, evidence, `runPromptNow`).
- Worker `index.ts`.
- Web sidebar, logo, sales panel, `route-head.ts`, `vite.config.ts` (`optimizeDeps` exclude).
- Telemetry modules.

## Tests performed (latest run, all passing)

- **Unit:** 2,008.
  - or-core 72, lib 830, web 747, config 153, cli 89, deployment 64, site-audit 38, worker 15.
- **Integration (Postgres 16):** 153.
  - lib 54, worker 34, web 65.
- **Lint:** Biome over 878 files, 0 errors.
- **Type checks:** all packages, including the NodeNext worker.
- **Production build:** `vite build` succeeded.
- **Browser smoke test** (local dev server) covered:
  - signing up;
  - the dashboard and evidence dialog;
  - the audit and opportunities tabs;
  - Draft a Fix → edit → save revision → request approval → approve;
  - the report tab.

  Result: 0 page errors.

## Known bugs and limitations

- **Legacy Elmo pages are not yet tenant-isolated in the database.** Overview, Visibility, Citations and the other Elmo pages, plus the REST API and MCP server, still rely on Elmo's application-level `organization_id` checks. Only Online Reset's server functions run inside `withTenant`.
- **Elmo branding remains in places.** About 60 references remain, including email templates, the version label, docs and GitHub links in the footer, the CLI and the floating dev widget. Per-tenant branding and custom domains are not built; Elmo's white-label mode is per-instance.
- **"Publish" uses the brand's first CMS connection.** There is no UI to add or manage CMS connections, edit the brand profile, invite client users or grant them brands. These are currently set up through the service functions or the demo script.
- **The demo's mock WordPress stops when the demo exits.** Publishing from the UI afterwards fails, and the failure is recorded as `failed`, until a real or mock CMS is connected.
- **Embeddings are lexical, not semantic.** Question clustering uses a free, deterministic hash embedding stored as `real[]`; pgvector and model embeddings are not wired. As a result, paraphrases that share no words are not merged.
- **Sentiment is not judged** unless a paid judge (TypeSafe or OpenRouter) is configured.

## Missing functionality (not built yet)

- Lighthouse and SquirrelScan performance/technical audits. Elmo's site-audit covers AI-access and readability; the 319-rule SquirrelScan service and performance metrics are not integrated.
- Backlink data. Only AI-cited sources are analysed; Common Crawl and DataForSEO backlinks are not wired.
- Proposal generator with follow-ups, PR/backlink outreach, and Webflow, Wix, Squarespace, Ghost and HubSpot CMS adapters (Adaptify parity items).
- Approval notifications (email), and scheduled report delivery and PDF.
- GA4 and Google Search Console integrations.
- An end-to-end Playwright suite in CI. `scripts/or/ui-smoke.cjs` is a manual smoke script.
- Deliberate deviations from the research:
  - LangGraph.js is not used. The workflow is an explicit, tested Postgres state machine; LangGraph can be added if model-driven drafting loops need it.
  - pgvector is deferred (see above).
- Out of scope per instructions: missed calls, SMS, CRM, enquiries, bookings, pipelines, revenue attribution.

## External service requirements (blocked pending approval or credentials)

| Need | Service | Status |
|---|---|---|
| Live AI answers (model APIs) | OpenAI, Anthropic, Gemini, Perplexity API keys | **Not activated.** No paid calls were made. Adapters for OpenAI and Anthropic (with NZ location) are tested at the request level only. |
| Consumer AI surfaces, AI Overviews/Mode, Copilot | DataForSEO or another vendor (decision D3) | Not activated. |
| Keyword volume and rank tracking | DataForSEO | Adapter built; not called live. |
| CMS publishing | Client WordPress Application Password or Shopify Admin token | Mock-tested only. |
| Repository hosting | GitHub `ai-solutions-nz/online-reset-platform` | Not created (no permission from this session). |

The smallest valid live test, once approved, is 120 grounded API calls (10 questions × 4 engines × Christchurch × 3 repeats). Set the keys in `.env` and add `chatgpt:openai-api:online`-style targets to `SCRAPE_TARGETS`.

## Next implementation task

Put Elmo's legacy brand pages and API routes inside `withTenant`, so that tenant isolation is database-enforced on every route. Then extend the isolation test to cover every route and MCP tool.

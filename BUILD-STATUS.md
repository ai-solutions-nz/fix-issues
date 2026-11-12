# Online Reset: Build Status

_Last updated: 2026-11-12. Current milestone: **5 (reporting and platform QA)**. A first pass of every milestone is implemented, but some items remain open; see "Missing functionality"._

## How to verify everything below

```bash
pnpm install
pnpm test                                    # 2,009 unit tests (8 packages)
# Integration tests run as a non-superuser login (see "Database login for tenant isolation")
TEST_DATABASE_URL=postgres://or_app:or_app@localhost:5432/elmo_test \
  pnpm -C packages/lib test:integration      # 79 Postgres tests
# same for apps/worker (34) and apps/web (174)
pnpm lint                                    # Biome, 886 files, 0 errors
DATABASE_URL=postgres://… pnpm -C apps/worker or:demo -- --org default   # Christchurch demo
```

## Repository

- **Location:** branch `online-reset-platform` of `ai-solutions-nz/fix-issues` (https://github.com/ai-solutions-nz/fix-issues/tree/online-reset-platform). All Online Reset work is committed and pushed there. `main` and the research branch `ccr-0af30c39-oq25zx` are separate and untouched.
- **History:** the branch keeps Elmo's history. Locally, `upstream` points at `elmohq/elmo`, and the fork base is `db2d52b`.
- **Not done:** a dedicated `ai-solutions-nz/online-reset-platform` repository was not created, because this session cannot create repositories. Moving the branch there later is a plain push.

## Completed features (each has implementation and test evidence)

| Area | What works | Evidence |
|---|---|---|
| **M1 Foundation** | Elmo fork; PostHog telemetry removed (worker, CLI, web fallback key); upstream-only workflows removed (including the scheduled live-provider job that spent API credit); research imported into `docs/research/`. | Baseline: 1,974 unit + 63 integration Elmo tests passed before any change. |
| M1 Tenant isolation | `or_tenant` role, row-level-security (RLS) policy per table derived from its tenancy column (deny by default), `withTenant()`, the shared `db` handle follows the tenant transaction, `client` role limited to granted brands. | `packages/lib/src/db/tenant.integration.test.ts` (9 tests): cross-tenant reads return nothing, writes are rejected, untenanted tables are denied, every keyed table has a policy. `or/tenant-scope.integration.test.ts` (3). |
| M1 Database isolation on every route | Every legacy Elmo entry point runs inside a tenant transaction, so Postgres RLS bounds it even if an application check were missed. **Server functions** (all pages, including Overview, Visibility, Citations, Share of Voice, Sentiment, Responses, Query Fan-Out, Opportunities and Settings): a global TanStack function middleware (`middleware/tenant.ts`, registered after auth in `start.ts`) scopes each signed-in user to their organizations, or to granted brands for the `client` role. **REST `/api/v1`**: `createApiHandler` runs every handler under the API key's reach. **MCP**: every tool runs through `runToolInTenant`. RLS now accepts several organizations, and covers `user`, `apikey`, `subscription` and `cited_pages` (migration `0039`). better-auth uses the unscoped connection for sessions and accounts. | `apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts` (147 tests). The caller's application-level checks are opened up (instance-admin principal) while the database is pinned to tenant A. Every REST route and verb (25 route files) and every MCP tool (17) is then pointed at tenant B's ids: no tenant B data appears in any response, tenant B's rows are unchanged after every write, and every write into tenant B is refused. Positive controls show tenant A's own data is still served. **Negative control:** the same suite at system scope fails 19 tests (leaks and successful writes into tenant B), which shows the database is what blocks them. Also covered: global middleware registration, and scope resolution for members, clients, non-members and instance admins. |
| M1 Isolation fixes (Packet 1b, from Neo's review of `9e8ce82`) | (1) A `client` user over MCP (OAuth) now gets the same scope as on the web pages: one builder, `userTenantScope` in `packages/lib/src/or/tenant-scope.ts`, feeds both, so the principal carries the brand restriction. (2) The tenant handle closes when its transaction ends: a query that outlives the request throws `TenantTransactionClosedError` instead of running on a pooled connection that may be serving another tenant. (3) Fixed under the tenant scope: organization rename, the MCP consent page, accepting an invitation, and brand creation (brand ids are now random, so they cannot collide with, or reveal, another tenant's brand). Also fixed, found while doing this: creating an organization, and syncing memberships from Auth0. (4) Organization and brand ids must be letters, digits, `-` or `_` (API schemas and `withTenant`). (6) Signed-out server functions run in an empty scope; four named functions are allowlisted for system scope (`middleware/tenant.ts`). (9) Migration `0040`: `apikey`, `subscription` and `member` are read-only to every tenant; API keys and the subscription are hidden from `client` users and brand-scoped keys; only an owner or admin may rename an organization, and only its name and slug. Plans are still worked out for client users (entitlements read the subscription on the system handle). | `packages/lib/src/db/tenant-roles.integration.test.ts` (20 tests), including a stray tenant A query fired inside tenant B's transaction. With the closed-handle guard removed, two of these fail and the stray query reads tenant B's brand. `apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts` (13 tests): signs in over MCP as a real `client` user (only the OAuth signature check is stubbed) and as owner, member and newcomer through the real middleware function. (10) The isolation suite is now strict (90 tests): exact counts (25 route files, 17 tools, 38 endpoints; method guards excluded, and a 405 always fails); every endpoint has a declared expected outcome; only an isolation refusal passes (404 not found, a "not found" 400, or a 500 whose cause is Postgres SQLSTATE 42501); there is a positive tenant A check for every route group and 12 tools. Negative control at system scope: 40 failures (was 19). |
| M1 Isolation fixes (Packet 1c, Neo's re-gate of `8ccc8b4`) | (1) The connection guard now sits on the transaction's pooled connection itself, not only on the shared `db` handle. The `tx` passed to a `withTenant` callback, a query built inside the scope and run later (plain, relational or prepared), and the shared handle all throw `TenantTransactionClosedError` once drizzle releases the connection after COMMIT or ROLLBACK. Code that uses `tx` directly (e.g. `server/online-reset.ts`) is covered. (3) Startup check (`packages/lib/src/db/role-check.ts`, called from `apps/web/src/server.ts`): the server exits with a clear error unless its database login can `SET ROLE or_tenant`, is not a superuser and has no BYPASSRLS, and `or_tenant` cannot bypass RLS. CI now runs the integration suites as such a login. (4) Billing: the billing settings data (plan, status, Stripe subscription id, renewal date, seats) is refused to `client` users. The REST billing route and the MCP `get_billing` tool refuse brand-limited keys and client users with 403. (5) The signed-out allowlist is empty; signed-out server functions always run in the empty scope. | `tenant-roles.integration.test.ts` (23 tests, 3 new). Each of Neo's two paths is reproduced inside organization B's open transaction (callback `tx` after commit; queries built in scope and run later, including a prepared statement). With the connection guard disabled, all three new tests fail and read rows. `role-check.integration.test.ts` (2). `signed-in-tenant.integration.test.ts` (19 tests; 6 billing). |
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
- Migrations `0033`–`0039`.
- `packages/lib/src/or/` (tenancy scope, collection, visibility, audit, opportunity, optimisation, connections, publishing, dashboard, report, keywords, deterministic judge, demo).
- `packages/lib/src/providers/registry/fixture.ts`.
- `apps/worker/src/or-jobs.ts`, `apps/worker/scripts/or-demo.ts`.
- `apps/web/src/server/online-reset.ts`.
- `apps/web/src/middleware/tenant.ts`, `apps/web/src/lib/auth/tenant-scope.ts`, `apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts`.
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
- `start.ts` (tenant middleware), `lib/api/handler.ts` and `lib/mcp/server.ts` (tenant scope), `packages/lib/src/auth/server.ts` (better-auth on the unscoped connection).
- Telemetry modules.
- Packet 1b: `packages/lib/src/db/{db,tenant,unique-names,provisioning,auth-sync}.ts`, migration `0040_or_tenant_narrow_roles.sql`, `or/tenant-scope.ts` (`userTenantScope`), `entitlements/service.ts`, `secrets/store.ts`; web `middleware/tenant.ts`, `lib/auth/{api-auth,tenant-scope}.ts`, `lib/mcp/auth.ts`, `server/signed-in-core.ts` (new) and the server functions that call it (`organizations.ts`, `mcp-clients.ts`, `team.ts`, `brands.ts`), `server/onboarding-core.ts`.

## Tests performed (latest run, all passing)

- **Unit:** 2,009.
  - or-core 72, lib 830, web 748, config 153, cli 89, deployment 64, site-audit 38, worker 15.
- **Integration (Postgres 16):** 287, run as the non-superuser `or_app` login (member of `or_tenant` only, owner of the test database).
  - lib 79, worker 34, web 174. Web includes the strict 90-test isolation suite and 19 signed-in tests.
- **Lint:** Biome over 886 files, 0 errors.
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

- **Where database tenant scope does not apply.** Requests with no session always run in an empty scope (no tenant rows); the signed-out allowlist is empty. Instance administrators (a user with the `admin` role, or an instance admin API key) and of the background worker, which is system work. Server functions are covered by the global middleware; the isolation suite verifies that registration and the scope it applies, but it calls the REST routes and MCP tools individually, not each of the ~118 server functions. Those functions use the same core query modules the REST routes and MCP tools exercise.
- **Elmo branding remains in places.** About 60 references remain, including email templates, the version label, docs and GitHub links in the footer, the CLI and the floating dev widget. Per-tenant branding and custom domains are not built; Elmo's white-label mode is per-instance.
- **"Publish" uses the brand's first CMS connection.** There is no UI to add or manage CMS connections, edit the brand profile, invite client users or grant them brands. These are currently set up through the service functions or the demo script.
- **The demo's mock WordPress stops when the demo exits.** Publishing from the UI afterwards fails, and the failure is recorded as `failed`, until a real or mock CMS is connected.
- **Embeddings are lexical, not semantic.** Question clustering uses a free, deterministic hash embedding stored as `real[]`; pgvector and model embeddings are not wired. As a result, paraphrases that share no words are not merged.
- **Sentiment is not judged** unless a paid judge (TypeSafe or OpenRouter) is configured.

## Known limitations (recorded from Neo's reviews of `9e8ce82` and `8ccc8b4`)

- **(5) Raw SQL can bypass row-level security. LAUNCH BLOCKER: the raw SQL audit must be done before launch.** The tenant scope is held in ordinary session settings (`or.org_ids`, `or.brand_ids`, `or.restricted_org_ids`, `or.admin_org_ids`, `or.user_id`), and `or_tenant` may change them itself. Any SQL that runs inside a tenant transaction can therefore widen its own scope: raw SQL in our code, a query built from unsafe input, or an injection. Neo demonstrated both:
  - a `client` user clearing its own brand restriction with `set_config` to read API keys;
  - a plain member forging `or.admin_org_ids` to rename the organization.

  Until the audit is done and the settings are made tamper-proof, RLS only protects queries that our code builds safely; it is not a backstop against hostile SQL. Ways to make the settings tamper-proof: sign them with an HMAC that a `SECURITY DEFINER` function verifies, or have the policies read a scope table that `or_tenant` cannot write.
- **(7) Nested scope is coarse.** A nested `withTenant` whose scope lies within the open one reuses the outer transaction, so it does not narrow it: inner code still sees everything the outer scope sees. A nested call with a wider or different scope is refused. Narrowing would need `SET LOCAL` save and restore around the inner call.
- **(8) Pool and transaction risks.**
  - Every scoped request holds one pooled connection for its whole duration, including signed-out requests, which now open an empty-scope transaction. Long requests (streaming, slow outbound calls inside a server function) can therefore exhaust the pool.
  - A stray query after the transaction ends now throws, through any path (the shared handle, the callback's `tx`, or a query built earlier). Work deliberately detached from a request must use `serviceDb` or open its own `withTenant`.
  - Code that reads `serviceDb` while a tenant transaction is open uses a second connection, so it cannot see that transaction's uncommitted writes.
  - Not tested against PgBouncer in transaction mode (`SET LOCAL` and `set_config(..., true)` are transaction-scoped, which should be compatible, but this is unverified).
- **(11) `cited_pages` policy performance.** `or_page_visible()` runs two `EXISTS` subqueries per row (rollups and citations, each calling `or_brand_visible`). This is correct, but it is not benchmarked and could be slow on large citation tables. An index review or a materialized brand-to-page map may be needed.
- **(12) The app's database login must be a member of `or_tenant`.** This is now checked at startup and in CI (see "Database login for tenant isolation"). Deployment scripts still do not create the login or grant the membership; that is a manual step.
- **Reports for non-admin report-generator users.** The `reports` table has no tenant column. Under tenant scope it is denied: the `/api/v1/reports` routes are instance-admin-only (system scope), but the web reports pages for a non-admin user with report-generator access now fail with permission denied. Not fixed: it needs a decision on whether reports become tenant-owned.
- **Billing for restricted users.** Fixed in Packet 1c (see above). The paywall check (`getPaywallStateFn`) still tells a client user whether their organization needs a plan, but returns no subscription details.

## Database login for tenant isolation

The web server refuses to start unless its `DATABASE_URL` login meets all of these:
- it is a member of `or_tenant`, with the right to `SET ROLE` to it;
- it is `NOSUPERUSER` and `NOBYPASSRLS`;
- `or_tenant` itself cannot bypass RLS.

The login should own the database (it runs the migrations). The system handle relies on that: table owners are exempt from RLS without `FORCE`. One-time setup, as an administrator:

```sql
CREATE ROLE or_app LOGIN PASSWORD '…' NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB;
CREATE ROLE or_tenant NOLOGIN NOBYPASSRLS;   -- or let the first migration create it
GRANT or_tenant TO or_app;
ALTER DATABASE <db> OWNER TO or_app;
```

- **CI setting:** `.github/workflows/build.yaml` runs these statements in the step "Create the non-superuser app login" (with the test-only password `or_app`). It then runs every integration suite with `TEST_DATABASE_URL=postgres://or_app:or_app@localhost:5432/elmo_test`. Run locally the same way.
- **Local development against a superuser database:** set `OR_DB_ROLE_CHECK=warn` to log the failure instead of exiting. This is ignored when `NODE_ENV=production`.
- **Migration 0034:** now grants `or_tenant` to the migrating login only when it is not already a member. A login that holds the membership without ADMIN OPTION can therefore run the migrations. Databases that already applied 0034 are unaffected.

## Launch checklist

Must be complete before any real client data or public launch:

- [ ] **Raw SQL audit (launch blocker; see limitation 5).**
  - Review every `sql`/`execute` call and every `SECURITY DEFINER` function.
  - Make the tenant settings tamper-proof so that SQL inside a tenant transaction cannot widen its own scope.
  - Add tests for Neo's two demonstrations: a client clearing its brand restriction, and a member forging admin.
- [ ] **Existing brand and organization ids conform to the new id format** (`^[A-Za-z0-9_-]{1,128}$`). Run `SELECT id FROM brands WHERE id !~ '^[A-Za-z0-9_-]{1,128}$'` (and the same for `organization`) against production before deploying. Any row returned must be migrated first, or its tenant requests will fail.
- [ ] **Load test.** Every signed-out request now opens an (empty-scope) transaction, and every scoped request holds a pooled connection for its whole duration. Size the pool, and check signed-out traffic (landing, sign-in, static server functions) does not exhaust it.
- [ ] **`cited_pages` policy performance** (limitation 11). Benchmark `or_page_visible()` on production-sized citation tables, and add indexes or a materialized brand-to-page map if needed.
- [ ] **Reports become tenant-owned before report pages open to non-admins.**
  - Add `organization_id` to `reports`, as a foreign key to `organization` with `ON DELETE CASCADE`, plus `created_by`.
  - Index `organization_id`.
  - Re-apply the tenant policies (`SELECT or_apply_tenant_policies()`).
  - Backfill old reports as admin-only (no organization) unless the owner is known.
  - Then require an owner on every new row.
  - Give public report links their own lookup (by an unguessable token, on the system handle) rather than relying on tenant scope.
- [ ] **Production database login** set up as in "Database login for tenant isolation", and the startup check passing.

<details>
<summary><code>rg -n "serviceDb" apps packages</code> (as of Packet 1b; 202 lines, sorted by path, 2026-11-12, after Packet 1b)</summary>

All non-test production uses are system work: better-auth, provisioning, Auth0 membership sync, the secrets store, entitlement plans, the scope builders, the global slug check, the consent page's OAuth client lookup, the post-invitation slug read, the worker, and the demo script.

```
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:8:import { db, serviceDb } from "@workspace/lib/db/db";
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:53:	await serviceDb.delete(oauthClient).where(eq(oauthClient.clientId, OAUTH_CLIENT));
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:54:	await serviceDb.delete(orMemberBrandAccess).where(inArray(orMemberBrandAccess.organizationId, orgs));
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:55:	await serviceDb.delete(brands).where(inArray(brands.organizationId, orgs));
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:56:	await serviceDb.delete(member).where(inArray(member.userId, ALL_USERS));
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:57:	await serviceDb.delete(organization).where(inArray(organization.id, orgs));
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:58:	await serviceDb.delete(user).where(inArray(user.id, ALL_USERS));
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:64:	await serviceDb.insert(organization).values([
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:68:	await serviceDb
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:71:	await serviceDb.insert(member).values([
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:76:	await serviceDb.insert(brands).values([
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:81:	await serviceDb.insert(orMemberBrandAccess).values({ organizationId: ORG_A, userId: CLIENT, brandId: BRAND_GRANTED });
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:82:	await serviceDb.insert(oauthClient).values({
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:158:		const [row] = await serviceDb.select().from(organization).where(eq(organization.id, ORG_A));
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:188:			await serviceDb.insert(member).values({
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:211:		const [row] = await serviceDb.select().from(brands).where(eq(brands.id, created.brandId));
apps/web/src/lib/__tests__/signed-in-tenant.integration.test.ts:220:		const [membership] = await serviceDb
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:17:import { serviceDb } from "@workspace/lib/db/db";
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:127:	const rows = await serviceDb.execute(sql`
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:139:	await serviceDb.delete(citations).where(inArray(citations.brandId, brandIds));
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:140:	await serviceDb.execute(sql`DELETE FROM prompt_runs WHERE brand_id IN (${BRAND_A}, ${BRAND_B})`);
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:141:	await serviceDb.delete(prompts).where(inArray(prompts.brandId, brandIds));
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:142:	await serviceDb.delete(competitors).where(inArray(competitors.brandId, brandIds));
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:143:	await serviceDb.delete(orMemberBrandAccess).where(inArray(orMemberBrandAccess.organizationId, [ORG_A, ORG_B]));
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:144:	await serviceDb.delete(brands).where(inArray(brands.id, brandIds));
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:145:	await serviceDb.delete(member).where(inArray(member.organizationId, [ORG_A, ORG_B]));
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:146:	await serviceDb.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:147:	await serviceDb.delete(user).where(inArray(user.id, [USER_A, USER_CLIENT]));
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:153:	await serviceDb.insert(organization).values([
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:157:	await serviceDb.insert(user).values([
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:161:	await serviceDb.insert(member).values([
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:165:	await serviceDb.insert(brands).values([
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:181:	await serviceDb.insert(orMemberBrandAccess).values({ organizationId: ORG_A, userId: USER_CLIENT, brandId: BRAND_A });
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:182:	const [ca] = await serviceDb
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:186:	const [cb] = await serviceDb
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:192:	await serviceDb.insert(prompts).values([
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:202:	await insertRuns(serviceDb, [
apps/web/src/lib/__tests__/tenant-isolation.integration.test.ts:230:	await serviceDb.insert(citations).values({
apps/web/src/lib/mcp/__tests__/auth.test.ts:36:		serviceDb: {
apps/web/src/lib/mcp/__tests__/tenancy.test.ts:45:	return { db: chain, serviceDb: chain };
apps/web/src/lib/mcp/auth.ts:4:import { serviceDb } from "@workspace/lib/db/db";
apps/web/src/lib/mcp/auth.ts:70:		serviceDb
apps/web/src/lib/mcp/auth.ts:75:		serviceDb
apps/web/src/server/signed-in-core.ts:6:import { db, serviceDb } from "@workspace/lib/db/db";
apps/web/src/server/signed-in-core.ts:45:	const [client] = await serviceDb
apps/web/src/server/signed-in-core.ts:65:	const [row] = await serviceDb
apps/worker/scripts/or-demo.ts:20:import { serviceDb } from "@workspace/lib/db/db";
apps/worker/scripts/or-demo.ts:60:	await serviceDb
apps/worker/scripts/or-demo.ts:64:	await serviceDb
apps/worker/scripts/or-demo.ts:75:	await serviceDb
apps/worker/scripts/or-demo.ts:79:	await serviceDb
apps/worker/scripts/or-demo.ts:93:	const existingRivals = await serviceDb.select().from(competitors).where(eq(competitors.brandId, BRAND_ID));
apps/worker/scripts/or-demo.ts:95:		await serviceDb.insert(competitors).values(
apps/worker/scripts/or-demo.ts:104:			await serviceDb
apps/worker/scripts/or-demo.ts:116:	const questionRows = await serviceDb.select().from(prompts).where(eq(prompts.brandId, BRAND_ID));
apps/worker/scripts/or-demo.ts:128:	const runs = await serviceDb.select({ id: promptRuns.id }).from(promptRuns).where(eq(promptRuns.brandId, BRAND_ID));
apps/worker/scripts/or-demo.ts:130:		await deriveRuns({ brandId: BRAND_ID, runIds: runs.slice(i, i + 50).map((r) => r.id) }, serviceDb, noopBoss);
apps/worker/scripts/or-demo.ts:190:	const retestPrompts = await serviceDb
apps/worker/scripts/or-demo.ts:206:		(await serviceDb.select({ id: promptRuns.id }).from(promptRuns).where(eq(promptRuns.brandId, BRAND_ID))).map(
apps/worker/scripts/or-demo.ts:212:		await serviceDb.select({ id: promptRuns.id }).from(promptRuns).where(eq(promptRuns.brandId, BRAND_ID))
apps/worker/scripts/or-demo.ts:214:	if (newRuns.length) await deriveRuns({ brandId: BRAND_ID, runIds: newRuns.map((r) => r.id) }, serviceDb, noopBoss);
apps/worker/scripts/or-demo.ts:254:		await serviceDb.$client.end();
apps/worker/src/or-jobs.ts:1:import { serviceDb } from "@workspace/lib/db/db";
apps/worker/src/or-jobs.ts:28:	const rows = await serviceDb
apps/worker/src/or-jobs.ts:44:		await runBrandAudit(serviceDb, job.data.brandId);
apps/worker/src/or-jobs.ts:45:		await refreshOpportunities(serviceDb, job.data.brandId);
packages/lib/src/auth/server.ts:20:import { serviceDb } from "../db/db";
packages/lib/src/auth/server.ts:112:		database: drizzleAdapter(serviceDb, {
packages/lib/src/db/auth-sync.ts:4:import { serviceDb } from "./db";
packages/lib/src/db/auth-sync.ts:8:const db = serviceDb;
packages/lib/src/db/db.ts:47:export const serviceDb: Db = baseDb;
packages/lib/src/db/provisioning.ts:3:import { serviceDb } from "./db";
packages/lib/src/db/provisioning.ts:7:const db = serviceDb;
packages/lib/src/db/tenant-roles.integration.test.ts:8:import { db, serviceDb, TenantTransactionClosedError } from "./db";
packages/lib/src/db/tenant-roles.integration.test.ts:19:	await serviceDb.delete(apikey).where(inArray(apikey.referenceId, [ORG_A, ORG_B]));
packages/lib/src/db/tenant-roles.integration.test.ts:20:	await serviceDb.delete(subscription).where(inArray(subscription.referenceId, [ORG_A, ORG_B]));
packages/lib/src/db/tenant-roles.integration.test.ts:21:	await serviceDb.delete(member).where(inArray(member.organizationId, [ORG_A, ORG_B]));
packages/lib/src/db/tenant-roles.integration.test.ts:22:	await serviceDb.delete(brands).where(inArray(brands.id, [BRAND_A, BRAND_B]));
packages/lib/src/db/tenant-roles.integration.test.ts:23:	await serviceDb.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
packages/lib/src/db/tenant-roles.integration.test.ts:24:	await serviceDb.delete(user).where(eq(user.id, USER));
packages/lib/src/db/tenant-roles.integration.test.ts:29:	await serviceDb.insert(organization).values([
packages/lib/src/db/tenant-roles.integration.test.ts:33:	await serviceDb.insert(user).values({ id: USER, name: "Roles User", email: "roles@tenant-a.example" });
packages/lib/src/db/tenant-roles.integration.test.ts:34:	await serviceDb
packages/lib/src/db/tenant-roles.integration.test.ts:37:	await serviceDb.insert(brands).values([
packages/lib/src/db/tenant-roles.integration.test.ts:42:	await serviceDb
packages/lib/src/db/tenant-roles.integration.test.ts:45:	await serviceDb
packages/lib/src/db/tenant-roles.integration.test.ts:193:		const [row] = await serviceDb
packages/lib/src/db/tenant-roles.integration.test.ts:201:		const missing = await serviceDb.execute(sql`
packages/lib/src/db/tenant.integration.test.ts:3:import { db, serviceDb } from "./db";
packages/lib/src/db/tenant.integration.test.ts:23:	await serviceDb.execute(sql`ALTER TABLE or_audit_log DISABLE TRIGGER or_audit_log_append_only`);
packages/lib/src/db/tenant.integration.test.ts:24:	await serviceDb.delete(orAuditLog).where(inArray(orAuditLog.organizationId, [ORG_A, ORG_B]));
packages/lib/src/db/tenant.integration.test.ts:25:	await serviceDb.execute(sql`ALTER TABLE or_audit_log ENABLE TRIGGER or_audit_log_append_only`);
packages/lib/src/db/tenant.integration.test.ts:26:	await serviceDb.delete(citations).where(inArray(citations.brandId, brandIds));
packages/lib/src/db/tenant.integration.test.ts:27:	await serviceDb.execute(
packages/lib/src/db/tenant.integration.test.ts:33:	await serviceDb.delete(orBrandProfiles).where(inArray(orBrandProfiles.brandId, brandIds));
packages/lib/src/db/tenant.integration.test.ts:34:	await serviceDb.delete(prompts).where(inArray(prompts.brandId, brandIds));
packages/lib/src/db/tenant.integration.test.ts:35:	await serviceDb.delete(brands).where(inArray(brands.id, brandIds));
packages/lib/src/db/tenant.integration.test.ts:36:	await serviceDb.delete(organization).where(inArray(organization.id, [ORG_A, ORG_B]));
packages/lib/src/db/tenant.integration.test.ts:41:	await serviceDb.insert(organization).values([
packages/lib/src/db/tenant.integration.test.ts:45:	await serviceDb.insert(brands).values([
packages/lib/src/db/tenant.integration.test.ts:50:	await serviceDb.insert(prompts).values([
packages/lib/src/db/tenant.integration.test.ts:55:	await insertRuns(serviceDb, [
packages/lib/src/db/tenant.integration.test.ts:130:		const [b] = await serviceDb.select({ name: brands.name }).from(brands).where(eq(brands.id, BRAND_B));
packages/lib/src/db/tenant.integration.test.ts:153:		const rows = await serviceDb.transaction(async (tx) => {
packages/lib/src/db/tenant.integration.test.ts:167:		const result = await serviceDb.execute<{ table_name: string }>(sql`
packages/lib/src/db/tenant.integration.test.ts:192:			serviceDb.update(orAuditLog).set({ action: "rewritten" }).where(eq(orAuditLog.organizationId, ORG_A)),
packages/lib/src/db/tenant.ts:2:import { serviceDb, TenantTransactionClosedError, tenantContext } from "./db";
packages/lib/src/db/tenant.ts:22:type Tx = Parameters<Parameters<typeof serviceDb.transaction>[0]>[0];
packages/lib/src/db/tenant.ts:68:	return serviceDb.transaction(async (tx) => {
packages/lib/src/db/unique-names.ts:9:import { db, serviceDb } from "./db";
packages/lib/src/db/unique-names.ts:51:	const rows = await serviceDb
packages/lib/src/entitlements/service.ts:12:import { db, serviceDb } from "../db/db";
packages/lib/src/entitlements/service.ts:114:		(options?.conn ?? serviceDb).select().from(subscription).where(inArray(subscription.referenceId, orgIds)),
packages/lib/src/or/audit-service.integration.test.ts:4:import { serviceDb } from "../db/db";
packages/lib/src/or/audit-service.integration.test.ts:18:	await serviceDb.execute(sql`ALTER TABLE or_audit_log DISABLE TRIGGER or_audit_log_append_only`);
packages/lib/src/or/audit-service.integration.test.ts:19:	await serviceDb.delete(orAuditLog).where(eq(orAuditLog.organizationId, ORG));
packages/lib/src/or/audit-service.integration.test.ts:20:	await serviceDb.execute(sql`ALTER TABLE or_audit_log ENABLE TRIGGER or_audit_log_append_only`);
packages/lib/src/or/audit-service.integration.test.ts:21:	await serviceDb.delete(orOpportunities).where(eq(orOpportunities.brandId, BRAND));
packages/lib/src/or/audit-service.integration.test.ts:22:	await serviceDb.delete(orAuditRuns).where(eq(orAuditRuns.brandId, BRAND));
packages/lib/src/or/audit-service.integration.test.ts:23:	await serviceDb.delete(citations).where(eq(citations.brandId, BRAND));
packages/lib/src/or/audit-service.integration.test.ts:24:	await serviceDb.execute(sql`DELETE FROM prompt_runs WHERE brand_id = ${BRAND}`);
packages/lib/src/or/audit-service.integration.test.ts:25:	await serviceDb.delete(orPromptMeta).where(eq(orPromptMeta.brandId, BRAND));
packages/lib/src/or/audit-service.integration.test.ts:26:	await serviceDb.delete(prompts).where(eq(prompts.brandId, BRAND));
packages/lib/src/or/audit-service.integration.test.ts:27:	await serviceDb.delete(competitors).where(eq(competitors.brandId, BRAND));
packages/lib/src/or/audit-service.integration.test.ts:28:	await serviceDb.delete(orBrandProfiles).where(eq(orBrandProfiles.brandId, BRAND));
packages/lib/src/or/audit-service.integration.test.ts:29:	await serviceDb.delete(brands).where(eq(brands.id, BRAND));
packages/lib/src/or/audit-service.integration.test.ts:30:	await serviceDb.delete(organization).where(eq(organization.id, ORG));
packages/lib/src/or/audit-service.integration.test.ts:42:	await serviceDb
packages/lib/src/or/audit-service.integration.test.ts:45:	await serviceDb.insert(brands).values({
packages/lib/src/or/audit-service.integration.test.ts:52:	await serviceDb.insert(orBrandProfiles).values({
packages/lib/src/or/audit-service.integration.test.ts:62:	await serviceDb
packages/lib/src/or/audit-service.integration.test.ts:92:		const log = await serviceDb
packages/lib/src/or/audit-service.integration.test.ts:100:		const [p] = await serviceDb
packages/lib/src/or/audit-service.integration.test.ts:104:		await serviceDb
packages/lib/src/or/audit-service.integration.test.ts:107:		const saved = await insertRuns(serviceDb, [
packages/lib/src/or/audit-service.integration.test.ts:120:		await serviceDb.insert(citations).values({
packages/lib/src/or/audit-service.integration.test.ts:139:		await serviceDb
packages/lib/src/or/audit-service.integration.test.ts:144:		const [row] = await serviceDb
packages/lib/src/or/optimisation.integration.test.ts:4:import { serviceDb } from "../db/db";
packages/lib/src/or/optimisation.integration.test.ts:44:	await serviceDb.execute(sql`ALTER TABLE or_audit_log DISABLE TRIGGER or_audit_log_append_only`);
packages/lib/src/or/optimisation.integration.test.ts:45:	await serviceDb.delete(orAuditLog).where(eq(orAuditLog.organizationId, ORG));
packages/lib/src/or/optimisation.integration.test.ts:46:	await serviceDb.execute(sql`ALTER TABLE or_audit_log ENABLE TRIGGER or_audit_log_append_only`);
packages/lib/src/or/optimisation.integration.test.ts:47:	await serviceDb.delete(orPublications).where(eq(orPublications.brandId, BRAND));
packages/lib/src/or/optimisation.integration.test.ts:48:	await serviceDb.delete(orApprovals).where(eq(orApprovals.brandId, BRAND));
packages/lib/src/or/optimisation.integration.test.ts:49:	await serviceDb.delete(orContentItems).where(eq(orContentItems.brandId, BRAND));
packages/lib/src/or/optimisation.integration.test.ts:50:	await serviceDb.delete(orCmsConnections).where(eq(orCmsConnections.brandId, BRAND));
packages/lib/src/or/optimisation.integration.test.ts:51:	await serviceDb.delete(orOpportunities).where(eq(orOpportunities.brandId, BRAND));
packages/lib/src/or/optimisation.integration.test.ts:52:	await serviceDb.execute(sql`DELETE FROM prompt_runs WHERE brand_id = ${BRAND}`);
packages/lib/src/or/optimisation.integration.test.ts:53:	await serviceDb.delete(prompts).where(eq(prompts.brandId, BRAND));
packages/lib/src/or/optimisation.integration.test.ts:54:	await serviceDb.delete(orBrandProfiles).where(eq(orBrandProfiles.brandId, BRAND));
packages/lib/src/or/optimisation.integration.test.ts:55:	await serviceDb.delete(brands).where(eq(brands.id, BRAND));
packages/lib/src/or/optimisation.integration.test.ts:56:	await serviceDb.delete(organization).where(eq(organization.id, ORG));
packages/lib/src/or/optimisation.integration.test.ts:63:	await serviceDb
packages/lib/src/or/optimisation.integration.test.ts:66:	await serviceDb.insert(brands).values({
packages/lib/src/or/optimisation.integration.test.ts:72:	await serviceDb.insert(orBrandProfiles).values({
packages/lib/src/or/optimisation.integration.test.ts:80:	const [p] = await serviceDb
packages/lib/src/or/optimisation.integration.test.ts:85:	await insertRuns(serviceDb, [
packages/lib/src/or/optimisation.integration.test.ts:99:	await serviceDb.insert(orOpportunities).values({
packages/lib/src/or/optimisation.integration.test.ts:137:		const [row] = await serviceDb.select().from(orCmsConnections).where(eq(orCmsConnections.id, connectionId));
packages/lib/src/or/optimisation.integration.test.ts:157:		const [item] = await serviceDb.select().from(orContentItems).where(eq(orContentItems.id, itemId));
packages/lib/src/or/optimisation.integration.test.ts:174:		const [approval] = await serviceDb
packages/lib/src/or/optimisation.integration.test.ts:178:		const forged = serviceDb.insert(orPublications).values({
packages/lib/src/or/optimisation.integration.test.ts:211:		await insertRuns(serviceDb, [
packages/lib/src/or/optimisation.integration.test.ts:239:			await serviceDb.select({ action: orAuditLog.action }).from(orAuditLog).where(eq(orAuditLog.organizationId, ORG))
packages/lib/src/or/tenant-scope.integration.test.ts:3:import { serviceDb } from "../db/db";
packages/lib/src/or/tenant-scope.integration.test.ts:18:	await serviceDb.delete(orMemberBrandAccess).where(inArray(orMemberBrandAccess.organizationId, [ORG, OTHER_ORG]));
packages/lib/src/or/tenant-scope.integration.test.ts:19:	await serviceDb.delete(prompts).where(inArray(prompts.brandId, [BRAND_MINE, BRAND_SIBLING, BRAND_FOREIGN]));
packages/lib/src/or/tenant-scope.integration.test.ts:20:	await serviceDb.delete(brands).where(inArray(brands.id, [BRAND_MINE, BRAND_SIBLING, BRAND_FOREIGN]));
packages/lib/src/or/tenant-scope.integration.test.ts:21:	await serviceDb.delete(member).where(inArray(member.organizationId, [ORG, OTHER_ORG]));
packages/lib/src/or/tenant-scope.integration.test.ts:22:	await serviceDb.delete(organization).where(inArray(organization.id, [ORG, OTHER_ORG]));
packages/lib/src/or/tenant-scope.integration.test.ts:23:	await serviceDb.delete(user).where(inArray(user.id, [STAFF, CLIENT]));
packages/lib/src/or/tenant-scope.integration.test.ts:28:	await serviceDb.insert(user).values([
packages/lib/src/or/tenant-scope.integration.test.ts:32:	await serviceDb.insert(organization).values([
packages/lib/src/or/tenant-scope.integration.test.ts:36:	await serviceDb.insert(member).values([
packages/lib/src/or/tenant-scope.integration.test.ts:40:	await serviceDb.insert(brands).values([
packages/lib/src/or/tenant-scope.integration.test.ts:45:	await serviceDb.insert(prompts).values([
packages/lib/src/or/tenant-scope.integration.test.ts:49:	await serviceDb.insert(orMemberBrandAccess).values({ organizationId: ORG, userId: CLIENT, brandId: BRAND_MINE });
packages/lib/src/or/tenant-scope.ts:2:import { serviceDb } from "../db/db";
packages/lib/src/or/tenant-scope.ts:17:	const [row] = await serviceDb
packages/lib/src/or/tenant-scope.ts:25:	const grants = await serviceDb
packages/lib/src/or/tenant-scope.ts:43:	const memberships = await serviceDb
packages/lib/src/or/tenant-scope.ts:56:		? await serviceDb.select({ id: brands.id }).from(brands).where(inArray(brands.organizationId, agencyOrgs))
packages/lib/src/or/tenant-scope.ts:58:	const granted = await serviceDb
packages/lib/src/or/visibility-service.integration.test.ts:3:import { serviceDb } from "../db/db";
packages/lib/src/or/visibility-service.integration.test.ts:22:	await serviceDb.delete(citations).where(eq(citations.brandId, BRAND));
packages/lib/src/or/visibility-service.integration.test.ts:23:	await serviceDb.execute(sql`DELETE FROM prompt_runs WHERE brand_id = ${BRAND}`);
packages/lib/src/or/visibility-service.integration.test.ts:24:	await serviceDb.delete(orPromptMeta).where(eq(orPromptMeta.brandId, BRAND));
packages/lib/src/or/visibility-service.integration.test.ts:25:	await serviceDb.delete(prompts).where(eq(prompts.brandId, BRAND));
packages/lib/src/or/visibility-service.integration.test.ts:26:	await serviceDb.delete(competitors).where(eq(competitors.brandId, BRAND));
packages/lib/src/or/visibility-service.integration.test.ts:27:	await serviceDb.delete(brands).where(eq(brands.id, BRAND));
packages/lib/src/or/visibility-service.integration.test.ts:28:	await serviceDb.delete(organization).where(eq(organization.id, ORG));
packages/lib/src/or/visibility-service.integration.test.ts:33:	await serviceDb
packages/lib/src/or/visibility-service.integration.test.ts:36:	await serviceDb
packages/lib/src/or/visibility-service.integration.test.ts:39:	await serviceDb
packages/lib/src/or/visibility-service.integration.test.ts:50:		const meta = await serviceDb.select().from(orPromptMeta).where(eq(orPromptMeta.brandId, BRAND));
packages/lib/src/or/visibility-service.integration.test.ts:58:		const ps = await serviceDb.select().from(prompts).where(eq(prompts.brandId, BRAND));
packages/lib/src/or/visibility-service.integration.test.ts:63:		const saved = await insertRuns(serviceDb, [
packages/lib/src/or/visibility-service.integration.test.ts:97:		await serviceDb.insert(citations).values({
packages/lib/src/or/visibility-service.integration.test.ts:128:		await serviceDb
packages/lib/src/or/visibility-service.integration.test.ts:135:		await serviceDb.delete(organization).where(inArray(organization.id, ["or-vis-other"]));
packages/lib/src/secrets/store.test.ts:10:	serviceDb: {
packages/lib/src/secrets/store.ts:2:import { serviceDb as db } from "../db/db";
```

</details>

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
| Repository hosting | GitHub | Branch `online-reset-platform` in `ai-solutions-nz/fix-issues`. A dedicated repository was not created (no permission from this session). |

The smallest valid live test, once approved, is 120 grounded API calls (10 questions × 4 engines × Christchurch × 3 repeats). Set the keys in `.env` and add `chatgpt:openai-api:online`-style targets to `SCRAPE_TARGETS`.

## Phase 2 gate (before any spend)

None of these is done yet. All four must be met before any paid API call:

- [ ] Gemini location handling confirmed and labelled. Gemini has no location parameter, so the location goes in the prompt text and runs record `location_applied = prompt_text`.
- [ ] Every engine runs with web search on through its official API (`:online` targets on `openai-api`, `anthropic-api`, Gemini and Perplexity); no consumer-interface scraping.
- [ ] The report shows the sample size and the spread across the 3 repeats for every metric.
- [ ] The 10 paid-test questions are frozen in the repository (committed and versioned) before the test runs.

## Next implementation task

The first item of the Phase 2 gate: implement and test Gemini's location handling, with runs labelled `location_applied = prompt_text`.

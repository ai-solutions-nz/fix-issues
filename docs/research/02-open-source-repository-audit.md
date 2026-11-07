# 02 — Open-Source Repository Audit

**Audit date:** 2026-11-07
**Method:** each repository was shallow-cloned; large repositories were sparse-checked-out. The source was read directly and no install scripts were run. Full per-repository findings, with file paths, are in `evidence/group*.md`; the method is in `evidence/00-audit-method-brief.md`.

## Limitations that apply to every row

1. **The GitHub REST API was refused (HTTP 403) in this session for every audited repository.** Stars, the `archived` flag, open-issue counts and **GitHub Security Advisories are therefore NOT VERIFIED**. Maintenance status comes from git (HEAD commit date, tag list, and commit cadence in deepened clones).
   **Owner action D7:** check advisories for every adopted repository before the build starts.
2. Test suites were **not run**, with one exception: Limelit's mentions, metrics and citations packages, which passed (see the end of this file).
3. "Latest release" means the newest tag returned by `git ls-remote`, or the version in the package manifest where tags are sparse.

## Licence key

- **P** = permissive (MIT, Apache-2.0, PostgreSQL, BSD).
- **C** = copyleft (GPL, AGPL).
- **SA** = source-available or commercial (Enterprise, FSL, proprietary).
- ⚠ = a mixed licence that needs care.

## Summary table (36 assigned repositories)

| # | Project | Audited commit (date) | Latest release | Status | Stack | Licence (class) | Commercial/SaaS/white-label notes |
|---|---|---|---|---|---|---|---|
| 1 | Elmo | `db2d52b` (2026-11-06) | v0.7.8 | Active (daily) | TS, TanStack Start, Drizzle, Postgres, pg-boss, better-auth | MIT (P) | Clean. Must rebrand (no trademark grant). PostHog telemetry is hard-coded and must be removed. |
| 2 | Canonry | `f5d4612` (2026-11-06) | npm 7.97.0 | Very active | TS, Fastify, SQLite | MIT ⚠ | `packages/integration-typesafe` is **FSL-1.1-ALv2 (SA)** and is bundled into the MIT npm artefact. Do not copy that package. Telemetry is on by default. |
| 3 | Limelit Open | `53d178b` (2026-11-06) | v0.1.0-rc.14 | Active, pre-release | Go, SQLite | Apache-2.0 (P) | Keep `NOTICE`. Open-core: the cloud features are absent, not locked. |
| 4 | OneGlanse | `b2c6e73` (2026-10-03) | none | Slowing (solo) | TS, Next, Postgres + ClickHouse + Redis, Camoufox | MIT (P) | Licence is fine, but its **collection method (anti-detect consumer-UI scraping) is a ToS breach risk**. |
| 5 | GeoLook | `9492cb3` (2026-08-10) | v0.2.0 | Stalled (solo) | Python stdlib, JSON files | MIT (P) | China-market focus; no CI. |
| 6 | OpenSEO | `7d89cfb` (2026-11-06) | v0.1.26 | Active | TS, TanStack Start, Drizzle, CF Workers / Docker | MIT (P) | Every data feature depends on paid DataForSEO. |
| 7 | SerpBear | `414ec8e` (2026-10-30) | v3.1.2 | Active | Next 12, Sequelize/SQLite | MIT (P) | Single user. Its `proxy` scraper scrapes Google directly, against Google's ToS. |
| 8 | Crawl4AI | `cae74b2` (2026-11-04) | v0.9.5 | Active | Python, Playwright | Apache-2.0 **+ attribution rider** ⚠ | Requires a credit line on an "About/Credits" page for any public use. Many SSRF/RCE reports in 2026, listed as fixed. Never expose its Docker server. |
| 9 | SquirrelScan | `ae44ccf` (2026-11-07) | v0.0.172 | Very active, pre-1.0 | TS on Bun | MIT (P) | `TRADEMARKS.md` requires forks to rebrand. Cloud-only features are not in the repo. |
| 10 | Unlighthouse | `9a2147d` (2026-10-23) | v0.19.1 (1.0 beta) | Active | TS, puppeteer-cluster | MIT (P) | — |
| 11 | Lighthouse | `ea58ed1` (2026-11-05) | v13.6.0 | Active (Google) | JS ESM | Apache-2.0 (P) | "Lighthouse" is a Google trademark. Sentry error reporting is opt-in; keep it off. |
| 12 | BERTopic | `9036123` (2026-08-27) | v0.17.4 (v1.0.0b1 tag) | Active, slowing | Python, torch | MIT (P) | Heavy dependency tree. |
| 13 | SEOMachine | `120e7b4` (2026-10-23) | no tags | Active, small | Claude Code workspace + about 17k lines of Python | MIT (P) | No CI; 8 tests. AI-citation research is a manual prompt template. |
| 14 | WordPress | `d2fc75d` (2026-11-06) | 7.1.4 | Active | PHP | GPL-2.0+ (C) | Integrating over HTTP does not trigger the GPL. Any WP plugin we ship must be GPL-compatible. |
| 15 | Strapi | `1144bb4` (2026-11-06) | v5.61.0 | Active | TS, Node | MIT + Enterprise ⚠ | `ee/` dirs **plus whole `review-workflows` and `content-releases` packages are Enterprise**. The MIT grant is conditional on having no Strapi Cloud account. |
| 16 | Activepieces | `c1525dc` (2026-11-07) | 0.92.3 | Active | TS, Postgres + Redis | MIT + Enterprise ⚠ | Multi-project, RBAC, SSO, API keys and **embedding/white-label are EE**. |
| 17 | Langflow | `60999cc` (2026-11-03) | v1.13.1 | Active | Python + React | MIT (P) | Connectors go through Composio (paid). Earlier versions had RCE CVEs (not re-verified here). |
| 18 | LangGraph (Py) | `e5e37b5` (2026-11-06) | 1.2.20 | Active | Python | MIT (P) ⚠ | The OSS libraries are MIT. **LangGraph Server/Platform, cron and the threads API need a licence key.** |
| 19 | Appsmith | `04f845e` (2026-11-06) | v2.6.0 | Active | Java, React, Mongo + Redis | Apache-2.0 ⚠ | Branding, SSO, granular access and multi-org are EE and **absent from the repo**. |
| 20 | Apache Superset | `b92fcb2` (2026-11-07) | 6.1.0 | Active (ASF) | Python/Flask, Celery, Redis | Apache-2.0 (P) | ASF trademark rules apply; it has a CVE history. |
| 21 | Langfuse | `f257bef` (2026-11-06) | v4.76.0 | Very active | TS, Postgres + ClickHouse + Redis + S3 | MIT + EE ⚠ | `ee/`, `web/src/ee/`, `worker/src/ee/` and `packages/shared/src/server/ee/` are commercial, including white-label UI and SSO. |
| 22 | Promptfoo | `db6a568` (2026-11-06) | 0.125.1 | Very active | TS | MIT (P) | Telemetry and remote red-team generation are on by default; turn both off. |
| 23 | Windmill | `5d3f239` (2026-11-06) | v1.864.1 | Very active | Rust, Svelte, Postgres | **AGPL-3.0** + Apache (clients) + proprietary EE ⚠ | **White-label / managed-service re-exposure needs a commercial licence.** CE images contain proprietary code. |
| 24 | Flowise | `9291856` (2026-08-13) | flowise@3.1.4 | Slowing | TS, Redis (queue) | Apache-2.0 + Commercial ⚠ | Orgs, workspaces, RBAC and SSO (`packages/server/src/enterprise`) are commercial. |
| 25 | Twenty CRM | `d539d31` (2026-11-07) | v2.9.0 (2026-06-04) | Very active (no tag since June) | TS, NestJS, Postgres + Redis | **AGPL-3.0** + `@license Enterprise` files + MIT SDKs ⚠ | **§7 "Application Exception"**: API-only applications may stay proprietary (verified in `LICENSE`). Modifying Twenty brings AGPL §13 into force. 695 files are Enterprise-licensed. |
| 26 | EspoCRM | `b137f20` (2026-11-06) | 10.0.11 | Active | PHP | **AGPL-3.0 + §7(b) "EspoCRM" display term** (C) | **White-label prohibited.** |
| 27 | Chatwoot | `625d596` (2026-11-06) | v4.19.1 | Very active | Rails, Sidekiq, Postgres + Redis | MIT + `enterprise/` ⚠ | EE resets branding to Chatwoot. Use the FOSS build with `enterprise/` removed. |
| 28 | Umami | `559e3c6` (2026-10-23) | v3.4.1 | Active, slower | Next 16, Prisma, Postgres | MIT (P) | — |
| 29 | Matomo | `1175158` (2026-11-06) | 5.14.2 | Active | PHP, MySQL | **GPL-3.0+** (trackers are BSD) (C) | Trademark and "misrepresent origin" clause. |
| 30 | Mautic | `4b2f796` (2026-11-06) | 7.2.2 | Very active | PHP/Symfony | **GPL-3.0+** (C) | Single tenant per install. |
| 31 | Easy!Appointments | `f6c8a4c` (2026-10-19) | 1.6.1 | Active (solo) | PHP CI3 | **GPL-3.0** (C) | 12 tests; webhooks authenticated by a static header. |
| 32 | Listmonk | `91b76ec` (2026-11-06) | v6.2.0 | Active | Go, Postgres | **AGPL-3.0** (C) | Integrate API-only and unmodified. |
| 33 | Keycloak | `d4d5554` (2026-11-06) | 26.8.2 | Active (CNCF) | Java/Quarkus | Apache-2.0 (P) | About 1.25 GB RAM per pod (from its own docs). |
| 34 | PostgreSQL | `0607aa6` (2026-11-06) | REL_18_6 | Active | C | PostgreSQL (P) | — |
| 35 | Playwright | `07c7069` (2026-11-06) | v1.65.0 | Active (Microsoft) | TS | Apache-2.0 (P) | Bundled browsers carry their own licences. Using it on consumer AI UIs is a ToS risk. |
| 36 | Ollama | `5e983d4` (2026-11-06) | v0.40.15 | Active | Go | MIT (P) | **Model-weight licences vary.** Cloud passthrough routes call ollama.com. |

Full 40-character SHAs are in the evidence files.

## Additional repositories (added only to fill a verified gap)

| Project | Why added | Commit / version | Licence | Gap filled |
|---|---|---|---|---|
| **LangGraph.js** (`langchain-ai/langgraphjs`) | Elmo, the chosen base, is TypeScript; the Python LangGraph would add a second runtime | `2d4f48d` (2026-11-07), `@langchain/langgraph` 1.7.2, checkpoint-postgres 1.1.2 | MIT (root + every lib, including `langgraph-api`) | Durable multi-step agent graphs with human approval. `interrupt()` at `libs/langgraph-core/src/interrupt.ts:92`, `PostgresSaver` at `libs/checkpoint-postgres/src/index.ts:104`, `RetryPolicy` at `libs/langgraph-core/src/pregel/utils/index.ts:56`; 230 test files. |
| **pg-boss** | Postgres-native queue, so no Redis | `5abc8ce` (2026-11-06), 12.38.1 | MIT | Cron, retries, dead-letter queue, singleton jobs. **Elmo already uses it.** |
| graphile-worker | Alternative to pg-boss | `b4f1b41` (2026-11-05), v0.18.0 | MIT | Same gap; pre-1.0. |
| **pgvector** | Prompt embeddings for dedup and clustering | `724588a` (2026-11-04), v0.8.7 | PostgreSQL | Replaces BERTopic's heavy stack. |
| **Better Auth** | Lighter than Keycloak | `ba59f5d` (2026-11-06), v1.7.18 | MIT | Organisations, members, invitations, RBAC, SSO. **Elmo already uses it.** |

## Licence risk register (flagged separately as the brief requires)

### Copyleft (GPL / AGPL)

- **AGPL-3.0:**
  - **Windmill.** Rejected; white-label also needs a commercial licence.
  - **Twenty.** API-only use only.
  - **EspoCRM.** Rejected; the attribution term makes it non-white-label.
  - **Listmonk.** API-only use, if used at all.
- **GPL:**
  - **WordPress.** HTTP integration only.
  - **Matomo, Mautic, Easy!Appointments.** All rejected.
- **Rule:** never copy copyleft code into the Online Reset codebase.

### Source-available, commercial or proprietary components inside "open" repos

These directories must **never be copied or enabled**:

- Canonry `packages/integration-typesafe` (FSL-1.1-ALv2).
- Activepieces `packages/ee/`, `packages/server/api/src/app/ee/`, plus the EE-named code outside those paths.
- Flowise `packages/server/src/enterprise/`.
- Langfuse `ee/`, `web/src/ee/`, `worker/src/ee/`, `packages/shared/src/server/ee/`.
- Strapi `ee/`, `review-workflows/`, `content-releases/`.
- Twenty `/* @license Enterprise */` files.
- Chatwoot `enterprise/`.
- Windmill EE (absent from the repo, but present in its CE Docker images).
- LangGraph Server/Platform.

### Paid external services behind otherwise free code (not licences, but cost dependencies)

- **DataForSEO:** OpenSEO, SEOMachine, Elmo, Limelit, Canonry SEO data.
- **TypeSafe "Jev" judge:** Elmo, mandatory today; Canonry, optional.
- **Cloro, BrightData, Oxylabs, Olostep, SearchAPI:** Elmo consumer-surface adapters.
- **SerpApi, Serper, ValueSERP and others:** SerpBear.
- **Composio:** Langflow.
- **Exa:** SEOMachine.
- **Twilio and Meta:** Chatwoot.

### Attribution obligations to carry into the product

| Obligation | Applies to |
|---|---|
| Credits line on an "About" page | Crawl4AI (only if adopted) |
| `NOTICE` files | Limelit, Keycloak, Playwright, Superset |
| MIT copyright notices in copied files | Elmo, Canonry, OpenSEO, SerpBear, SEOMachine, GeoLook, Activepieces pieces, Chatwoot snippets |

### Trademarks: rebrand everything

Elmo, Canonry, Limelit, SquirrelScan, Chatwoot, Twenty, Umami, Lighthouse, Superset, WordPress.

## Security observations (from code reading; advisories not API-verified)

- **Elmo:** `.enableRLS()` is set on its tables, but **no `pgPolicy` is defined** (0 matches in `packages/lib/src/db/schema.ts`), and no `app.tenant_id` session setting was found. Tenant isolation is therefore **application-level filtering on `organization_id`**, not database-enforced. Online Reset must add real RLS policies (see 05 §6).
- **Crawl4AI:** a long 2026 SSRF/RCE history (`SECURITY-CREDITS.md`). Wrap it behind our own URL allow-list and SSRF guard.
- **Superset:** default-secret history. **Langflow:** historic RCE.
- **Easy!Appointments:** unsigned webhooks.
- **Ollama:** its API has no authentication by default.

## Local verification executed (no cost)

| Test | Command | Result |
|---|---|---|
| Limelit deterministic mention matcher + metrics + citations | `go test -count=1 ./internal/mentions/ ./internal/metrics/ ./internal/citations/` at `53d178b`, Go 1.25.0 | **PASS** (mentions: 26 top-level tests passed, 0 failed; metrics ok; citations ok) |
| Elmo claims re-checked by direct grep | `DFS_LOCATION_CODE = 2840` (`dataforseo-shared.ts:16`); `createMentionAnalyzer` throws without a `TYPESAFE_API_KEY` or `OPENROUTER_API_KEY` (`mention-judge/analyze.ts:293`); 0 `pgPolicy` | Confirmed |
| Twenty Application Exception | read `LICENSE` lines 12–40 | Confirmed |
| Crawl4AI attribution rider | read `LICENSE` lines 54–67 | Confirmed |

No other test suites were run. Installing the TypeScript monorepos requires running dependency install scripts, which the working rules prohibit before review.

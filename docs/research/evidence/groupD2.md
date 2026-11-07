# groupD2 — Appsmith, Apache Superset, Langfuse, Promptfoo

Method: `git clone --depth 1 --filter=blob:limit=2m --sparse`, then files read with `git show HEAD:<path>` / `git ls-tree`. No code run.
**gh API was blocked for these repos in this session (HTTP 403 "GitHub access to this repository is not enabled")**, so stars, archived flag, open issues and security advisories are **NOT VERIFIED**. Release tags and dates come from `git ls-remote` plus a tag fetch. Maintenance is judged from HEAD date and how recent the tags are.

---

### 19. Appsmith
- URL: https://github.com/appsmithorg/appsmith. HEAD `04f845ebfe6eb366a0fca227db58f51415c4536b` (2026-11-06). Latest tag `v2.6.0` (2026-10-28; the earlier v1.x line ended at `v1.99`, 2026-04-14). Archived/stars: NOT VERIFIED. Maintenance: **active** (commit a day before audit, release 10 days old).
- Stack: Java Spring (WebFlux) server `app/server/appsmith-server`, React/TS client `app/client`, Node RTS `app/client/packages/rts`. Ships as one container with embedded MongoDB (`Dockerfile` checks `server/mongo/server.jar`), Redis, Java and Node. Heavy.
- Tests/CI: about 1,014 test files (`*Test.java`, `*.test.ts(x)`, plus Cypress `app/client/cypress`, Playwright `app/client/playwright/tests`). 55 workflows. Advisories: not checked (API blocked).
- **Licence**: Apache-2.0 (`/LICENSE`). Commercial modification and white-label are allowed by the licence (Apache §6: the name and marks are not licensed). No AGPL obligations. **EE code is not in this repo.** The server has 408 files under `.../server/**/ce/` plus `*CECompatible*` stubs (e.g. `PermissionGroupServiceCECompatibleImpl`, `UserAndAccessManagementServiceCECompatibleImpl`, `PACConfigurationServiceCECompatibleImpl`) that extend the CE implementations. There are 0 `/ee/` dirs in the server. `app/client/src/ee/*` (293 files) are mostly re-export shims (`export * from "ce/..."`). `LicensePlan.java` = `enum LicensePlan { FREE }`.
- EE/paid features are gated by flags in `app/client/src/ce/utils/planHelpers.ts`:
  - `license_branding_enabled` (white-label branding; the CE page shows `Branding/UpgradeBanner.tsx` with a `BusinessTag`)
  - `license_sso_oidc_enabled`
  - `license_sso_saml_enabled`
  - `license_gac_enabled` (granular access control)
  - `license_multi_org_enabled`
  - `license_git_branch_protection_enabled`

  CE auth offers form login plus Google/GitHub OAuth (`config/authentication.tsx`). The implementations behind these flags are absent, so **branding, SAML/OIDC SSO, GAC and multi-org are proprietary (Business/Enterprise)**.

| Capability | File path(s) | Symbols | What it does | Deps | In→Out | Tests | Reusable alone? | Legal to copy? |
|---|---|---|---|---|---|---|---|---|
| Internal-tool app builder | `app/client/src`, `app/server/appsmith-server` | — | Drag-and-drop CRUD UIs over datasources | Mongo, Redis, Java, Node | datasource → admin UI | yes | No (monolith) | Yes (Apache) |
| Feature gating | `app/client/src/ce/utils/planHelpers.ts` | `isBrandingEnabled`, `isSAMLEnabled`, `isGACEnabled` | Feature-flag checks for paid features | — | flags → bool | — | n/a | Yes |
| RBAC (CE) | `PermissionGroupServiceCECompatibleImpl` | — | Basic workspace roles only; GAC is EE | — | — | yes | No | Yes |
| Datasource OAuth2 helpers | `app/server/appsmith-interfaces/.../restApiUtils/connections/OAuth2AuthorizationCode.java`, `OAuth2ClientCredentials.java` | — | REST datasource OAuth2 | Spring | — | yes | Marginal | Yes |

- **Recommendation: REJECT for the customer-facing portal.** It builds internal tools. It does not provide multi-tenancy, multi-org or white-labelling in CE, and its UI does not fit a branded SaaS product. At most it could serve as an optional SEPARATE SERVICE for internal ops/admin screens. Retool-style admin screens are cheaper to build directly in our own frontend.
- Scores:

  | Criterion | Score | Why |
  |---|---|---|
  | Functional coverage | 1 | Internal-tool builder only |
  | Reusability | 1 | Monolith |
  | Licence | 4 | Apache-2.0, but needed features are EE |
  | Maintenance | 5 | Active |
  | Security/tests | 4 | Large suite; advisories unchecked |
  | Ops cost | 2 | Mongo + Redis + Java + Node |
  | Complexity | 1 | Hardest to integrate |

---

### 20. Apache Superset
- URL: https://github.com/apache/superset. HEAD `b92fcb206166a394742740fa8a2a5162bfaad4be` (2026-11-07). Latest release tag `6.1.0` (2026-05-01). Stars/archived: NOT VERIFIED. Maintenance: **active** (ASF top-level project, daily commits).
- Stack: Python/Flask + Flask-AppBuilder, SQLAlchemy, Celery (`celery>=5.6.3` in `pyproject.toml`), Redis (`redis>=5.0.0`), and a React frontend. `docker-compose-non-dev.yml` uses `postgres:17` + `redis:7`. Workers are needed for reports, alerts, thumbnails and async queries (see `config.py`: "Requires Celery and THUMBNAIL_CACHE_CONFIG"). Heavy: about 4 processes (web, worker, beat, Redis, metadata DB) plus an analytics DB.
- Tests/CI: about 2,137 test files (`tests/`, `test_*.py`, `*.test.tsx`). 57 workflows, including `license-check.yml`. Advisories: not checked (API blocked). Superset has a history of CVEs (e.g. default SECRET_KEY), so harden it.
- **Licence**: Apache-2.0 (`LICENSE.txt`, `NOTICE`, `superset-core/LICENSE.txt`, `superset-extensions-cli/LICENSE.txt`). No EE/commercial dirs. Commercial modification and SaaS use are OK, with no source-disclosure duty. White-label: the code may be rebranded (`APP_ICON`/`APP_NAME` config), but ASF trademark policy forbids presenting our product as "Superset". Keep the NOTICE file.

| Capability | File path(s) | Symbols | What it does | Deps | In→Out | Tests | Reusable alone? | Legal? |
|---|---|---|---|---|---|---|---|---|
| Embedded dashboards SDK | `superset-embedded-sdk/src/index.ts`, `guestTokenRefresh.ts` (`@superset-ui/embedded-sdk` 0.4.0, Apache-2.0) | `embedDashboard({ fetchGuestToken, dashboardUiConfig, ... })` | Iframe-embeds a dashboard in a host page; refreshes the guest token | Superset server | dashboard id + token → iframe | yes | Yes (npm dep) | Yes |
| Guest token issuance | `superset/security/api.py` | `guest_token()` (`POST /api/v1/security/guest_token/`, permission `grant_guest_token`), `GUEST_TOKEN_VALIDATOR_HOOK` | Backend mints a JWT for user, resources and RLS rules | Flask, PyJWT | JSON → JWT | yes | Service | Yes |
| Guest token core | `superset/security/manager.py` | `create_guest_access_token` (l.6408), `parse_jwt_guest_token` (l.6590), `validate_guest_token_resources` (l.6327), `get_guest_user_from_request` (l.6452), `has_guest_access` (l.6774) | Signs and validates guest JWTs; scopes them to dashboards | `GUEST_TOKEN_JWT_SECRET`, `EMBEDDED_SUPERSET` flag | — | yes | Service | Yes |
| Per-tenant RLS | `manager.py` `get_guest_rls_filters` (l.6092), `get_rls_filters` (l.6110), `get_guest_rls_filters_str`; `superset/row_level_security/api.py` | — | Injects SQL WHERE clauses per dataset from token rules (e.g. `tenant_id = 'x'`) | SQLAlchemy | rules → SQL filter | yes | Service | Yes |
| Caching/async | `superset/config.py` | `CACHE_CONFIG`, `DATA_CACHE_CONFIG`, `THUMBNAIL_CACHE_CONFIG` | Redis cache + Celery jobs | Redis, Celery | — | — | — | — |

- **Recommendation: SEPARATE SERVICE (optional, later), embedded via the SDK with guest tokens + RLS for tenant isolation.** It is a strong fit for client reporting if dashboards must be ad hoc or configurable. For fixed SEO/AEO reports, native charts in our own frontend are lighter. Do not fork.
- Scores:

  | Criterion | Score | Why |
  |---|---|---|
  | Functional coverage | 4 | Reporting/dashboards only |
  | Reusability | 3 | SDK yes, server is a service |
  | Licence | 5 | Apache, no EE |
  | Maintenance | 5 | Active ASF project |
  | Security/tests | 4 | Large suite; CVE history |
  | Ops cost | 2 | Flask + Celery + Redis + Postgres |
  | Complexity | 2 | Theming the iframe, syncing tokens/RLS |

---

### 21. Langfuse
- URL: https://github.com/langfuse/langfuse. HEAD `f257bef7c17b489ebd79a230e906abcc2d5ef5d7` (2026-11-06). Latest tag `v4.76.0` (2026-11-05). Docker images now default to tag `4`. Copyright holder is now "ClickHouse, Inc." (LICENSE). Stars: NOT VERIFIED. Maintenance: **very active** (near-daily releases).
- Stack: Next.js web + Node worker (TypeScript, pnpm/turbo), plus a Rust native package (`packages/native`, OTel media parsing). The self-host stack in `docker-compose.yml`:
  - `langfuse-web`, `langfuse-worker`, `langfuse-ai-gateway`
  - `clickhouse/clickhouse-server:26.3.x`
  - `minio` (S3-compatible)
  - `redis:7`
  - `postgres:17`

  So v3/v4 needs **Postgres + ClickHouse + Redis + S3 blob storage**. This is medium-heavy; ClickHouse is the main ops burden.
- Tests/CI: about 488 test files (`*.test.ts`, `*.servertest.ts`, e.g. `web/src/__tests__/server/`). About 43 workflows, including codeql, semgrep, snyk, zizmor, `model-price-audit.yml` and `licencecheck.yml`. Advisories: not checked (API blocked).
- **Licence**: **MIT** core, with commercial **Langfuse Enterprise License** (`ee/LICENSE`) for exactly these paths, per the root LICENSE: `ee/`, `web/src/ee/`, `worker/src/ee/`, `packages/shared/src/server/ee/`. EE code may be modified, but it may only be *used* with a valid EE licence. EE is enabled when `isEeAvailable` is true (`ee/src/ee-license-check/index.ts`: cloud region or `LANGFUSE_EE_LICENSE_KEY` is set).
  - EE features (`web/src/ee/features/`): `ui-customization` (white-label), `multi-tenant-sso`, `sso-settings`, `admin-api`, `audit-log-viewer`, `access-audit-log`, `billing`, `external-media-storage`, `verified-domains`, `support-access`, `sfdc-sync`, `storage-role-auth`.
  - EE worker jobs (`worker/src/ee/`): `dataRetention`, `usageThresholds`, `cloudUsageMetering`, `cloudSpendAlerts`, `fipsMode.ts`.

  Core RBAC (orgs/projects/roles) is MIT: `packages/shared/src/features/rbac/projectAccessRights.ts` (`projectRoleAccessRights`), `organizationAccessRights.ts`. Network use triggers no disclosure duty. White-labelling the UI is EE, which is irrelevant if it stays internal.

| Capability | File path(s) | Symbols | What it does | Deps | In→Out | Tests | Reusable alone? | Legal? |
|---|---|---|---|---|---|---|---|---|
| OTel trace ingestion | `web/src/pages/api/public/otel/v1/traces/index.ts`, `.../otel/v1/metrics/index.ts`, `worker/src/features/otel-ingestion/processOtelEvents.ts`, `prepareOtelBatch.ts`, `packages/shared/src/server/otel/ObservationTypeMapper.ts` | `withMiddlewares`, `createAuthedProjectAPIRoute` | OTLP HTTP endpoint mapped to traces/observations in ClickHouse | ClickHouse, S3, Redis | OTLP → traces | yes | Service | MIT |
| Native ingestion API | `web/src/pages/api/public/ingestion.ts`, `packages/shared/src/server/ingestion/processEventBatch.ts` | `processEventBatch` | Batch event ingest (SDKs) | same | events → traces | yes | Service | MIT |
| Cost tracking | `worker/src/constants/default-model-prices.json` (about 185 models, regex `matchPattern`, `pricingTiers`), `packages/shared/src/server/ingestion/modelMatch.ts` | `findModel`, `findPricingTiersForModel` | Matches model name to price and computes usage cost; custom models via `api/public/models` | Postgres, Redis cache | usage → $ | yes | **The price JSON is copyable** | MIT |
| Orgs/projects/RBAC | `packages/shared/src/features/rbac/*`, `web/src/pages/api/public/organizations/*` | `projectRoleAccessRights` | Org → project → role scopes | Postgres | — | yes | Pattern only | MIT |
| Datasets/experiments/annotation | `web/src/pages/api/public/datasets/*`, `experiments/`, `annotation-queues/` | — | Eval datasets and human review queues | — | — | yes | Service | MIT |
| Metrics API | `web/src/pages/api/public/metrics/index.ts`, `daily.ts` | — | Cost/latency aggregates per project | ClickHouse | — | yes | Service | MIT |
| White-label UI, SSO, audit log, retention | `web/src/ee/features/*`, `worker/src/ee/*` | — | Enterprise features | — | — | some | — | **NO without EE licence** |

- **Recommendation: SEPARATE SERVICE (internal ops-only observability)**, self-hosted, with one Langfuse project per environment (not per customer). Send traces via the OTel/SDK from our workers. Optionally COPY-AND-ADAPT `default-model-prices.json` (MIT) for our own per-tenant cost metering. Never enable or copy `ee/` paths.
- Scores:

  | Criterion | Score | Why |
  |---|---|---|
  | Functional coverage | 5 | LLM tracing/cost/evals |
  | Reusability | 3 | Service; price table reusable |
  | Licence | 4 | MIT core, clear EE boundary |
  | Maintenance | 5 | Very active |
  | Security/tests | 4 | Many scanners |
  | Ops cost | 2 | ClickHouse + PG + Redis + S3 |
  | Complexity | 3 | SDK integration is easy, ops is not |

---

### 22. Promptfoo
- URL: https://github.com/promptfoo/promptfoo. HEAD `db6a5682c17c1a834bc729813119a4ee14b76041` (2026-11-06). Latest tag `0.125.1` (2026-10-25; `package.json` version 0.125.1). Stars: NOT VERIFIED. Maintenance: **very active**.
- Stack: TypeScript Node CLI + library (`main: ./dist/src/index.js`), local SQLite via drizzle (`drizzle.config.ts`), React viewer `src/app`. No external services are required.
- Tests/CI: about 1,432 `*.test.ts(x)` files (vitest; there are also integration and smoke configs). 20 workflows (`main.yml`, codeql, docker, release-please). Advisories: not checked.
- **Licence**: **MIT** (`/LICENSE`, "Copyright (c) Promptfoo 2025"). One vendored LICENSE: `plugins/promptfoo/skills/promptfoo-provider-setup/scripts/vendor/LICENSE`. No ee/ dir. Cloud/enterprise touchpoints:
  - `src/globalConfig/cloud.ts` (`CLOUD_API_HOST = 'https://api.promptfoo.app'`)
  - `src/app/src/components/EnterpriseBanner.tsx`
  - `src/redteam/remoteGeneration.ts`: red-team generation calls `api.promptfoo.app` by default. Opt-outs: `neverGenerateRemote()` / `neverGenerateRemoteForRegularEvals()`.

  Telemetry is on by default; disable it with `PROMPTFOO_DISABLE_TELEMETRY` (`src/telemetry.ts`). Sharing and the cloud dashboard are the hosted/commercial product. The core eval engine is fully local and MIT.

| Capability | File path(s) | Symbols | What it does | Deps | In→Out | Tests | Reusable alone? | Legal? |
|---|---|---|---|---|---|---|---|---|
| Node eval API | `src/index.ts` (exports `evaluate`, `assertions`, `loadApiProvider(s)`, `getModelPricing`, `cache`, `guardrails`, `redteam`), `src/node/evaluate.ts` | `evaluate(testSuite: EvaluateTestSuite, options)` (l.65) | Runs prompts × providers × test cases and grades them | Provider API keys | suite → results table | yes | **Yes (npm dep)** | MIT |
| Deterministic assertions | `src/assertions/contains.ts`, `equals.ts`, `regex.ts`, `startsWith.ts`, `json.ts`, `xml.ts`, `html.ts`, `sql.ts`, `levenshtein.ts`, `wordCount.ts`, `rouge.ts`, `bleu.ts`, `meteor.ts`, `javascript.ts`, `python.ts`, `cost.ts`, `latency.ts`, `webhook.ts` | types incl. `contains-all/any`, `icontains-*`, `is-json`, `contains-json`, `regex`, `levenshtein`, `rouge-n`, `word-count` | Free, local checks | — | output → pass/score | yes | Yes | MIT |
| Model-graded assertions | `src/assertions/llmRubric.ts` (`handleLlmRubric` → `matchers/llmGrading` `matchesLlmRubric`), `factuality.ts`, `geval.ts`, `modelGradedClosedQa.ts`, `answerRelevance.ts`, `contextFaithfulness.ts`, `contextRecall.ts`, `contextRelevance.ts`, `searchRubric.ts`, `classifier.ts`, `moderation.ts`, `refusal.ts` | `llm-rubric`, `g-eval`, `factuality`, `search-rubric`, `is-refusal` | LLM-as-judge content QA | Grader LLM (`src/providers/defaults.ts` auto-picks OpenAI/Anthropic/Gemini/Azure by env key) — **paid API** | output + rubric → score | yes | Yes | MIT |
| Semantic similarity | `src/assertions/similar.ts` | `similar` | Embedding cosine vs expected text | Embedding provider (paid API) | — | yes | Yes | MIT |
| Providers | `src/providers/` (123 entries: `openai/`, `anthropic/`, `google/`, `perplexity.ts`, `xai/`, `azure/`, `bedrock/`, `mistral`, `ollama.ts`, `http.ts`, `browser.ts`) | `loadApiProvider` | Unified LLM callers via official APIs; `http.ts` for arbitrary endpoints | Vendor APIs | prompt → completion | yes | Yes | MIT |
| Pricing | `src/providers/pricing` | `getModelPricing` | Model price lookup | — | — | yes | Yes | MIT |
| Red team | `src/redteam/*` | `redteam.generate/run` | Adversarial tests; default remote generation via api.promptfoo.app | **Promptfoo cloud** | — | yes | Opt-out needed | MIT |

- **Recommendation: DEPENDENCY (dev/CI + internal QA worker)** with telemetry and remote generation disabled.
  - (a) Regression tests: run our AEO prompt → answer → brand/citation-extraction pipeline against golden fixtures in CI, using deterministic assertions plus `javascript` custom asserts.
  - (b) Content QA: score drafted content with `llm-rubric` / `g-eval` / `factuality` before human approval.

  Do not expose its web viewer to customers.
- Scores:

  | Criterion | Score | Why |
  |---|---|---|
  | Functional coverage | 4 | Evals/QA |
  | Reusability | 5 | Library API |
  | Licence | 5 | MIT |
  | Maintenance | 5 | Very active |
  | Security/tests | 4 | Large suite |
  | Ops cost | 4 | Only grader API cost |
  | Complexity | 4 | Easy to integrate |

---

## Group summary
- **Best in group:**
  - LLM tracing/cost: Langfuse (service), plus its MIT price table.
  - LLM evals / content QA / regression tests: Promptfoo (library).
  - Customer-facing embedded reporting: Superset (embedded SDK + guest token + RLS), optional.
  - Internal tools: Appsmith (not needed).
- **Overlaps:**
  - Langfuse datasets/experiments partly overlap with Promptfoo evals. Use Promptfoo in CI and Langfuse for production traces and human annotation.
  - Both carry model price tables (Langfuse `default-model-prices.json`, Promptfoo `getModelPricing`).
  - Superset and Appsmith both "build UIs over data". Superset is the only one with a real multi-tenant embed story (RLS in guest tokens).
- **Red flags:**
  1. Appsmith: branding, SAML/OIDC, GAC and multi-org are closed-source EE (flags only in CE). Unsuitable for a branded customer portal. **Reject for customer UI.**
  2. Langfuse: `ee/`, `web/src/ee/`, `worker/src/ee/`, `packages/shared/src/server/ee/` are commercial; do not copy them. The ClickHouse ops burden is real, and ownership has moved to ClickHouse, Inc.
  3. Promptfoo: default telemetry plus remote red-team generation calls `api.promptfoo.app`. Set `PROMPTFOO_DISABLE_TELEMETRY` and disable remote generation.
  4. Superset: weight (Celery/Redis), CVE history, and the ASF trademark (do not brand as "Superset"). Guest-token RLS must be generated server-side per tenant and never trusted from the client.
  5. GitHub API metadata (stars, advisories) NOT VERIFIED for all four.

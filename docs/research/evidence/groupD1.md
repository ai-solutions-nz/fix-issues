# Group D1 — Orchestration / workflow / agent-flow platforms

Audit date 2026-11-07. Clones: `scratchpad/repos/<name>` (`--depth 1 --filter=blob:limit=2m --sparse`; files read via `git show HEAD:<path>`). **No repo code was run.**
**`gh api` was blocked for every repo in this session (HTTP 403, "GitHub access to this repository is not enabled")**, so stars, archived flag, open issues and security advisories are **NOT VERIFIED**. Maintenance status comes from the HEAD commit date and `git ls-remote --tags`.

---

### 16. Activepieces
- URL https://github.com/activepieces/activepieces · commit `c1525dc816cb` (2026-11-07) · latest tag `0.92.3` (plus `0.92.3-hotfix.2`) · stars/archived NOT VERIFIED · **active** (HEAD committed on the audit day; hotfix tags exist).
- TypeScript (Nx monorepo): Fastify API (`packages/server/api`), worker (`packages/server/worker`), engine (`packages/server/engine`), React web (`packages/web`), 745 community pieces (`packages/pieces/community`) plus core pieces (`packages/pieces/core`). Services: `docker-compose.yml` uses `pgvector/pgvector:0.8.0-pg14` and `redis:7.0.7`. A PGLite/SQLite dev mode also exists (`database/migration/postgres/1765308234291-MigrateSqliteToPglite.ts`).
- Tests: about 1,746 test/spec files (vitest; for example `packages/pieces/core/approval/test/*.test.ts`). 38 workflows in `.github/workflows`. Advisories NOT VERIFIED.
- **Licence:** root `LICENSE` is **MIT (Expat)**, except **`packages/ee/` and `packages/server/api/src/app/ee/`**, which fall under `packages/ee/LICENSE`, the "Activepieces Enterprise license". That licence is **proprietary**: production use needs a paid subscription for the right seat count; you may modify it only for dev/test; you may not copy or distribute it; Activepieces owns your patches. Grey zone: EE-named code also sits outside those two paths (`packages/server/worker/src/lib/execute/jobs/ee/agent/*`, `packages/core/shared/src/lib/ee/billing/index.ts`). The literal LICENSE text puts these under MIT, but treat them as EE. MIT parts can be used commercially and white-labelled. There is no network-use clause and no obligation to disclose source.
- **EE-only (from `OPEN_SOURCE_PLAN` in `packages/core/shared/src/lib/ee/billing/index.ts`):** `embeddingEnabled:false` (white-label embed SDK `packages/ee/embed-sdk`, signing keys, managed-authn), `ssoEnabled:false`, `projectRolesEnabled:false`, `customRolesEnabled:false`, `apiKeysEnabled:false`, `auditLogEnabled:false`, `customAppearanceEnabled:false`, `billedTeamProjectsLimit:1`, `scimEnabled:false`. **So multi-project tenancy, RBAC, SSO and white-label embedding are all commercial.** The gate is `platformMustHaveFeatureEnabled()` in `ee/authentication/ee-authorization.ts`, which returns HTTP 402 (documented in `brain/knowledge/platform-editions-ee/ee-overview.md` and `embed.md`).

| Capability | File path(s) | Symbols | What it does | Deps | In→Out | Tests | Reusable alone? | Legal to copy? |
|---|---|---|---|---|---|---|---|---|
| Human approval | `packages/pieces/core/approval/src/lib/actions/wait-for-approval.ts`, `create-approval-link.ts` | `waitForApprovalLink`, `ctx.run.createWaitpoint({type:'WEBHOOK'})`, `waitForWaitpoint` | Pauses a run until a resume URL is hit with `action=approve/disapprove`. Marked legacy; replaced by the "Approvals tab" | engine waitpoints | run → paused → resumed with `{approved}` | `test/create-approval-link.test.ts` | No (needs the engine) | Yes (MIT) |
| Delay / schedule | `packages/pieces/core/delay`, `packages/pieces/core/schedule` | pieces | Wait-for-time and cron triggers | engine, Redis queue | — | yes | No | Yes |
| WordPress | `packages/pieces/community/wordpress` (34 action files) | createAction | REST posts/media | WP REST | — | NOT VERIFIED | **Yes, copy-and-adapt** | Yes (MIT) |
| Shopify | `packages/pieces/community/shopify` | — | Admin API actions/triggers | Shopify API | — | NOT VERIFIED | Yes | Yes |
| Google Search Console | `packages/pieces/community/google-search-console/src/lib/actions/{search-analytics,url-inspection,submit-sitemap-by-site-url,...}.ts` | — | GSC search analytics, URL inspection, sitemaps | googleapis | — | NOT VERIFIED | Yes | Yes |
| GA4 | — | — | **No GA4 piece found** (only `fathom-analytics`, `google-*` for other products) | — | — | — | — | — |
| HubSpot / Gmail / Slack / Twilio | `packages/pieces/community/{hubspot,gmail,slack,twilio}` | — | CRM, mail, chat, SMS | vendor APIs | — | NOT VERIFIED | Yes | Yes |
| Embed / white-label | `packages/ee/embed-sdk/src/index.ts`, `server/api/src/app/ee/embed-subdomain`, `ee/signing-key`, `ee/managed-authn` | `ActivepiecesEmbedded` | iframe builder + JWT provisioning | — | — | `embed-sdk/test/index.test.ts` | — | **No (commercial)** |
| RBAC/SSO/projects | `server/api/src/app/ee/{projects,authentication,scim}` | — | — | — | — | — | — | **No (commercial)** |

- **Recommendation: COPY-AND-ADAPT individual MIT pieces** (WordPress, GSC, Shopify, HubSpot, Slack, Gmail, Twilio) as connector reference code. **REJECT as the orchestration layer**: tenancy, RBAC, SSO and embedding are paid, and we would be running a second product behind our UI.
- Scores: coverage 4 (connectors, approvals, cron) · reusability 3 (pieces copy out fine; the engine does not) · licence 3 (MIT core, but everything multi-tenant is EE) · maintenance 5 · security/tests 4 · op cost 3 (Postgres+Redis+worker sandbox) · complexity 2.

---

### 17. Langflow
- URL https://github.com/langflow-ai/langflow · commit `60999cc9a735` (2026-11-03) · latest stable tag `v1.13.1` (dev tags `v1.14.0.dev20`) · stars NOT VERIFIED · **active**.
- Python (FastAPI backend `src/backend/base/langflow`, component lib `src/lfx`) with a React frontend. Postgres or SQLite. Optional Redis/Celery (`src/backend/base/pyproject.toml`: `redis`, `apscheduler`; root `pyproject.toml`: `celery`).
- Tests: about 2,862 test files; 56 workflows. Advisories NOT VERIFIED (Langflow has had well-publicised RCE CVEs in its code-validation endpoint historically; NOT VERIFIED here).
- **Licence: MIT**, a single root `LICENSE`. `git grep` found no commercial/EE/BUSL headers. Commercial use, modification and white-label are fine, keeping the notice. No SaaS obligations.
- Multi-tenancy: users plus folders/projects (`services/database/models/folder/`). No orgs/workspaces RBAC found. SSO NOT VERIFIED.

| Capability | Path | Symbols | Does | Notes |
|---|---|---|---|---|
| HITL | `src/lfx/src/lfx/components/flow_controls/human_input.py` | `HumanInput`, `HUMAN_INPUT_REQUIRED` | Pause + branch on Approve/Reject/custom, with timeout fallback | New (LE-1449); maturity uncertain |
| Cron | `src/lfx/src/lfx/components/triggers/schedule_trigger.py` | `ScheduleTriggerComponent`, `validate_cron_expression` | Cron with timezone | APScheduler |
| Webhook trigger | `components/triggers/inbound_webhook_trigger.py` | — | inbound | — |
| Connectors | `components/composio/` (Composio = **paid external service**), `components/google/`, `serpapi`, `searchapi`, `perplexity` | — | No native WordPress/Shopify/HubSpot/GSC/GA4 components found; reached through Composio | external API cost |
| LLM/agent building | `components/{openai,anthropic,models_and_agents,...}` | — | Visual LLM pipelines | — |

- Durable execution / retries: no durable checkpoint/replay engine comparable to LangGraph or Windmill was found (NOT VERIFIED in depth).
- **Recommendation: REJECT** as the orchestrator. It is an LLM-prototyping UI, not durable job orchestration, and its connectors depend on paid Composio. At most, run it internally as a prompt-prototyping tool.
- Scores: coverage 2 · reusability 2 · licence 5 · maintenance 5 · security/tests 3 (historic CVEs) · op cost 3 · complexity 3.

---

### 18. LangGraph
- URL https://github.com/langchain-ai/langgraph · commit `e5e37b5d70db` (2026-11-06) · `libs/langgraph/pyproject.toml` version **1.2.20** (tag `1.2.20`), checkpoint-postgres 3.2.0 · **active**.
- Python library. Deps (`libs/langgraph/pyproject.toml`): `langchain-core`, `langgraph-checkpoint`, `langgraph-sdk`, `langgraph-prebuilt`, `pydantic`, `xxhash`. `libs/checkpoint-postgres` needs **Postgres only** (`psycopg`, `psycopg-pool`). No Redis needed.
- Tests: about 225 test files; 17 workflows (`ci.yml`, `_test_langgraph.yml`, `_integration_test.yml`, `bench.yml`, ...). Advisories NOT VERIFIED.
- **Licence: MIT** for every OSS lib (`LICENSE`, `libs/{langgraph,checkpoint,checkpoint-postgres,checkpoint-sqlite,prebuilt,cli,sdk-py}/LICENSE`). **Proprietary boundary:** the *server* (`langchain/langgraph-api` image, `langgraph-orchestrator-licensed`) is not in this repo. `libs/cli/langgraph_cli/cli.py:297-298` reads: "For local dev, requires env var LANGSMITH_API_KEY ... For production use, requires a license key in env var LANGGRAPH_CLOUD_LICENSE_KEY". `config.py:1895` references `langchain/langgraph-orchestrator-licensed:latest`. **Cron, assistants, threads API and task queue (`libs/sdk-py/langgraph_sdk/_async/cron.py`) are clients for that licensed server.** Do not use `langgraph up/deploy` or the SDK cron client in production without a licence.

| Capability | Path | Symbols | Does | Deps | Independently reusable | Legal |
|---|---|---|---|---|---|---|
| HITL | `libs/langgraph/langgraph/types.py` | `interrupt()` (L906-913), `Command(resume=...)`, `Interrupt` | Raises `GraphInterrupt`; resumes the node with a value; needs a checkpointer | checkpointer | **Yes (library)** | MIT |
| Retries | `types.py` | `RetryPolicy` (initial_interval 0.5, backoff 2.0, max_interval 128, max_attempts 3, jitter, `retry_on`) | Per-node retry | — | Yes | MIT |
| Timeouts/cache | `types.py` | `TimeoutPolicy`, `CachePolicy` | — | — | Yes | MIT |
| Durable state | `libs/checkpoint-postgres/langgraph/checkpoint/postgres/__init__.py` | `PostgresSaver.setup/put/put_writes/get_tuple/list`; `aio.py` async; `shallow.py` | Persists every superstep; resume and time-travel per `thread_id` | Postgres | Yes | MIT |
| Durability modes | `libs/langgraph/langgraph/pregel/main.py` L2673-2715 | `durability: Durability` (default `"async"`) | sync/async/exit checkpoint writes | — | Yes | MIT |
| Long-term store | `libs/checkpoint-postgres/langgraph/store/postgres/` | `PostgresStore` | KV/vector memory | Postgres (+pgvector) | Yes | MIT |
| Functional API | `libs/langgraph/langgraph/func/__init__.py` | `entrypoint`, `task` | Durable function-style workflows | — | Yes | MIT |
| Scheduling | — | — | **None in OSS lib** (cron is a Platform feature) | — | must add our own (e.g. pg-boss/graphile-worker) | — |
| Connectors | — | — | None (use our own tools/MCP) | — | — | — |
| Multi-tenancy | — | — | None; `thread_id` namespacing only | — | — | — |

- **Recommendation: DEPENDENCY (library inside our own Python backend) with `PostgresSaver`. Do not use LangGraph Platform/Server.**
- Scores: coverage 3 (durability + HITL + retries; no cron/connectors/UI) · reusability 5 · licence 5 (lib) · maintenance 5 · security/tests 4 · op cost 5 (Postgres only) · complexity 4.

---

### 23. Windmill
- URL https://github.com/windmill-labs/windmill · commit `5d3f239bf2c1` (2026-11-06) · latest tag `v1.864.1` · **very active** (near-daily releases).
- Rust backend (axum, sqlx), Svelte frontend, polyglot workers (TS/Bun, Python, Go, Bash, SQL...). **Postgres only** for queue and state; no Redis in `docker-compose.yml` (`postgres:18`, `windmill` server/worker images, `windmill-extra`, caddy).
- Tests: about 674 test files (e.g. `backend/tests/{suspend_resume,retry,wac_approval_resume,schedule_fork_conflict}.rs`, `backend/windmill-queue/tests/native_retry_test.rs`); 58 workflows. Advisories NOT VERIFIED.
- **Licence: AGPL-3.0 + Apache-2.0 + proprietary.** Root `LICENSE`: everything is AGPLv3 unless stated otherwise. Clients (`python-client`, `go-client`, ... ) and the OpenAPI/**OpenFlow spec are Apache-2.0**. Code behind the `enterprise` cargo feature (`backend/Cargo.toml` L124) and the `private` feature (`*_ee.rs`, **absent from the public repo**; 80 `*_oss.rs` stubs return "Not implemented on OSS", e.g. `windmill-api-workspaces/src/workspaces_oss.rs`, `saml_oss.rs`, `oidc_oss.rs`, `scim_oss.rs`, `audit_oss.rs`, `teams_approvals_oss.rs`) is proprietary. **Prebuilt CE Docker images contain proprietary code** and are licensed "not to sell, resell, serve as a managed service, modify or wrap under any form without an explicit agreement". **White-label:** "To re-expose directly any Windmill parts to your users ... as a feature of your product ... you must get a commercial license" (except iframed public apps). If you compile the AGPL build yourself, **AGPL §13 applies: you must offer the full corresponding source of any modified version to network users.** Using its API "as is" internally needs no licence.
- EE-only: SAML/OIDC SSO, SCIM, audit logs, git sync, Teams approvals, autoscaling, secret managers (vault/aws_sm/azure_kv), OTel, and more (see the `*_oss.rs` stubs).

| Capability | Path | Symbols | Does |
|---|---|---|---|
| Suspend/approval | `backend/windmill-api/src/approvals.rs`, `slack_approvals.rs` | `handle_resume_action`, `get_approval_form_details`, `extract_w_id_from_resume_url`; `resume_job` table | Flow step suspends until N approvals via resume/cancel URLs; Slack approvals (Teams is EE) |
| Retries | `backend/windmill-queue/tests/native_retry_test.rs`, `backend/tests/retry.rs` | flow-module retry (constant/exponential) | Per-step retry |
| Schedules | `backend/windmill-api-schedule/src/lib.rs`, `windmill-queue/src/schedule.rs`, `windmill-common/src/schedule.rs` | — | Cron schedules |
| Workspaces | `backend/windmill-api-workspaces/` | — | Multi-workspace tenancy (some admin functions stubbed in OSS) |
| Connectors | Windmill Hub (hub.windmill.dev), external | — | WordPress/Shopify/GSC/etc. are hub scripts, not in repo: **NOT VERIFIED** |

- **Recommendation: REJECT** for a commercial white-labelled SaaS. AGPL §13 plus the explicit white-label/managed-service ban needs a commercial licence. Calling an internal instance "as is" for back-office automation is allowed, but it adds no value next to LangGraph plus a Postgres queue.
- Scores: coverage 5 · reusability 2 · licence 1 · maintenance 5 · security/tests 4 · op cost 4 (Postgres only) · complexity 2.

---

### 24. Flowise
- URL https://github.com/FlowiseAI/Flowise · commit `9291856d1ea4` (**2026-08-13**, "Update README.md (#6728)", default branch `main`) · latest tag `flowise@3.1.4` · **slowing** (no commit on main for about 3 months at audit date).
- TypeScript (Express server, React UI, `packages/components`). SQLite/Postgres/MySQL/MariaDB (TypeORM migrations). **Redis** for queue mode (BullMQ: `packages/server/src/queue/{BaseQueue,PredictionQueue,QueueManager}.ts`; `docker/docker-compose.yml` `REDIS_URL`).
- Tests: about 157 test files; 8 workflows. Advisories NOT VERIFIED.
- **Licence: Apache-2.0**, except **`packages/server/src/enterprise/`** and files with explicit notices (e.g. `packages/server/src/IdentityManager.ts`). Those fall under the **FlowiseAI Commercial License** (`packages/server/src/enterprise/LICENSE.md`), which is proprietary: production use needs a subscription, you may not copy or distribute, and FlowiseAI owns your patches. Enterprise covers organizations/workspaces/roles (`enterprise/database/entities/{organization,workspace,role,workspace-user}.entity.ts`), RBAC (`enterprise/rbac`) and SSO (`enterprise/sso/{Google,Azure,Auth0,Github}SSO.ts`). **Multi-tenancy, RBAC and SSO are commercial.**

| Capability | Path | Does |
|---|---|---|
| HITL | `packages/components/nodes/agentflow/HumanInput/HumanInput.ts` (`HumanInput_Agentflow`) | Pause for human feedback in Agentflow v2 |
| Schedules | `packages/server/src/Interface.Schedule.ts`, `database/entities/ScheduleRecord.ts`, migration `1772000000000-AddScheduleEntities.ts` | Scheduled triggers (new) |
| Connectors | `packages/components/nodes/tools/{Gmail,GoogleSheets,GoogleDocs,GoogleDrive,GoogleCalendar,GoogleSearchAPI,BraveSearchAPI,SearchApi,ExaSearch}` | No WordPress/Shopify/HubSpot/Slack/Twilio/GSC/GA4 tool nodes found |

- **Recommendation: REJECT.** Tenancy/RBAC/SSO are commercial, connectors are thin for our needs, and activity is slowing.
- Scores: coverage 2 · reusability 2 · licence 3 · maintenance 2 · security/tests 2 · op cost 3 · complexity 3.

---

## Group summary
- **Best per capability:** durable execution, retries and HITL in a library = **LangGraph** (`interrupt`, `RetryPolicy`, `PostgresSaver`). Connector reference code = **Activepieces pieces** (MIT; WordPress, GSC, Shopify, HubSpot, Slack, Gmail, Twilio). A full workflow platform = Windmill (licence-blocked). Visual LLM prototyping = Langflow (MIT).
- **Overlaps:** Langflow and Flowise largely duplicate each other (visual LLM builders), and both are beaten by LangGraph for durable logic. Activepieces and Windmill duplicate each other as automation platforms, and both are blocked for white-label multi-tenant use (EE / AGPL + commercial).
- **Decision:** use **ONE orchestration layer: LangGraph OSS (MIT) as a library inside our own Python backend**, with `langgraph-checkpoint-postgres` on our existing Postgres. Add our own tenant scoping (`thread_id` = tenant:job), our own approval UI resuming through `Command(resume=...)`, and a Postgres job queue/cron (pg-boss or graphile-worker, audited separately) for schedules, since LangGraph's cron is Platform-only. Copy and adapt Activepieces MIT connector code into our own tool functions, keeping MIT notices.
- **Red flags:** (1) LangGraph Platform/Server, `langgraph up`/`deploy` and the SDK cron/threads API need a LangSmith key or `LANGGRAPH_CLOUD_LICENSE_KEY`: avoid them. (2) Windmill CE images contain proprietary code and prohibit managed-service/white-label use; the AGPL build triggers §13. (3) Activepieces EE-named code sits outside the licensed directories (`worker/.../jobs/ee`, `core/shared/src/lib/ee`): treat it as EE and do not copy it. (4) Flowise and Activepieces multi-tenancy/RBAC/SSO are commercial. (5) Langflow depends on Composio (paid) for SaaS connectors; check its security history. (6) `gh api` was unavailable, so advisories, stars and archived flags are NOT VERIFIED.

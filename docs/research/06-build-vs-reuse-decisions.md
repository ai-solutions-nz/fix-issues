# 06 — Build vs Reuse Decisions

## Weighted evaluation (Phase 5 framework)

**Weights:** coverage 30%, reusability 20%, licence 15%, maintenance 10%, security/tests 10%, operating cost/dependency 10%, implementation complexity 5% (5 means easiest).

**How the inputs were set.** Each input is a 0–5 score from the source audit, justified in `evidence/group*.md`.

**How the total is calculated.** Total = Σ(weight × score) ÷ 5, so the maximum is 100.

**What "coverage" means here.** It measures coverage *for the role Online Reset needs from that project*, not its absolute quality.

**Licence vetoes override the totals.** A project with a high total can still be rejected on licence grounds. Windmill is the example.

| Project | Cov | Reuse | Lic | Maint | Sec | Cost | Cplx | **Total** | Decision |
|---|---|---|---|---|---|---|---|---|---|
| SquirrelScan | 5 | 4 | 5 | 5 | 5 | 5 | 3 | **94** | ADOPT (internal service) |
| PostgreSQL | 4 | 5 | 5 | 5 | 5 | 5 | 4 | **93** | ADOPT (core) |
| WordPress | 4 | 5 | 4 | 5 | 5 | 5 | 4 | **90** | INTEGRATE (REST API) |
| Umami | 4 | 5 | 5 | 4 | 4 | 5 | 4 | **89** | ADOPT (internal service) |
| Promptfoo | 4 | 5 | 5 | 5 | 4 | 4 | 4 | **89** | ADOPT (dependency) |
| Canonry | 5 | 4 | 4 | 5 | 5 | 4 | 2 | **88** | COPY modules (not the base: single-tenant SQLite) |
| Keycloak | 5 | 4 | 5 | 5 | 5 | 2 | 2 | **87** | DEFER (better-auth covers MVP) |
| OpenSEO | 5 | 4 | 5 | 5 | 4 | 2 | 3 | **86** | COPY modules |
| Elmo | 5 | 4 | 5 | 5 | 4 | 2 | 3 | **86** | **FORK (base)** |
| LangGraph (Py; JS port chosen) | 3 | 5 | 5 | 5 | 4 | 5 | 4 | **85** | ADOPT **LangGraph.js** (same licence and API model) |
| Chatwoot | 5 | 4 | 4 | 5 | 4 | 3 | 3 | **85** | DEFER (FOSS build if a hosted inbox is needed) |
| Playwright | 3 | 5 | 5 | 5 | 5 | 3 | 4 | **83** | ADOPT (dependency) |
| Ollama | 3 | 5 | 4 | 5 | 4 | 5 | 5 | **83** | ADOPT (dev/POC only) |
| Lighthouse | 3 | 5 | 5 | 5 | 5 | 3 | 4 | **83** | ADOPT (dependency) |
| Crawl4AI | 4 | 5 | 3 | 5 | 3 | 4 | 4 | **81** | DEFER (Python plus attribution rider; Playwright is enough for MVP) |
| Langfuse | 5 | 3 | 4 | 5 | 4 | 2 | 3 | **79** | DEFER (copy price table now) |
| Limelit Open | 3 | 4 | 5 | 3 | 4 | 4 | 5 | **76** | COPY modules |
| Superset | 4 | 3 | 5 | 5 | 4 | 2 | 2 | **75** | REJECT (MVP); native reports instead |
| Unlighthouse | 3 | 4 | 5 | 4 | 3 | 3 | 4 | **73** | OPTIONAL dependency (Phase 4) |
| Twenty CRM | 4 | 3 | 3 | 5 | 4 | 3 | 2 | **71** | OPTIONAL (API-only, D5) |
| SerpBear | 3 | 4 | 5 | 4 | 2 | 3 | 4 | **71** | COPY adapters (fallback) |
| Activepieces | 4 | 3 | 3 | 5 | 4 | 3 | 2 | **71** | COPY MIT connector logic only; REJECT platform |
| Listmonk | 3 | 4 | 3 | 4 | 2 | 5 | 5 | **70** | REJECT (MVP) |
| Windmill | 5 | 2 | 1 | 5 | 4 | 4 | 2 | **69** | **REJECT (licence veto)** |
| BERTopic | 3 | 4 | 5 | 3 | 3 | 2 | 3 | **68** | REJECT (runtime); optional offline |
| SEOMachine | 3 | 4 | 5 | 3 | 2 | 2 | 4 | **67** | COPY modules (port to TS) |
| GeoLook | 3 | 3 | 5 | 1 | 2 | 5 | 4 | **65** | COPY concepts (tickets/verify, llms.txt/JSON-LD) |
| Matomo | 4 | 2 | 2 | 5 | 4 | 3 | 2 | **64** | REJECT |
| Mautic | 5 | 1 | 2 | 5 | 4 | 2 | 1 | **63** | REJECT |
| EspoCRM | 4 | 2 | 1 | 5 | 3 | 4 | 3 | **62** | **REJECT (white-label veto)** |
| Langflow | 2 | 2 | 5 | 5 | 3 | 3 | 3 | **60** | REJECT |
| Strapi | 2 | 3 | 2 | 5 | 4 | 3 | 3 | **57** | REJECT |
| Easy!Appointments | 3 | 2 | 2 | 3 | 1 | 4 | 3 | **51** | REJECT |
| OneGlanse | 3 | 2 | 4 | 2 | 1 | 1 | 1 | **47** | **REJECT (ToS-risk collection)** |
| Flowise | 2 | 2 | 3 | 2 | 2 | 3 | 3 | **46** | REJECT |
| Appsmith | 1 | 1 | 4 | 5 | 4 | 2 | 1 | **45** | REJECT |

**What is uncertain in these scores.** The security scores do not include GitHub Security Advisories, because the API was blocked (see D7). The maintenance scores come from git cadence only.

## Per-capability selection (preferred and alternative)

| Capability | Preferred | Why | Alternative | Can one replace the other? |
|---|---|---|---|---|
| Platform skeleton (multi-tenant, Postgres, white-label, evidence) | **Elmo** | It is the only candidate with all of these: orgs/RBAC, Postgres only, append-only raw evidence, a white-label mode, and an MIT licence. | OpenSEO (also TanStack/better-auth/MIT, but Cloudflare-centric and DataForSEO-only) | **Yes.** Elmo replaces Canonry, Limelit, OneGlanse and GeoLook as the base. |
| Grounded model-API collection with geo | **Canonry provider code, ported into Elmo** | It is the only one that sends `user_location` natively. | Elmo providers (no geo) | They are merged. |
| Consumer-surface collection | **Elmo vendor adapters** (DataForSEO / Cloro / SearchAPI) | Licensed vendors take the scraping risk. | GeoLook-style manual capture extension | They are complementary. |
| Mention / rank extraction | **Limelit matcher (ported)** | Deterministic, auditable, free, and tested (passed when run locally). | Elmo Jev judge (paid) | Limelit replaces the *mandatory* Jev requirement; the LLM judge stays optional. |
| SoV / metrics | **Canonry `share-of-voice-frame`** + Limelit denominators | It refuses to publish thin data. | Elmo `computeShareOfVoice` | Yes. |
| Prompt clustering | **Canonry `clusterByCosine`** + pgvector | Light; runs on the existing Postgres. | BERTopic | Yes; BERTopic is not needed. |
| Keyword, SERP and backlink data | **OpenSEO DataForSEO client** | Broadest typed client, with NZ location codes. | SerpBear adapters (SERP); Canonry Common Crawl (backlinks) | Partially. |
| Technical audit | **SquirrelScan** | 319 rules, including agent-readiness checks; MIT; heavily tested. | Elmo site-audit + Lighthouse | SquirrelScan replaces OpenSEO's and GeoLook's audits. |
| Orchestration | **pg-boss + LangGraph.js** | One stack; the approval primitive is in the library; no extra service. | Plain pg-boss state machines | Yes. LangGraph.js replaces Windmill, Activepieces, Flowise and Langflow. |
| Auth | **better-auth (in Elmo)** | Already integrated. | Keycloak | Yes for the MVP. |
| CMS publishing | **Canonry WP client** + Activepieces Shopify logic | TypeScript and MIT. | SEOMachine Python publisher | Yes. |
| Content QA | **Promptfoo** + SEOMachine scorers (ported) | Library API. | Langfuse evals | Yes. |
| Analytics / attribution | **Umami** | MIT, Postgres, first- and last-click attribution. | Matomo | Yes. |
| CRM | **Client's own CRM** via connectors | Avoids hosting a CRM. | Twenty (API-only) | Optional. |
| Inbox / SMS | **Custom Twilio adapter** (small) | Chatwoot's missed-call code is Enterprise. | Chatwoot FOSS | Deferred. |
| Booking | **Integrate** Calendly / Google Calendar / ServiceM8 | No suitable OSS: Easy!Appointments is single-tenant. | — | — |
| Reports / dashboards | **Elmo reports + native charts + Playwright PDF** | One UI. | Superset embedded | Yes. |
| LLM cost tracking | **Elmo `usage_events` + Langfuse price JSON** | No ClickHouse. | Langfuse service | Yes for the MVP. |

## Projects whose code is used, and exactly what is taken

| Project | Components taken |
|---|---|
| **Elmo** (fork) | Everything except `apps/www`, the brand assets and the PostHog telemetry. |
| **Canonry** | `provider-{openai,claude,gemini,perplexity}` normalize code, `contracts/{answer-evidence,brand-matching,competitor-matching,embeddings}.ts`, `api-routes/discovery/orchestrate.ts`, `intelligence/*`, `integration-wordpress`, `integration-commoncrawl`. **Excluded:** `integration-typesafe` and `provider-cdp`. |
| **Limelit Open** | `internal/mentions/*`, `internal/metrics` methodology, `internal/promptpack`, the DataForSEO country map. The `NOTICE` file is kept. |
| **OpenSEO** | `src/server/lib/dataforseo/*`, `gscClient.ts`, `ga4Client.ts`, the rank-tracking services, and the tenant-isolation test pattern. |
| **SerpBear** | `scrapers/services/*`, except `proxy.ts`. |
| **SquirrelScan** | The CLI/engine, run as a service. Rules may be copied later. |
| **Lighthouse** | npm dependency. |
| **SEOMachine** | Content scorers and scrubber, GSC/GA4 opportunity heuristics, `OpportunityScorer`, and the Yoast/RankMath meta approach. All ported to TS. |
| **GeoLook** | Concepts only: change tickets with auto-verify, and the `llms.txt`, JSON-LD and FAQ generators. |
| **Activepieces** | MIT pieces: wordpress, shopify, hubspot, google-search-console, gmail, twilio. Action logic only. |
| **Chatwoot** | The first-response-time algorithm (MIT), ported. |
| **Langfuse** | `default-model-prices.json` (MIT). |
| **Promptfoo** | npm dependency. |
| **Umami** | Internal service. |
| **PostgreSQL, pgvector, pg-boss, better-auth, LangGraph.js, Playwright, Ollama** | Dependencies, or a dev-only service in Ollama's case. |

## Rejected (with reason)

| Project | Reason |
|---|---|
| OneGlanse | Consumer-UI automation with an anti-detect browser and residential proxies (ToS breach risk); Postgres + ClickHouse + Redis; 2 tests; slowing. |
| GeoLook (as base) | Single-user JSON files; stalled; China focus. Its ideas are kept. |
| Windmill | AGPL §13, plus a proprietary EE. White-label or managed-service re-exposure needs a commercial licence. |
| Activepieces (platform) | Multi-project, RBAC, SSO and embedding are EE. |
| Flowise | Tenancy, RBAC and SSO are commercial; activity is slowing. |
| Langflow | A prototyping UI, not durable orchestration; connectors go through paid Composio. |
| LangGraph Server/Platform | Licence key required. |
| Appsmith | Branding, SSO and multi-org are EE and absent; it is an internal-tools builder. |
| Superset | Heavy (Celery and Redis). Native reports are enough. Revisit if clients need ad-hoc BI. |
| Strapi | Not needed when we publish *to* client CMSs; its useful features are Enterprise. |
| BERTopic | torch-heavy; the lighter clustering pipeline is enough. |
| EspoCRM | AGPL §7(b) requires the "EspoCRM" word to be displayed, so no white-label; single-tenant. |
| Matomo, Mautic, Easy!Appointments | GPL, single-tenant, heavy (Easy!Appointments also has thin tests and unsigned webhooks). |
| Listmonk (MVP) | AGPL; not needed yet. |
| Keycloak (MVP) | Needs about 1.25 GB RAM, and better-auth already covers the MVP. Revisit for enterprise SAML. |
| Crawl4AI (MVP) | Adds a Python runtime and has an attribution rider and an SSRF/RCE history. Playwright plus our own extraction is enough at first. |

## Custom development still required (not covered by any audited code)

1. **Tenant model and isolation.** Agency → client hierarchy, real RLS policies, per-tenant branding and custom domains.
2. **NZ geo layer.** Location schema, NZ city catalogue and `location_applied` evidence.
3. **Methodology layer.** Collection-method separation, frozen prompt-set versions, methodology versioning.
4. **Online Reset scoring.** GEO, SEO and commercial opportunity scores (see 09).
5. **Content graph.** LangGraph.js research → draft → QA → approval → publish, with a per-site checklist.
6. **Approval UI and audit log.**
7. **Publication snapshots and rollback.**
8. **Proposal engine** with view tracking and a Day 3/7/14 follow-up sequence (Adaptify parity).
9. **Legitimate outreach** with consent records and client-mailbox sending.
10. **CMS adapters** beyond WordPress and Shopify (Webflow, Wix and others) for parity.
11. **Conversion engine.** Enquiry endpoint, missed-call detection, SMS follow-up with consent, first-response-time computation, CRM/booking connectors (ServiceM8, Tradify, Fergus, Calendly), outcome reports carrying attribution classes.
12. **Reports.** PDF templates and evidence-linked AI summaries.

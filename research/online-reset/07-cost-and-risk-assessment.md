# 07 — Cost and Risk Assessment

> **No provider prices are stated in this document.** The research session could not reach provider pricing pages reliably, and the brief prohibits inventing prices. Costs are therefore given as **volumes multiplied by unit prices that you supply**. Owner action D2: collect current NZD quotes for the line items in §3 before approving Phase 2 spend.

## 1. Cost categories

| Category | MVP choice | Licence fee | Recurring cost driver |
|---|---|---|---|
| Open-source licences | All adopted components are MIT, Apache-2.0 or PostgreSQL-licensed | **NZ$0** | None, as long as **no EE/commercial directory is enabled** (see 02). |
| Local development | Existing machine + Docker + Claude Code (already held) | NZ$0 | Developer time. |
| Hosting | 1 VM + managed Postgres + object storage (pilot) | — | VM size and storage (§4). |
| AI model inference (monitoring) | OpenAI, Anthropic, Gemini, Perplexity APIs with web search | — | Calls × (tokens + per-search fees, where a provider charges them). |
| AI model inference (processing) | Drafting, QA rubric, summaries, embeddings, optional judge | — | Tokens. Ollama is NZ$0 locally but is not production quality for client content. |
| Search / keyword / backlink data | DataForSEO (via the OpenSEO client); SerpBear-compatible SERP APIs as a fallback; Common Crawl (free) | — | Requests. |
| Consumer AI surface data (optional, D3) | DataForSEO LLM scraper / Cloro / SearchAPI | — | Requests. |
| Messaging / telephony | Twilio or the client's VoIP; transactional email provider | — | SMS segments, numbers, voice minutes, emails. |
| Security and maintenance | Dependency updates, Elmo rebase, pen test, backups | — | Staff time, plus optional external pen test. |

## 2. Volume model (assumptions are explicit; change them to re-price)

| Variable | Symbol | Pilot baseline | Basis |
|---|---|---|---|
| Tracked AI prompts per client | P | 50 | Assumption. Adaptify's per-plan prompt count was not established. |
| Model-API engines | E | 4 (ChatGPT, Claude, Gemini, Perplexity) | Adaptify's claimed engines, minus Copilot. |
| Vendor-surface engines (optional) | V | 3 (Google AI Overviews, AI Mode, Copilot) | Only if D3 is approved. |
| Locations per prompt | L | 1 (primary NZ city) | A 3-city variant is shown below. |
| Replications per test | R | 1 | Use R = 2–3 when a variance estimate is needed (Elmo `run-policy` supports this). |
| Test cycles per month | c | 2.17 (every 14 days; Adaptify's claimed cadence) | Weekly = 4.35. |
| Tracked keywords | K | 100 | Assumption. |
| SERP checks per keyword per month | s | 4.35 (weekly) | Assumption. |
| Articles per month | A | 4 | Assumption. |
| LLM calls per article | a | 6 (research summary 1, draft 1, QA rubric 2, rewrite ≤ 2) | Graph design in 05 §4.2. |
| Backlink requests per month | B | 8 (summary + referring domains for client + 3 competitors) | Assumption. |
| Audits per month | — | 1 full site audit | SquirrelScan and Lighthouse run locally: compute only. |

**Formulas (per client per month)**

- Model-API monitoring calls = P × E × L × R × c
- Vendor-surface requests = P × V × L × R × c
- Extraction: deterministic, **0 paid calls**. The optional LLM judge adds 1 call per run.
- SERP requests = K × L × s
- Content LLM calls = A × a
- Report-summary LLM calls ≈ 2

### Volumes at baseline (14-day cadence, 1 location, R = 1)

| Line item | Per client | 1 client | 10 clients | 50 clients |
|---|---|---|---|---|
| Model-API monitoring calls (grounded) | 50×4×1×1×2.17 = **434** | 434 | 4,340 | 21,700 |
| Vendor-surface requests (if D3 approved) | 50×3×2.17 = **326** | 326 | 3,260 | 16,300 |
| SERP requests (weekly rank tracking) | 100×1×4.35 = **435** | 435 | 4,350 | 21,750 |
| Keyword research requests | about 5 (bulk endpoints) | 5 | 50 | 250 |
| Backlink requests | 8 | 8 | 80 | 400 |
| Content LLM calls | 4×6 = **24** | 24 | 240 | 1,200 |
| Embedding calls (prompt clustering, initial setup) | about 200 short texts at setup, then about 20/month | 20 | 200 | 1,000 |
| Optional LLM judge calls | 434 | 434 | 4,340 | 21,700 |

### Sensitivity

| Change | Effect on monitoring calls |
|---|---|
| Weekly instead of every 14 days | ×2.0 (868 per client) |
| 3 NZ cities instead of 1 | ×3 (1,302 per client) |
| R = 3 for variance | ×3 |
| All three together | ×18 (7,812 per client; 390,600 at 50 clients) |

Methodology choices drive cost far more than client count does. That is why cadence, cities and replication should be **plan-tier settings**. Elmo's `run-policy` already meters them per plan.

### Monthly cost formula (fill in unit prices)

```
C_month = Σ_engines (calls_e × (tokens_in_e × p_in_e + tokens_out_e × p_out_e + searches_e × p_search_e))
        + vendor_requests × p_vendor
        + serp_requests × p_serp + keyword_requests × p_kw + backlink_requests × p_bl
        + content_calls × avg_tokens × p_llm + embeddings × p_embed
        + hosting + messaging + email
```

Every run's actual cost is recorded in `prompt_runs.cost_micros` and `usage_events` (Elmo `usage/cost.ts` plus the Langfuse price table). The model above is therefore checked against measured spend from the first paid test onward.

## 3. Quotes to obtain (owner action D2)

| # | Item | Unit to quote |
|---|---|---|
| 1 | OpenAI Responses API with web search | per 1M tokens in/out + per search call |
| 2 | Anthropic Messages API with web search tool | per 1M tokens + per search |
| 3 | Gemini API with Google Search grounding | per 1M tokens + per grounded prompt; current free-tier limits |
| 4 | Perplexity API | per request / per token |
| 5 | DataForSEO: SERP (Google organic, AI Overview, AI Mode), Labs keywords, Backlinks, LLM responses, LLM scraper | per task, by priority (standard/live); minimum deposit; trial credit |
| 6 | One fallback SERP API (e.g. SerpApi, Serper, ValueSERP) | per 1,000 searches; NZ city support |
| 7 | Consumer-surface vendor (Cloro / SearchAPI) if D3 is approved | per request; ToS and data-provenance statement |
| 8 | Twilio NZ: number rental, SMS segment, voice status callbacks | per month / per segment |
| 9 | Transactional email provider | per 1,000 emails |
| 10 | Hosting: VM (4 vCPU / 16 GB), managed Postgres with PITR, object storage, **NZ or AU region** | per month |

## 4. Hosting sizing (resources, not prices)

| Scale | Web/API | Workers | Audit/browser | Postgres | Other |
|---|---|---|---|---|---|
| POC (local) | laptop | laptop | laptop | Docker | Ollama, local Umami, local WordPress for publish tests |
| 1 pilot client | 1 VM, 2–4 vCPU / 8–16 GB, running all containers | same VM | same VM (Chromium is the main CPU/RAM consumer) | managed, smallest tier with PITR | object storage < 10 GB |
| 10 clients | same VM, or 2 VMs | — | separate small VM | managed, small tier | — |
| 50 clients | 2 VMs behind a load balancer | 2+ worker VMs | 2+ audit VMs, scaled per audit queue | managed, medium tier + read replica | — |

Data residency: client personal data (enquiries, call records) falls under the **NZ Privacy Act 2020**. IPP 12 restricts disclosure overseas. Prefer NZ or AU hosting regions, and list sub-processors (AI providers and others) in the client agreement.

## 5. NZ$0 local proof-of-concept plan

**What NZ$0 can prove.** Everything except real AI-engine answers.

| # | POC test | Components | Pass criterion |
|---|---|---|---|
| 1 | Fork boots locally | Elmo fork, Postgres + pgvector | Web and worker start. Elmo's own unit tests pass, after its dependency install scripts have been reviewed. |
| 2 | Tenant isolation | RLS policies + 2 tenants with seeded data | An automated test shows a cross-tenant read or write fails, for every API route. |
| 3 | Prompt generation + clustering | Elmo `suggestPrompts` via **Ollama** (OpenAI-compatible) + Canonry `clusterByCosine` + Ollama embeddings | 200 candidates become clusters, with near-duplicates merged (threshold reported). |
| 4 | Extraction + metrics | Limelit matcher (port) + Canonry SoV frame | The ported Go tests (26 already passing at source) pass in TS, and golden fixtures run in Promptfoo CI. |
| 5 | Technical audit | SquirrelScan + Lighthouse against a **local** test site and one owner-approved public site | Findings are ingested and scored. |
| 6 | Content graph | LangGraph.js with Ollama; approval interrupt and resume | The draft pauses at approval, resumes after an approve click, and the rewrite loop is bounded. |
| 7 | Publish + rollback | Local WordPress in Docker (GPL; running it locally is fine) | Draft → publish → snapshot → rollback restores the prior content exactly. |
| 8 | Attribution | Local Umami + test page with UTM links | First- and last-click attribution report shows the test visits. |
| 9 | Missed call → SMS (simulated) | Twilio-format webhook payloads replayed locally (**no Twilio account**) | The event is recorded and the SMS job is queued but **not sent**. |

**What NZ$0 cannot prove.** Visibility in real ChatGPT, Claude, Gemini, Perplexity, Copilot or Google AI answers. A local model's answers are not those engines' answers. Hand-pasted answers prove the extraction pipeline, **not automated collection**.

### Cheapest technically valid automated test (requires owner approval D2)

1. **Free first.** Check whether the Gemini API's current free tier includes Google Search grounding, and whether DataForSEO offers trial credit. If either does, run test 2 on that engine at NZ$0. The terms are **not verified here**.
2. **Smallest paid test.** 10 prompts × 4 model-API engines × 1 NZ city (Auckland) × 3 replications = **120 grounded calls**, run once.
   - Hard spend limits set in each provider console beforehand.
   - Expected output: per-engine visibility, citation domains, run-to-run variance, and **measured cost per call**, which then replaces the assumptions in §2.
3. **Optional add-on (D3).** The same 10 prompts through one consumer-surface vendor for Google AI Overviews, once (10–30 requests).

## 6. Risk register

### Licensing

| Risk | Likelihood | Impact | Control |
|---|---|---|---|
| Copying code from an EE/commercial directory by accident | Medium | High | A CI path deny-list (Langfuse `ee/`, Chatwoot `enterprise/`, Activepieces `ee`, Canonry `integration-typesafe`, Strapi EE packages, Twenty `@license Enterprise`), plus Elmo's licence checker. |
| AGPL/GPL code entering the codebase | Low | High | Licence scan in CI. AGPL services are reached over HTTP only. |
| Missing attribution notices | Medium | Low/Medium | A `THIRD_PARTY_NOTICES.md` generated in CI, an "About/Credits" page, Limelit `NOTICE`. |
| Trademark use | Low | Medium | Rebrand all forks (Elmo, SquirrelScan and others). |
| Model-weight licences (Ollama) | Low | Medium | Use local models in dev only, or check each licence. |

### Platform terms and data provenance

| Risk | Control |
|---|---|
| Breaching AI platform terms by scraping consumer UIs | **Not done in-house.** Model APIs are the default. Consumer surfaces only through a vendor that has passed due diligence (D3). The method is labelled on every metric. |
| Google ToS (direct scraping) | SerpBear `proxy.ts` is excluded. Licensed SERP APIs only. |
| API answers differ from consumer apps | Report methods separately. Never claim API results equal what users see. |

### Security

| Risk | Control |
|---|---|
| Cross-tenant data leak | DB-enforced RLS (05 §6) **plus** app filtering; isolation tests in CI; external pen test before the first paying client. |
| Stolen CMS/CRM/GSC credentials | Encrypted secrets store (Elmo); least-privilege WP Application Passwords; per-client revocation; audit log. |
| SSRF from crawling or auditing client-supplied URLs | URL allow-list per client domain; block private IP ranges; audit containers without internal network access. |
| Prompt injection from crawled pages into agent graphs | Agents get no direct publishing tool; every publish passes a human approval; crawled content is treated as data and passed to graphs in a separate field, never mixed into instructions. |
| Unapproved publishing or messaging | Approval gate is enforced server-side; `publications` and `outreach_messages` require an `approval_id`. |
| Third-party telemetry leaking data | PostHog removed (Elmo); Canonry/Promptfoo/Lighthouse telemetry off; Ollama cloud routes off. |
| Supply chain (npm/pip) | Lockfiles, dependency advisory checks (SquirrelScan's CI is a model), no Crawl4AI in the MVP. |
| Unverified upstream advisories | D7: check GitHub Security Advisories for every adopted repository before the build. |

### Compliance (NZ)

| Area | Requirement |
|---|---|
| Privacy Act 2020 | Purpose limitation, IPP 12 for overseas disclosure, breach notification. |
| Unsolicited Electronic Messages Act 2007 | Consent, accurate sender identification and a working unsubscribe for SMS, email and outreach. Outreach only to addresses where a consent basis exists, and with human approval. |
| Fair Trading Act 1986 | Client-facing performance claims must be evidence-based. The attribution classes support this. |

### Maintenance obligations

| Item | Effort |
|---|---|
| Rebase the Elmo fork | Monthly (upstream changes daily). |
| SquirrelScan, which is pre-1.0 | Pin the version and run JSON contract tests. |
| Provider API changes | Contract tests per adapter. Elmo runs provider smoke tests in CI four times a day; adopt the same approach with spend caps. |
| Dependency updates and backups | Monthly patching and quarterly restore tests. |
| Telemetry and licence CI checks | Kept running. |

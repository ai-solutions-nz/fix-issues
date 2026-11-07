# 04 — Feature Coverage Matrix

## How to read the matrix

**Coverage** shows how much of a feature existing audited code already provides:
- **Full**: working code exists and needs only integration.
- **Partial**: some code exists; a stated amount of new work is needed.
- **Gap**: new code is needed.
- **Provider**: needs a paid external data source; the code only calls it.

**Adaptify** gives the status of the equivalent Adaptify feature, using the classes from 01:
- **V**: verified in Adaptify's docs.
- **P**: partially documented.
- **C**: vendor-claimed.
- **N**: not established.

**Code references** point to the inventory in 03. Repository versions are pinned in 02.

---

## SYSTEM 1: Discoverability Engine

| Feature | Candidates found in code | Selected | Alternative | Coverage | Remaining work | Adaptify |
|---|---|---|---|---|---|---|
| Business and customer discovery | Elmo `onboarding/analyze.ts`; Elmo `site-audit`; Canonry discovery | Elmo onboarding (site excerpt → brand, competitors, prompts) | Canonry `discovery/orchestrate.ts` | Partial | Add NZ business-profile fields: service areas, services, hours, booking channels. | P |
| Industry and location research | Canonry `LocationContext`; OpenSEO DataForSEO Labs + `serp-locations.ts`; Limelit country map | DataForSEO via the OpenSEO client + Canonry location model | SerpBear city-string adapters | Partial + Provider | NZ city/region catalogue (DataForSEO location IDs for Auckland, Wellington, Christchurch, Hamilton, Tauranga, Dunedin and others). | P |
| Buyer intent and question generation | Elmo `suggestPrompts` (LLM + web search); Limelit `promptpack`; GeoLook `expand.py`; SEOMachine prompt template | Elmo `suggestPrompts` + Limelit templates (zero-cost seed) | GeoLook autocomplete (after a ToS check) | Full | Add NZ intent taxonomy prompts (emergency, price, near-me, comparison, trust). | V |
| Prompt clustering and dedup | Canonry `clusterByCosine`, `computeDedupSimilarityStats`; Elmo `dedupeKey`; BERTopic; SEOMachine TF-IDF/KMeans | Canonry embeddings clustering + pgvector | BERTopic offline (`--no-deps`) | Full (port) | Port the code to Elmo; store vectors in pgvector. | V |
| Prompt quality and relevance validation | Canonry `query-categorize.ts`, `query-shape.ts`; Promptfoo assertions | Canonry classifiers + Promptfoo `llm-rubric` | — | Partial | Relevance rubric (service match, location match, intent class); human approval of the prompt set. | N |
| Google Search monitoring (organic, local pack) | OpenSEO `serp.ts`, `RankCheckWorkflow`; SerpBear adapters | OpenSEO DataForSEO SERP | SerpBear SerpApi / Serper / ValueSERP | Provider | Re-host on pg-boss; map NZ city codes. | P |
| ChatGPT (model API) | Elmo `runOpenAI`; Canonry provider-openai (with `user_location`); Limelit | Elmo provider + Canonry geo | Limelit (Go, reference) | Full | Merge the Canonry `user_location` into Elmo. | P (feature page says "native APIs") |
| Claude (API) | Elmo `runAnthropic`; Canonry provider-claude | Same as ChatGPT | — | Full | — | P |
| Gemini (API) | Canonry provider-gemini (googleSearch, location in prompt text) | Canonry port | Elmo via OpenRouter | Partial | Location goes in the prompt text only. Label it "location by prompt" in the evidence. | P |
| Perplexity (API) | Canonry provider-perplexity; Elmo via DataForSEO `perplexityLlmResponsesLive` | Canonry port | Elmo DataForSEO | Full | — | P |
| Copilot | Elmo Cloro / Olostep / SearchAPI (`bing_copilot`); Limelit SearchAPI | Elmo SearchAPI or Cloro adapter | — | Provider | Vendor due diligence (D3). No official public Copilot answer API was found. | P |
| Google AI Overviews / AI Mode | Elmo DataForSEO (`load_async_ai_overview`, `googleAiModeLiveAdvanced`), Cloro, SearchAPI; Limelit DataForSEO | Elmo DataForSEO adapter with NZ location | SearchAPI | Provider | Thread the NZ location code through (currently hard-coded to 2840). | **N** |
| Consumer ChatGPT / Gemini apps (as opposed to the API) | Elmo DataForSEO `llm_scraper`, Cloro, BrightData; OpenSEO `ai-tracking.ts` | Optional, behind owner decision D3 | GeoLook-style **manual capture extension** (human-submitted) | Provider | Record the method `consumer_surface_via_vendor` and never merge it with API metrics. | N |
| Scheduled, repeatable monitoring | Elmo pg-boss + `run-policy` (cadence, replication, backoff); Canonry node-cron | Elmo | — | Full | Add a methodology version and frozen prompt-set versions per test cycle. | P (14-day retest claimed) |
| NZ city-specific results | Canonry `user_location` (OpenAI, Claude, Perplexity); DataForSEO location IDs; Limelit NZ=2554 | Canonry pattern + DataForSEO IDs | SerpBear `Auckland,New Zealand` strings | Partial | Schema fields `country/region/city/language` on prompt targets; record per run whether the location was applied natively, via the prompt, or not at all. | **N** |
| Competitor share of voice | Canonry `buildShareOfVoiceFrame` (floors); Elmo `computeShareOfVoice`; OpenSEO `shareOfVoice.ts`; Limelit metrics | Canonry frame + Limelit denominators | Elmo | Full (port) | — | C |
| Brand mentions, positions, citations, sources | Limelit `Matcher.Find` + `listRanks`; Canonry brand-matching; Elmo text-extraction + citations + Jev judge | Elmo parsers + Limelit deterministic matcher (default) + optional LLM judge | Elmo Jev (paid) | Full (port) | Generic-LLM transport for the judge; judge disagreement report. | P |
| Sentiment | Elmo Jev (paid); Canonry (Jev or OpenRouter, optional); GeoLook regex cues | Optional LLM judge (generic transport) | — | Partial | Off by default; label it "model-inferred". | P |
| Website and technical SEO audit | SquirrelScan (319 rules); Lighthouse (172 audits, including `agentic/`); Elmo `site-audit`; OpenSEO `lib/audit`; GeoLook `audit.py` | SquirrelScan service + Lighthouse | Unlighthouse (site-wide performance) | Full | Ingest the SquirrelScan JSON into our findings table; combine into SEO, GEO and combined scores. | P |
| Keyword intelligence | OpenSEO DataForSEO Labs / Google Ads; SerpBear `adwords.ts`; SEOMachine | OpenSEO client | SerpBear Google Ads API (needs a developer token) | Provider | — | V |
| Backlink intelligence | OpenSEO DataForSEO backlinks; Canonry Common Crawl (DuckDB) | Canonry Common Crawl (free) + DataForSEO (paid, optional) | — | Partial + Provider | Gap analysis versus competitors (logic is new). | P |
| GEO opportunity scoring | Elmo `opportunities*.ts`; Canonry `gap-query-score.ts`, `content-targets.ts`; SEOMachine `OpportunityScorer` | Canonry gap score + Elmo opportunities | SEOMachine heuristic | Partial | **Online Reset scoring formula** (see 09), including commercial value. | V |
| Content recommendations and planning | Canonry `content-targets.ts`; Elmo opportunities; SEOMachine commands | Canonry + custom planner | — | Partial | Content calendar and cadence (Adaptify parity). | V |
| Automated research, drafting, QA | SEOMachine scorers and scrubber; Promptfoo; GeoLook `generate.py` / `lint_draft`; LangGraph.js | LangGraph.js graph: research → draft → QA → rewrite loop | — | Partial | Graph definition, prompts, a per-site checklist (20+ checks for parity), source citations. | V |
| Content approval and controlled publishing | LangGraph.js `interrupt()`; Activepieces approval (MIT, reference) | LangGraph.js interrupt + our own approval UI | Plain pg-boss state machine | Partial | Approval UI, roles (agency approver, client approver), audit trail. | V |
| WordPress | Canonry `wordpress-client.ts`; SEOMachine `WordPressPublisher`; Activepieces WordPress piece; WP REST | Canonry client | SEOMachine logic (Yoast/RankMath meta) | Full | Application Password onboarding; pre-publish snapshot. | V |
| Shopify | Activepieces Shopify piece | Activepieces piece logic (MIT) | — | Partial | Blog article and page API adapter. | V |
| Webflow, Wix, Squarespace, Ghost, HubSpot CMS | Not found in the audited code, apart from the HubSpot CRM piece | — | — | Gap | Adapters for parity, after WP and Shopify (Phase 4). | V |
| Backlink outreach (legitimate) | No outreach code found apart from Activepieces Gmail and generic email | Custom | — | Gap | Prospect list → personalised draft → **human approval** → send from the client's own mailbox (Gmail/M365 API) → reply tracking. No bulk unsolicited sending. Must comply with the NZ Unsolicited Electronic Messages Act 2007 (consent, sender ID, unsubscribe). | P |
| Retesting and change measurement | Elmo append-only runs + reprocess; Canonry `regressions.ts`; GeoLook `verify.py` | Elmo + Canonry + GeoLook verify concept | — | Partial | Before/after comparison per change ticket, using the same frozen prompt set and method. | P |

**Evidence rule (applies to the whole system):** each `prompt_run` stores:
- `collection_method`: `model_api_grounded`, `model_api_ungrounded`, `consumer_surface_via_vendor`, `serp_via_vendor` or `manual_capture`.
- `provider`, `model` + `model_version`, the timestamp, `query_text`, `location_requested` and `location_applied` (`native`, `prompt_text` or `none`), `raw_output` (immutable), and `extractor_version`.

Metrics are **only aggregated within one collection method**. Dashboards show each method separately.

---

## SYSTEM 2: Client Delivery Engine

| Feature | Candidates | Selected | Coverage | Remaining work | Adaptify |
|---|---|---|---|---|---|
| Client onboarding | Elmo onboarding; Elmo `site-audit` | Elmo | Partial | Wizard steps: profile, objectives, competitors, service areas, integrations (GSC, CMS, CRM, analytics). | P |
| Business profile and objectives | Elmo `brands` table | Elmo + new columns | Gap (schema) | `business_profile`, `objectives`, `kpi_targets`. | P |
| Competitor and service-area setup | Elmo `competitors`; Canonry `LocationContext` | Elmo + Canonry | Partial | `service_areas` table (NZ regions and cities). | P |
| Multi-client management | better-auth orgs (Elmo); `brands.organization_id` | Elmo | Full | Hierarchy: agency org → client workspaces → brands. | V |
| Agent orchestration | LangGraph.js; Python LangGraph; Activepieces; Windmill; Flowise; Langflow | **LangGraph.js** (library) | Partial | Graphs for content, audit-to-tickets, proposal and outreach. | N |
| Recurring schedules | pg-boss `schedule()` (Elmo); Canonry node-cron | pg-boss | Full | — | P |
| Retries and error recovery | pg-boss retry and DLQ; LangGraph `RetryPolicy`; Elmo `run-backoff.ts` | pg-boss + LangGraph | Full | Alerting on the dead-letter queue. | N |
| Human approval gates | LangGraph `interrupt()`; Activepieces / Windmill approvals (rejected) | LangGraph.js + an `approvals` table | Partial | UI, notification and expiry. | V |
| Task prioritisation | Canonry `insights.ts`; GeoLook ticket risk grades | Custom priority score (see 09) | Gap | — | N |
| Website change management | GeoLook `tasks.py` / `verify.py` (concept) | Port the concept | Gap | `change_tickets` with acceptance criteria → verify by re-crawl. | N |
| Publication history and rollback | WP revisions API; our own snapshot | Custom | Gap | `publications` table holding a pre-publish snapshot; rollback = restore the snapshot via `update_item`. | N |
| Evidence retention | Elmo `prompt_runs.raw_output` (append-only trigger) | Elmo | Full | Retention policy; S3-compatible storage for screenshots. | N |
| Agent execution logs | LangGraph checkpoints; Langfuse traces | LangGraph `PostgresSaver` + `agent_events` table | Partial | Langfuse is optional later. | N |
| Cost tracking | Elmo `usage/cost.ts` + `usage_events`; Langfuse price JSON | Elmo + Langfuse JSON | Full (port) | Per-client cost dashboard and budget caps. | N |
| Branded client dashboards | Elmo web + white-label env | Elmo, extended | Partial | **Per-tenant** branding (Elmo's is per-instance), custom domains. | V |
| Automated reports and summaries | Elmo `generate-report.ts`; Playwright PDF | Elmo + Playwright | Partial | PDF template and LLM summary with claims tied to the evidence. | V |
| Prospect proposals and follow-ups | None in the audited code | Custom (reuses the audit, prompt-test and keyword modules) | Gap | Proposal generator, view tracking, Day 3/7/14 sequence with opt-out. | **V** (parity required) |
| Client-specific permissions | better-auth RBAC (`permissions.ts`) | Elmo | Partial | Roles: agency_admin, agency_staff, client_owner, client_viewer, client_approver. | V |
| Secure data separation | Elmo app-level `organization_id` filtering; **RLS enabled but no policies**; Postgres RLS (`rowsecurity.c`) | Postgres RLS policies + app filtering | **Gap** | RLS policies on every tenant table; `SET LOCAL app.tenant_id`; non-owner DB role; tenant-isolation e2e tests (OpenSEO `mcp-tenant-isolation.spec.ts` is a pattern to follow). | N |
| Billing readiness | Elmo `@better-auth/stripe`, `packages/lib/src/entitlements/*` | Elmo | Partial | Plans and per-client metering. | N |

---

## SYSTEM 3: Business Conversion Engine

| Feature | Candidates | Selected | Coverage | Remaining work | Adaptify |
|---|---|---|---|---|---|
| Buyer journey mapping | None (concept only) | Custom | Gap | Journey model: prompt cluster → landing page → CTA → enquiry → booking → job. | N |
| Website conversion analysis | SquirrelScan content/legal/local rules; Lighthouse; Umami goals/funnels | SquirrelScan + Umami funnels | Partial | Conversion checklist (click-to-call, form friction, trust signals, hours, service-area pages). | N |
| Enquiry capture and lead source | Umami UTM/gclid/fbclid + `getAttribution`; Twenty/HubSpot CRM fields | Umami + CRM connectors | Partial | A small form/enquiry webhook endpoint that stamps the Umami session and UTM. | N |
| AI-assistant referral traffic | Matomo `AIAssistant` (GPL, idea only); Canonry AI-crawler traffic | Custom referrer list in our Umami ingest layer | Gap | Our own maintained list of chatgpt.com, perplexity.ai and similar referrers. | N |
| Missed-call detection | Chatwoot **Enterprise only** | Custom | **Gap** | Twilio Voice status callback (`no-answer`/`busy`) or the client's VoIP webhooks. | N |
| Permitted SMS follow-up | Chatwoot MIT Twilio code (reference); Activepieces Twilio piece | Custom TS adapter | Gap | Consent and opt-out handling (NZ UEMA 2007); approval of templates. | N |
| Lead response times | Chatwoot `first_reply_created` + business hours (MIT) | Port the algorithm | Partial | Compute FRT from CRM, inbox or call events. | N |
| Email and messaging workflows | Listmonk (AGPL, API); Chatwoot FOSS; customer tools | Customer's existing tool (HubSpot/Mailchimp) + a transactional provider for our own emails | Partial | Defer Listmonk and Chatwoot until clients need a hosted inbox (D5). | N |
| CRM integration | Activepieces HubSpot piece (MIT); Twenty API + MIT SDK; EspoCRM (rejected) | Connectors to the customer's CRM; Twenty optional | Partial | ServiceM8, Tradify and Fergus adapters (**not found in the audited code**; build from their public APIs). | N |
| Lead qualification | None found | Custom (LLM classification + rules, human-reviewed) | Gap | — | N |
| Booking and appointment tracking | Easy!Appointments (rejected); none else | Integrate Calendly, Google Calendar, ServiceM8 | Gap | Adapters. | N |
| Sales pipeline analysis | Twenty opportunities (API); HubSpot | Via connectors | Partial | Stage-conversion metrics. | N |
| Completed-job and revenue tracking | None | Custom, only where the client's system provides data | Gap | Import from ServiceM8/Xero/Shopify orders. | N |
| Conversion bottleneck detection | None | Custom rules over the funnel | Gap | — | N |
| Customer journey recommendations | None | Custom (LangGraph graph, human-approved) | Gap | — | N |
| Visibility → enquiry → revenue reporting | Umami attribution + CRM | Custom report with the **attribution class** on every number | Gap | See the attribution classes below. | N |
| Commercial opportunity prioritisation | SEOMachine `OpportunityScorer` (heuristic) | Custom (see 09) | Gap | — | N |

### Attribution classes (mandatory on every System 3 number)

| Class | Definition | Example |
|---|---|---|
| **Observed outcome** | A fact recorded by a client system, with no causal claim | "42 enquiries in October (CRM)" |
| **Tracked attribution** | A deterministic link via UTM, click ID, call-tracking number or form session | "9 enquiries had first touch referrer chatgpt.com (Umami first-click)" |
| **Inferred association** | A statistical or temporal correlation, labelled as such | "Enquiries rose 18% in the 4 weeks after the service page was published; not causal" |
| **Unknown source** | No usable source data | Shown as its own bucket, never redistributed |

---

## Coverage summary

| System | Features | Full | Partial | Provider-dependent | Gap |
|---|---|---|---|---|---|
| 1 Discoverability | 30 | 10 | 13 (2 of them also provider-dependent) | 5 | 2 |
| 2 Client delivery | 20 | 5 | 9 | 0 | 6 |
| 3 Conversion | 17 | 0 | 6 | 0 | 11 |

Most of the **Adaptify-parity** surface (System 1 and the System 2 portal, approvals and reports) is covered by reusable code. The **proposal engine, outreach, per-tenant branding and DB-enforced isolation** are the main parity gaps that need new code. **System 3** is almost entirely new integration and business logic. That is also where the differentiation lies (09).

# 03 — Reusable Code Inventory

This file lists only code that **was located in source**. The paths are relative to each repository at the commit pinned in 02. Each audit agent opened the symbols listed. If a test file is marked "NOT VERIFIED", it was not opened. **Licence** gives the licence of the specific path.

**Action key**
- **FORK**: the base we build on.
- **COPY**: copy-and-adapt into our codebase, keeping the notice.
- **DEP**: npm or pip dependency.
- **SVC**: run as a separate internal service.
- **API**: integrate over HTTP.
- **REF**: read for design only; copy no code.

## A. Platform skeleton (FORK: Elmo `elmohq/elmo@db2d52b`, MIT)

| Module | Path | Symbols | What it does | Tests | Action |
|---|---|---|---|---|---|
| Web app / REST / MCP | `apps/web` (TanStack Start), `packages/api-spec` | server fns in `apps/web/src/server/*.ts` | Dashboard, REST API, OpenAPI, MCP server | `apps/web/src/server/__tests__` | FORK |
| Worker | `apps/worker/src/{boss,index}.ts` | `getBoss`, `boss.schedule("schedule-maintenance","*/5 * * * *")` | pg-boss job runner | `cycle.test.ts`, `derive-runs*.test.ts` | FORK |
| Schema + migrations | `packages/lib/src/db/schema.ts`, `schema-auth.ts`, `migrations/0000…0032` | Drizzle tables `brands`, `prompts`, `competitors`, `prompt_runs` (append-only trigger), `run_mentions`, `citations`, `reports`, `brand_opportunities`, `usage_events`, `secrets`, `rollup_*` | System of record | integration tests | FORK, extended (see 05 §5) |
| Auth / orgs / RBAC | `packages/lib/src/auth/{server,permissions}.ts` | better-auth plugins `organization`, `apiKey`, `sso`, `admin`, `jwt`; `ownerRole`, `adminRole`, `userRole` | Multi-org membership, API keys, SSO | `permissions.test.ts` | FORK |
| White-label mode | `packages/config/src/env-registry.ts`, `env.ts` | `DEPLOYMENT_MODE=whitelabel`, `VITE_APP_NAME`, `VITE_APP_ICON`, `VITE_APP_URL` | Instance-level branding | `e2e/modes.yaml` | FORK, extended to per-tenant branding |
| Secrets vault | `packages/lib/src/secrets/{crypto,store}.ts` | — | Encrypted per-org credentials (CMS, GSC tokens) | NOT VERIFIED | FORK |
| Usage/cost metering | `packages/lib/src/usage/cost.ts` | — | Per-run cost accounting | NOT VERIFIED | FORK |
| Run policy | `packages/lib/src/run-policy/policy.ts`, `run-backoff.ts`, `queues/prompt-jobs.ts` | `resolveRunPlan`, `computeMaintenanceDecisions` | Cadence, replication and backoff for scheduled tests | `cycle.test.ts` | FORK |

**Must remove after forking:**
- `apps/worker/src/telemetry.ts` (PostHog, hard-coded key).
- The Elmo brand assets in `apps/www/public/brand/*` and `packages/ui/src/brand/*`.
- `apps/www`, Elmo's own marketing site.

## B. AI visibility collection (Discoverability engine)

| Capability | Source | Path | Symbols | Deps / external | Tests | Licence | Action |
|---|---|---|---|---|---|---|---|
| Provider interface | Elmo | `packages/lib/src/providers/{types,index,config,runner}.ts`, `packages/config/src/scrape-targets.ts` | `Provider{access:"scraped"\|"api"}`, `providerMap`, `parseScrapeTargets`, `isGroundedApiTarget` | — | `runner.test.ts`, `config.test.ts`, `sdk-contract.test.ts` | MIT | FORK |
| OpenAI grounded API | Elmo | `providers/registry/openai-api.ts` | `runOpenAI` (Responses API + `webSearch`) | OpenAI API (paid) | `openai-api.test.ts` | MIT | FORK |
| Anthropic grounded API | Elmo | `providers/registry/anthropic-api.ts` | `runAnthropic` (`web_search_20250305`) | Anthropic API (paid) | `anthropic-api.test.ts` | MIT | FORK |
| **City/region/country for API engines** | Canonry `f5d4612` | `packages/provider-{openai,claude,perplexity}/src/normalize.ts`; `packages/provider-gemini/src/normalize.ts::buildPrompt` | `user_location:{city,region,country,timezone}` on the web_search tool; Gemini puts location in the prompt text | vendor SDKs | per-package tests | MIT | COPY into Elmo's providers |
| Perplexity API | Canonry | `packages/provider-perplexity/src/normalize.ts` | agent API with `user_location` | Perplexity API (paid) | yes | MIT | COPY |
| Gemini API | Canonry | `packages/provider-gemini/src/normalize.ts` | `tools:[{googleSearch:{}}]` | Gemini API (paid or free tier, unverified) | yes | MIT | COPY |
| Answer-evidence contract | Canonry | `packages/contracts/src/answer-evidence.ts`, `retrieval.ts`, `cited-urls.ts` | `deriveRetrievalStatus`, `resolveLocationTreatment`, `deriveCitedDomains` | zod | yes | MIT | COPY (basis of our evidence model) |
| Consumer-surface via licensed provider | Elmo | `providers/registry/{dataforseo,cloro,brightdata,oxylabs,olostep,searchapi}.ts`, `poll-task.ts` | `pollTask`; DataForSEO `chatGptLlmScraperLiveAdvanced`, `googleAiModeLiveAdvanced`, organic + `load_async_ai_overview` | **paid** vendors | a test per adapter | MIT | FORK (enable only vendors that pass due diligence, decision D3) |
| NZ location codes | Limelit `53d178b` | `internal/provider/dataforseo.go` | `dataForSEOCountries` (NZ=2554, AU=2036), errors on unknown codes | — | yes | Apache-2.0 + NOTICE | COPY (port to TS), replacing Elmo's hard-coded `DFS_LOCATION_CODE = 2840` |
| Raw-response parsers | Elmo | `packages/lib/src/text-extraction.ts` | `extractTextContent`, `extractCitationsFrom*`, `EXTRACTOR_VERSION` | — | `text-extraction.test.ts` | MIT | FORK |

## C. Analysis: mentions, rank, sentiment, SoV, opportunities

| Capability | Source | Path | Symbols | Deps | Tests | Licence | Action |
|---|---|---|---|---|---|---|---|
| **Deterministic mention + list rank (default judge)** | Limelit | `internal/mentions/mentions.go`, `phrase.go` | `NewMatcher`, `Matcher.Find`, `listRanks`, `IsBranded`, `PhraseName`, `NormalizeKey` | stdlib | `mentions_test.go`, `phrase_test.go`: **run, PASS** | Apache-2.0 | COPY (port about 400 LOC to TS) |
| Brand alias / competitor matching | Canonry | `packages/contracts/src/brand-matching.ts`, `competitor-matching.ts`, `competitor-auto-aliases.ts` | `compileBrandAliases`, `matcherMatchesText`, `extractRecommendedCompetitors` | — | yes | MIT | COPY |
| Brand span matching (alternative) | OpenSEO `7d89cfb` | `src/server/features/ai-visibility/services/aiVisibilityMatching.ts` | `aiMentionSpans`, `matchAiBrand`, `aiPromptIsBranded` | — | `aiVisibilityMatching.test.ts` | MIT | REF (Canonry/Limelit chosen) |
| LLM judge (optional cross-check) | Elmo | `packages/lib/src/mention-judge/{analyze,jev,passages,clean}.ts` | `createMentionAnalyzer`, `JevTransport`, `adaptivePool`, `rank` | **TypeSafe Jev (paid) or OpenRouter** | `analyze.test.ts`, `jev.test.ts` | MIT | FORK, then modify: make it optional and add a generic-LLM transport |
| Citation classification | Elmo | `packages/lib/src/citations/{domain-categories,domain-lists,page-classification}.ts` | `classifyPage`, `classifyUrl` | — | yes | MIT | FORK |
| SoV with publication floors | Canonry | `packages/intelligence/src/share-of-voice-frame.ts`, `mention-share.ts`, `visibility-score.ts` | `buildShareOfVoiceFrame` (`MIN_OBSERVED_COMPETITORS=3`, `MIN_OBSERVED_ANSWERS=3`) | — | yes | MIT | COPY (replace Elmo's `computeShareOfVoice`) |
| Metric denominators, `n` on every metric | Limelit | `internal/metrics/*.go`, `docs/methodology.md` | `Overview`, `Standings`, `Matrix` | — | **run, PASS** | Apache-2.0 | COPY the methodology |
| Regressions, gaps, content targets | Canonry | `packages/intelligence/src/{regressions,insights,gap-query-score,content-targets}.ts` | pure functions | — | yes | MIT | COPY |
| Rollups | Elmo | `packages/lib/src/rollups/*` | `rebuild`, `dirty` | Drizzle | `rollups.integration.test.ts` | MIT | FORK |
| Opportunities | Elmo | `apps/web/src/server/opportunities*.ts` | — | — | NOT VERIFIED | MIT | FORK |

## D. Prompt discovery and clustering

| Capability | Source | Path | Symbols | Deps | Licence | Action |
|---|---|---|---|---|---|---|
| LLM prompt suggestion (with web search) | Elmo | `packages/lib/src/onboarding/{suggest-prompts,analyze,llm}.ts`, `bulk-prompts.ts` | `suggestPrompts`, `normalizePrompts`, `dedupeKey` | OpenAI/Anthropic/OpenRouter | MIT | FORK |
| **Embedding clustering and dedup** | Canonry | `packages/api-routes/src/discovery/orchestrate.ts`, `packages/contracts/src/embeddings.ts` | `clusterByCosine`, `computeDedupSimilarityStats`, `pickClusterRepresentative` | embeddings API, or Ollama locally | MIT | COPY (vectors stored in pgvector) |
| Branded vs non-branded classification | Canonry | `packages/intelligence/src/{query-categorize,query-shape,suggested-queries}.ts` | — | — | MIT | COPY |
| Template prompt pack (no LLM spend) | Limelit | `internal/promptpack/promptpack.go` | — | — | Apache-2.0 | COPY (zero-cost POC seeding) |
| Autocomplete question expansion | GeoLook `9492cb3` | `scripts/expand.py` | `suggest_google`, `suggest_baidu` | unofficial endpoint, **ToS caution** | MIT | REF; use only after a ToS review (D3) |

## E. SEO data, rank tracking, technical audit

| Capability | Source | Path | Symbols | Deps | Licence | Action |
|---|---|---|---|---|---|---|
| **DataForSEO typed client** (keywords, backlinks, SERP, local, LLM endpoints) | OpenSEO | `src/server/lib/dataforseo/{client,labs,google-ads,keyword-metrics,backlinks,serp,serp-locations,ai,ai-tracking,business,pricing,request-slots}.ts` | `createDataforseoClient`, `fetchLlmResponse`, `fetchSerpLocationsForCountry` | **DataForSEO (paid)** | MIT | COPY |
| Rank-check workflow with retries | OpenSEO | `src/server/features/rank-tracking/services/*`, `workflows/RankCheckWorkflow.ts`, `rankCheckRetries.ts` | `scheduledRankChecks` | DataForSEO | MIT | COPY (re-host on pg-boss) |
| Cheap SERP provider adapters (fallback) | SerpBear `414ec8e` | `scrapers/services/{serpapi,serper,valueserp,searchapi,spaceserp,hasdata,crazyserp}.ts`, `utils/scraper.ts` | `ScraperSettings{scrapeURL,serpExtractor,allowsCity}`, `scrapeKeywordWithStrategy` | paid SERP APIs | MIT | COPY (exclude `proxy.ts`) |
| GSC + GA4 OAuth clients | OpenSEO | `src/server/lib/{gscClient,ga4Client}.ts`, `features/gsc`, `features/ga4` | — | Google APIs (free) | MIT | COPY |
| GSC/GA4 opportunity heuristics | SEOMachine `120e7b4` | `data_sources/modules/{google_search_console,google_analytics,opportunity_scorer}.py` | `get_quick_wins`, `get_low_ctr_pages`, `get_declining_pages`, `OpportunityScorer.calculate_score` | — | MIT | COPY (port to TS) |
| Bing / GBP / Ads integrations | Canonry | `packages/integration-{bing,google-business-profile?,google-ads}` (exact GBP package name NOT VERIFIED) | — | vendor APIs | MIT | COPY (Phase 4+) |
| **Technical SEO + agent-readiness audit (319 rules)** | SquirrelScan `ae44ccf` | `packages/rules/src/<24 categories>`, `packages/audit-engine/src/{runner,scoring}.ts` | `Rule` objects, `runRulesOnStorage`, `generateReportFromStorage` | Bun runtime | MIT (rebrand) | SVC (Bun worker container, ingesting its JSON report) |
| AI-readiness quick audit | Elmo | `packages/site-audit/src/{audit,checks/reach,read,understand}.ts` | — | fetch | MIT | FORK (onboarding snapshot) |
| Performance / a11y / agentic audits | Lighthouse `ea58ed1` | `core/index.js` (`lighthouse()`, `startFlow()`), `core/audits/agentic/*` | — | Chrome | Apache-2.0 | DEP |
| Site-wide Lighthouse | Unlighthouse `9a2147d` | `packages/core/src/unlighthouse.ts` | `createUnlighthouse` | puppeteer-cluster | MIT | DEP (optional; may defer) |
| AI-crawler traffic detection | Canonry | `packages/integration-traffic`, `integration-cloudflare-*`, `integration-wordpress-traffic` | — | log access | MIT | COPY (Phase 4) |
| Backlinks from Common Crawl (free) | Canonry | `packages/integration-commoncrawl` | — | `@duckdb/node-api` | MIT | COPY |

## F. Content, QA and publishing

| Capability | Source | Path | Symbols | Deps | Licence | Action |
|---|---|---|---|---|---|---|
| Rule-based content scorers | SEOMachine | `data_sources/modules/{content_scorer,readability_scorer,seo_quality_rater,content_scrubber}.py` | `ContentScorer.score`, `ContentScrubber.scrub` | textstat, nltk | MIT | COPY (port to TS, as part of the per-site checklist) |
| LLM-graded and deterministic QA | Promptfoo `db6a568` | `src/node/evaluate.ts::evaluate`, `src/assertions/{llmRubric,geval,factuality,contains,regex,javascript,wordCount}.ts` | `evaluate()` | grader LLM (paid) for model-graded checks | MIT | DEP (QA worker + CI) |
| llms.txt / JSON-LD / FAQ generators, draft lint | GeoLook | `scripts/generate.py` | `gen_llms_txt`, `gen_jsonld`, `gen_faq_block`, `lint_draft` | — | MIT | COPY (port) |
| Fix tickets with acceptance criteria and auto-verify | GeoLook | `scripts/tasks.py`, `verify.py` | — | — | MIT | COPY the concept |
| **WordPress publisher (TS)** | Canonry | `packages/integration-wordpress/src/wordpress-client.ts`, `schema-templates.ts` | — | WP REST | MIT | COPY |
| WordPress publisher (reference) | SEOMachine | `data_sources/modules/wordpress_publisher.py` | `create_draft`, `set_seo_meta` (Yoast/RankMath) | WP REST + Application Passwords | MIT | REF |
| WordPress / Shopify / HubSpot / GSC connectors | Activepieces `c1525dc` | `packages/pieces/community/{wordpress,shopify,hubspot,google-search-console,gmail,slack,twilio}` | `createAction` per file | vendor APIs | **MIT** (EE paths excluded) | COPY action logic only |
| WP REST contract and rollback | WordPress `d2fc75d` | `class-wp-rest-posts-controller.php`, `class-wp-rest-revisions-controller.php`, `class-wp-application-passwords.php` | `create_item`, `update_item`; revisions with **no restore endpoint** | — | GPL (contract only) | API |
| Durable content pipeline with approval | LangGraph.js `2d4f48d` | `libs/langgraph-core/src/interrupt.ts`, `libs/checkpoint-postgres/src/index.ts` | `interrupt()`, `Command({resume})`, `PostgresSaver`, `RetryPolicy` | Postgres | MIT | DEP |

## G. Conversion, CRM and analytics

| Capability | Source | Path | Symbols | Deps | Licence | Action |
|---|---|---|---|---|---|---|
| Cookieless tracker + UTM/gclid/fbclid capture | Umami `559e3c6` | `src/tracker/index.ts`, `src/app/api/send/route.ts` | `umami.track()` | Postgres | MIT | SVC (one internal instance) |
| First/last-click attribution | Umami | `src/queries/sql/attribution/getAttribution.ts` | `getAttribution(websiteId,{model})` | SQL | MIT | SVC (read via API); COPY the SQL if Umami is later folded in |
| Teams / multi-website | Umami | `prisma/schema.prisma` `Team`, `TeamUser` | — | — | MIT | SVC |
| AI-assistant referrer channel | Matomo | `plugins/Referrers/AIAssistant.php` | `AIAssistant::getDefinitions` | — | **GPL** | REF only (re-implement our own referrer list) |
| First-response-time logic | Chatwoot `625d596` | `app/listeners/reporting_event_listener.rb#first_reply_created`, `app/helpers/reporting_event_helper.rb#business_hours` | — | — | MIT | COPY the algorithm (port to TS) |
| Twilio SMS send/receive | Chatwoot | `app/services/twilio/{incoming_message_service,send_on_twilio_service}.rb` | — | **Twilio (paid)** | MIT | REF (write a small TS adapter) |
| Missed-call detection | Chatwoot `enterprise/` | `enterprise/app/jobs/voice/missed_call_notification_job.rb` | — | — | **Enterprise: do not use** | CUSTOM BUILD on Twilio Voice status callbacks |
| CRM API (default CRM for clients without one) | Twenty `d539d31` | REST/GraphQL APIs; `packages/twenty-sdk` | — | — | AGPL server (API-only via the §7 exception); **SDK is MIT** | API (optional; decision D5) |
| CRM objects/webhooks for customers' existing systems | Activepieces | `packages/pieces/community/hubspot` (Pipedrive and others present but NOT VERIFIED) | — | vendor APIs | MIT | COPY |

## H. Operations

| Capability | Source | Path | Licence | Action |
|---|---|---|---|---|
| Model price table (about 185 models) | Langfuse `f257bef` | `worker/src/constants/default-model-prices.json`, `packages/shared/src/server/ingestion/modelMatch.ts::findModel` | MIT | COPY (into Elmo `usage/cost.ts`) |
| LLM tracing | Langfuse | OTel endpoint `web/src/pages/api/public/otel/v1/traces` | MIT (no `ee/`) | SVC, deferred (ClickHouse is heavy) |
| Postgres queue / cron / DLQ | pg-boss `5abc8ce` | `src/manager.ts`, `src/timekeeper.ts` | MIT | DEP (already in Elmo) |
| Embeddings store | pgvector `724588a` | extension | PostgreSQL | DEP |
| Local LLM / embeddings for the POC | Ollama `5e983d4` | `server/routes.go` `/v1/chat/completions`, `/v1/embeddings`, `/v1/messages` | MIT (model weights vary) | SVC (dev only) |
| Rendering, screenshots, PDF reports | Playwright `07c7069` | `page.screenshot`, PDF | Apache-2.0 | DEP |

## Not reusable (and why)

| Item | Reason |
|---|---|
| OneGlanse consumer-UI scrapers | ToS breach risk (anti-detect browser + residential proxies); only 2 tests. |
| Canonry `provider-cdp` | Automates a logged-in chatgpt.com session (ToS risk). |
| SerpBear `scrapers/services/proxy.ts` | Direct Google scraping (ToS). |
| Canonry `integration-typesafe` | FSL-1.1-ALv2. |
| Every EE/enterprise directory listed in 02 | Commercial licences. |
| Any GPL/AGPL code | Copying it would relicense Online Reset. |
| SEOMachine `.claude/commands/research-ai-citations.md` | Prompt text only; does no automated collection. |

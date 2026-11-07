# Group B source audit (repos 6–12)

Method notes: shallow clones under `scratchpad/repos/<name>` (Lighthouse: sparse `core/`, `docs/` + root files). **`gh api` was refused for all 7 repos in this session (HTTP 403, "GitHub access to this repository is not enabled")**, so stars, archived flag, open issues and GitHub security advisories are **NOT VERIFIED**. Tags came from `git ls-remote`; tag dates from fetching each tag commit. No code was installed or run.

---

### 6. OpenSEO
- URL: https://github.com/every-app/open-seo · HEAD `7d89cfb3ca30b2819356c57c5b746a1048b9743f` (2026-11-06) · latest tag `v0.1.26` (2026-11-06, the HEAD commit) · archived/stars: NOT VERIFIED · maintenance: **active** (HEAD and release a day before the audit, 26+ 0.1.x tags).
- Stack: TypeScript, TanStack Start (React 19), Drizzle ORM. Targets Cloudflare Workers (`wrangler.jsonc`, D1/KV/Workflows) or Docker (`compose.yaml`, image `ghcr.io/every-app/open-seo`). Drizzle has migration folders for both `drizzle/pg` and `drizzle/sqlite`, and `postgres` is a dependency. Auth is better-auth with organizations/invitations (`src/server/auth/default-hosted-organization.ts`, `invitation-send-limit.ts`, `ownership-transfer.ts`). It includes an MCP server (`src/server/mcp/tools/*`, about 50 tools) and an OpenRouter chat agent (`src/server/lib/openrouter`, `features/sam`).
- Tests/CI: 293 files with "test" in the name (unit `*.test.ts` sit next to the code; Playwright e2e in `tests/`, including `mcp-tenant-isolation.spec.ts`). CI: `ci.yml`, `deploy-*.yml`, `docker-image.yml`, `pr-preview.yml`, `release.yml`. Advisories: NOT VERIFIED (has a `SECURITY.md`).
- **Licence: MIT** (root `LICENSE`, © 2026 Ben Senescu). The only other licence file is `.agents/skills/deslop/LICENSE` (agent skill, not product code). No ee/commercial dirs or BUSL headers. Commercial modification, white-label and SaaS use are allowed. No source disclosure required; keep the copyright notice.
- **Data providers. Almost everything goes through DataForSEO (BYO key, paid per call)**: `src/server/lib/dataforseo/client.ts` `createDataforseoClient()`. Endpoints found in `src/server/lib/dataforseo/*.ts`:
  - Keywords: `dataforseo_labs/google/{keyword_ideas,keyword_suggestions,keyword_overview,related_keywords,ranked_keywords,relevant_pages,serp_competitors,domain_rank_overview}/live`, `keywords_data/google_ads/{search_volume,keywords_for_keywords}/live` (`labs.ts`, `google-ads.ts`, `keyword-metrics.ts`).
  - Backlinks: `backlinks/{summary,backlinks,referring_domains,history,domain_pages_summary}/live` (`backlinks.ts`, consumed by `features/backlinks/services/BacklinksService.ts`).
  - SERP / rank tracking: `serp/google/organic/{task_post,task_get/advanced,live/advanced}`, `serp/google/{maps,local_finder}` (`serp.ts`); locations via `serp/google/locations/{country}` (`serp-locations.ts`). NZ = location code 2554 in `src/shared/keyword-locations.ts`; city-level comes from DataForSEO's location list.
  - AI visibility: `ai_optimization/{chat_gpt,gemini}/llm_scraper` (**DataForSEO scrapes the consumer UIs**, `ai-tracking.ts`), `ai_optimization/{model}/llm_responses/live` (**DataForSEO proxies the LLM APIs**: ChatGPT, Claude, Perplexity, Gemini; `ai.ts fetchLlmResponse`), and `llm_mentions/{search,aggregated_metrics,cross_aggregated_metrics,top_pages}/live` (`ai.ts`).
  - Lighthouse: `on_page/lighthouse/live/json`. `src/server/lib/audit/lighthouse.ts fetchLighthouseResult` calls DataForSEO and does not run Lighthouse locally.
  - Local SEO: `business_data/google/*` (`business.ts`, `features/local-seo`).
  - Google APIs (free, OAuth): Search Console (`features/gsc`, `webmasters/v3`, `searchconsole.googleapis.com`), GA4 (`features/ga4`). Also IndexNow (`features/indexnow`) and OpenRouter for LLM chat and prompt suggestions.

| Capability | File path(s) | Symbols | What it does | Deps | In→Out | Tests | Reusable alone? | Legal to copy? |
|---|---|---|---|---|---|---|---|---|
| Brand mention matching | `src/server/features/ai-visibility/services/aiVisibilityMatching.ts` | `aiMentionSpans`, `matchAiBrand`, `aiBrandNames`, `ownedAiDomain`, `aiPromptIsBranded` | Pure functions that find brand/domain spans in AI answers | none | answer text + brands → spans/matches | `aiVisibilityMatching.test.ts` | Yes (pure TS) | Yes (MIT) |
| Share of voice | `src/server/features/ai-search/services/shareOfVoice.ts` | `computeShareOfVoice`, `resolveCompetitorGroups` | Computes SoV from DataForSEO cross-aggregated mention metrics | none (data from DFS) | metrics → SoV % | `shareOfVoice.test.ts` | Yes | Yes |
| AI visibility runs + schedule | `services/aiVisibilityRuns.ts`, `scheduledAiVisibility.ts`, `aiVisibilitySchedule.ts`, `src/server/workflows/AiVisibilityWorkflow.ts` | — | Prompt × model runs, costed, scheduled with CF Workflows/pg step | DataForSEO, CF Workflows or `pgStep.ts` | prompts → stored runs/trends | several `*.test.ts` | Partial (tied to the DFS envelope and workflow runtime) | Yes |
| Prompt generation | `services/aiPromptSuggestions.ts`, `aiPromptResearch.ts` | `generateAiPrompts` | LLM-generated candidate prompts | OpenRouter / DFS | site context → prompts | `aiPromptResearch.test.ts` | Partial | Yes |
| DataForSEO typed client | `src/server/lib/dataforseo/*` | `createDataforseoClient`, `fetchLlmResponse`, `postAiTrackingTasks`, `fetchSerpLocationsForCountry` | Typed wrappers, billing, slots, pricing | DataForSEO (paid) | — | many `*.test.ts` | **Yes, a good starter for our own DFS client** | Yes |
| Rank tracking | `features/rank-tracking/services/*`, `workflows/RankCheckWorkflow.ts`, `rankCheckRetries.ts` | `scheduledRankChecks` | Scheduled DFS SERP task_post/task_get with retries | DataForSEO | keywords+location → positions | yes | Partial | Yes |
| Site audit crawler | `src/server/lib/audit/{discovery,page-analyzer,crawl-throttle,url-policy}.ts`, `issues/{page-reporters,multipage-checks}.ts`, `workflows/SiteAuditWorkflow.ts` | `analyzeHtml` | Own crawler + HTML checks (local); Lighthouse via DFS | none locally | URL → issues | yes | Partial | Yes |
| GSC / GA4 | `features/gsc`, `features/ga4`, `mcp/tools/search-console-tools.ts` | — | OAuth + Search Analytics / GA4 reads | Google APIs (free) | — | yes | Partial | Yes |
| MCP server | `src/server/mcp/tools/*` | ~50 tools | Agent access to all features | — | — | many | Pattern reference | Yes |

- **Recommendation: COPY-AND-ADAPT** (DataForSEO client, matching/SoV logic, MCP tool patterns). A **FORK** is viable since it is MIT, multi-tenant-ish and close to our scope, but its runtime is Cloudflare-centric. Every data feature depends on paid DataForSEO, so it brings no free data.
- Scores: coverage **5** (keywords, rank, backlinks, AI visibility, audit, GSC, local); reusability **4** (feature-sliced, pure helpers); licence **5** (MIT); maintenance **5**; security/tests **4** (large test suite, tenant-isolation e2e; advisories unchecked); cost/external burden **2** (DataForSEO per call for everything); complexity **3** (CF/Workflows coupling).

---

### 7. SerpBear
- URL: https://github.com/towfiqi/serpbear · HEAD `414ec8e441b1ae794ea7738c9e4c533a7c5e5dbc` (2026-10-30) · latest tag `v3.1.2` (2026-10-30, HEAD) · archived/stars NOT VERIFIED · maintenance: **active** (release last week).
- Stack: Next.js **12.3.4** (old major) + React, TypeScript; **Sequelize + sqlite3**, storage `./data/database.sqlite` (`database/database.ts`), models `database/models/{domain,keyword}.ts`, 5 migrations. Scheduler `cron.js` uses **croner** (`new Cron(...)`): it calls its own `/api/cron`, `/api/notify` and `/api/refresh` endpoints; intervals are hourly, daily, other_day, daily_morning, weekly, monthly (`generateCronTime`). It retries failed keywords hourly and syncs Search Console daily. Settings are encrypted with Cryptr in `data/settings.json`. **Single user**: one `USER_NAME`/`PASSWORD` env login (`pages/api/login.ts`), no orgs/RBAC.
- Tests/CI: 10 test files (`__tests__/components|hooks|pages`, Jest). CI: only `docker-publish.yml` (no test workflow). Advisories NOT VERIFIED.
- **Licence: MIT** (© 2022 Amruth Pillai; that copyright name is in the file as-is). No other licence files and no commercial dirs. Commercial use, white-label and SaaS are OK.
- **Scrapers (`scrapers/index.ts` registers all 11, in `scrapers/services/`)**:

| File | id | Service (paid unless noted) | Endpoint | City support (`allowsCity`) |
|---|---|---|---|---|
| `scrapingrobot.ts` | scrapingrobot | Scraping Robot | api.scrapingrobot.com proxies a google.com/search URL | no (country via `proxyCountry`) |
| `scrapingant.ts` | scrapingant | ScrapingAnt | api.scrapingant.com/v2/extended | no (`proxy_country`) |
| `serpapi.ts` | serpapi | SerpApi | serpapi.com/search | **yes** |
| `serply.ts` | serply | Serply | api.serply.io | no |
| `spaceserp.ts` | spaceSerp | SpaceSerp | api.spaceserp.com | **yes** |
| `searchapi.ts` | searchapi | SearchApi.io | searchapi.io/api/v1/search | **yes** |
| `valueserp.ts` | valueserp | ValueSERP | api.valueserp.com | **yes** |
| `serper.ts` | serper | Serper.dev | google.serper.dev/search | **yes** |
| `hasdata.ts` | hasdata | HasData (scrape-it.cloud) | api.scrape-it.cloud/scrape/google/serp | **yes** |
| `crazyserp.ts` | crazyserp | CrazySERP | crazyserp.com/api/search | **yes** |
| `proxy.ts` | proxy | **No paid API: direct Google scraping** through user-supplied HTTP proxies (`utils/scraper.ts getScraperClient`, random proxy from the list, `HttpsProxyAgent`, cheerio parse of `#main h3`) | www.google.com/search | **no**: the URL has no `gl`/`hl`, so geo depends on the proxy's exit IP |

  The **free/direct scraping option is `proxy` only**. It is brittle (DOM selectors), breaks Google ToS and has no location parameters.
- **Location/NZ**: `utils/countries.ts` has `NZ: ['New Zealand','Wellington','en',2554]`. City is a **free-text** `keyword.city` field (model `keyword.ts`). For providers with `allowsCity`, it is sent as `location=<city>,<Country name>`, e.g. `Auckland,New Zealand` or `Christchurch,New Zealand`. There is no city list or validation, so whether an NZ city resolves depends on that provider's own location-name matching. NOT VERIFIED per provider.
- Search Console: `utils/searchConsole.ts` (`fetchDomainSCData`, `integrateKeywordSCData`, `checkSerchConsoleIntegration`) via `@googleapis/searchconsole` with a service account. Data is cached in local JSON files (`readLocalSCData`/`updateLocalSCData`). Google Ads keyword ideas/volume: `utils/adwords.ts` calls `googleads.googleapis.com/v23 ...:generateKeywordIdeas` and `:generateKeywordHistoricalMetrics` (needs an Ads developer token).

| Capability | File | Symbols | What | Deps | Reusable? | Legal? |
|---|---|---|---|---|---|---|
| SERP provider adapters | `scrapers/services/*.ts` | `ScraperSettings{scrapeURL,serpExtractor,headers,allowsCity}` | URL builders + JSON→`{title,url,position}` extractors per provider | cheerio | **Yes, small and self-contained** | Yes (MIT) |
| Rank lookup | `utils/scraper.ts` | `scrapeKeywordFromGoogle`, `scrapeKeywordWithStrategy`, `getSerp`, `extractScrapedResult`, `retryScrape` | Pagination strategy, domain/subdomain match → position | axios, https-proxy-agent | Yes | Yes |
| Scheduling | `cron.js` | `generateCronTime`, `runAppCronJobs` | In-process croner jobs | croner | Pattern only | Yes |
| GSC integration | `utils/searchConsole.ts` | above | Per-keyword clicks/impressions/position | @googleapis/searchconsole | Yes | Yes |
| Keyword ideas | `utils/adwords.ts` | — | Google Ads API ideas/volume | Google Ads API | Yes | Yes |
| Country table | `utils/countries.ts` | default export | ISO → [name, capital, lang, Ads geo ID] | none | Yes | Yes |

- **Recommendation: COPY-AND-ADAPT** the scraper adapter pattern and the GSC/Ads helpers. **REJECT as a fork or service** for a multi-tenant SaaS: single user, SQLite, Next 12, file-based settings.
- Scores: coverage **3** (rank tracking + GSC + ideas only); reusability **4** (adapters are tiny); licence **5**; maintenance **4**; security/tests **2** (10 UI tests, no CI tests, old Next); cost **3** (cheap SERP APIs selectable; proxy option free but against ToS); complexity **4**.

---

### 8. Crawl4AI
- URL: https://github.com/unclecode/crawl4ai · HEAD `cae74b203a33994f7e13b9052c3b0d5c93daa0e6` (2026-11-04) · latest tag `v0.9.5` (2026-10-14; `crawl4ai/__version__.py` = 0.9.5) · archived/stars NOT VERIFIED · maintenance: **active**.
- Stack: Python ≥3.x, Playwright + patchright + playwright-stealth, lxml/bs4, aiosqlite cache. LLM calls go through **`unclecode-litellm==1.81.13`**, a vendor fork of litellm adopted after a PyPI supply-chain compromise of `litellm` (`SECURITY.md` line 188). It also ships a Docker API server (`deploy/`) and an MCP server. `cloud_notice.py` prints an upsell banner for the hosted crawl4ai.com (stderr; `CRAWL4AI_NO_CLOUD_NOTICE=1` disables it).
- Tests/CI: 277 test files (`tests/` with async, browser, deep_crawling, docker, mcp, adversarial, regression…). CI: `main.yml`, `release.yml`, `docker-release.yml`, `security.yml`, `docs`. Security: `SECURITY-CREDITS.md` lists many 2026 reports: **SSRF** (/md, /crawl, /crawl/stream, proxy_config), **RCE** (hook `exec()` sandbox escape, Chromium launch-arg injection), file write, auth missing by default in Docker, LLM key exfiltration via base_url. These are reported as fixed. **Do not expose its Docker server to tenants. Use the library behind our own URL allowlist and SSRF guard.**
- **Licence: Apache-2.0 + an added "Attribution Requirement"** (root `LICENSE` lines 52–67): *"All distributions, publications, or public uses of this software, or derivative works … must include the following attribution: 'This product includes software developed by UncleCode (https://x.com/unclecode) as part of the Crawl4AI project (https://github.com/unclecode/crawl4ai).'"*. For websites/web apps it must go in an "About" or "Credits" section. README §"License & Attribution" repeats it (badge or text). This rider is **not standard SPDX Apache-2.0**. Its enforceability is unclear: Apache §4 permits extra notices, but this one claims to cover "public uses" too. Treat it as a binding requirement: a **credits line in Online Reset's About page**. Otherwise permissive: commercial use, modification and SaaS OK; patent grant; §6 gives no trademark rights; modified files must be marked. No NOTICE file and no ee dirs.
- Core classes (verified):

| Capability | File | Symbols | What | Deps | Reusable? | Legal? |
|---|---|---|---|---|---|---|
| Crawl entry | `crawl4ai/async_webcrawler.py` | `AsyncWebCrawler.arun` (l.216), `arun_many` (l.987) | Fetch/render a URL → `CrawlResult` (html, cleaned_html, markdown, links, media) | Playwright | Yes (pip dependency) | Yes + attribution |
| Fetch strategies | `crawl4ai/async_crawler_strategy.py` | `AsyncPlaywrightCrawlerStrategy`, `AsyncHTTPCrawlerStrategy` | Browser render vs plain HTTP | Playwright/httpx | Yes | Yes |
| Markdown | `crawl4ai/markdown_generation_strategy.py` | `DefaultMarkdownGenerator` | HTML → markdown with citations / fit_markdown | vendored `html2text/` | Yes | Yes |
| Content filtering | `crawl4ai/content_filter_strategy.py` | `PruningContentFilter`, `BM25ContentFilter`, `LLMContentFilter` | Boilerplate removal / query-relevant chunks | rank-bm25, litellm | Yes | Yes |
| Structured extraction | `crawl4ai/extraction_strategy.py` | `JsonCssExtractionStrategy`, `JsonXPathExtractionStrategy`, `RegexExtractionStrategy`, `LLMExtractionStrategy`, `CosineStrategy` | Schema / LLM extraction | lxml, litellm | Yes | Yes |
| Deep crawl | `crawl4ai/deep_crawling/{bfs_strategy,dfs_strategy,bff_strategy,filters,scorers}.py` | `BFSDeepCrawlStrategy`, `BestFirstCrawlingStrategy`, `SEOFilter`, `DomainFilter`, `URLScorer` | Site crawl with filters/scoring | — | Yes | Yes |
| URL discovery | `crawl4ai/async_url_seeder.py` | `AsyncUrlSeeder` | Sitemap / Common Crawl seeding | httpx | Yes | Yes |
| Adaptive crawl | `crawl4ai/adaptive_crawler.py` | `AdaptiveConfig`, `StatisticalStrategy`, `EmbeddingStrategy` | Stops when information is sufficient | — | Yes | Yes |

- **Recommendation: DEPENDENCY** (pip, inside a Python worker / SEPARATE SERVICE we write ourselves, not their Docker server) for content-research crawling and page→markdown for AEO analysis. Add the credits line.
- Scores: coverage **4** (crawl/markdown/extraction, no SEO rules); reusability **5**; licence **3** (attribution rider); maintenance **5**; security/tests **3** (large test suite but a long SSRF/RCE history); cost **4** (self-hosted; Chromium is CPU-heavy; LLM optional); complexity **4**.

---

### 9. SquirrelScan
- URL: https://github.com/squirrelscan/squirrelscan · HEAD `ae44ccf958d320ece3f45f9241686dac90fddf3b` (2026-11-07) · latest tag `v0.0.172` (2026-11-07, HEAD; 172 tags, pre-1.0) · archived/stars NOT VERIFIED · maintenance: **active, very high cadence**.
- Stack: **TypeScript on Bun** (`packageManager: bun@1.4.4`, `bun:sqlite` crawl storage in `packages/crawler/src/storage/sqlite-open.ts`). Monorepo: `apps/cli` + `packages/{audit-engine,crawler,rules,parser,fetchers,report,tech-detect,waf-detect,threat-intel,page-classifier,config,core-contracts,cloud-client,api-client,synthetic-site,utils}`. It ships as a single binary plus an MCP server.
- **Open-source status: the source really is in the repo under MIT** (root `LICENSE` and `npm/LICENSE`, © 2026 squirrelscan). It is not binary-only. Workspace packages are `"private": true` (not published to npm separately, only the CLI wrapper). **Cloud-only features are not in the repo**: AI page analysis, cloud browser rendering, scheduled audits, Perch link checker, editor summary. They call `api.squirrelscan.com` via `packages/cloud-client`. E.g. `packages/rules/src/ai/ai-content.ts` says "AI content detection is currently unavailable… will run as an opt-in, metered cloud check". `TRADEMARKS.md`: the MIT licence does not cover the name or logo, forks must rebrand, and you may not present a modified build as official. That is fine for white-label because we would rebrand anyway. `THIRD_PARTY_NOTICES.md` lists bundled deps (MIT/Apache). `scripts/third-party-embedded/*` holds MIT licences (ajv etc.). The grep hit for "Commercial License" in `packages/page-classifier/assets/classifier-v2.json` is model data, not a licence.
- Tests/CI: **1,152** test-named files; golden tests (`test:engine`). CI: `ci.yml`, `codeql.yml`, `dco.yml`, `dependency-advisory.yml`, `release.yml`, installer tests, `claude-code-review.yml`. Advisories NOT VERIFIED via API. `package.json` `audit:dependencies` ignores 6 GHSA IDs in dependencies.
- **Rules: 319 unique rule IDs** (`id: "<cat>/<name>"` grep across `packages/rules/src`, e.g. `core/meta-title` in `packages/rules/src/core/meta-title.ts` exporting `metaTitleRule: Rule`). README claims "300+ rules, 22 categories". Files per category dir (non-test, non-index): a11y 63, performance 33, content 29, security 29, schema 28, crawl 21, links 20, images 17, integrity 16, eeat 15, ax (agent experience: llms.txt, AGENTS.md, AI-bot parity) 15, core 14, url 9, mobile 8, social 6, legal 5, ai 4, adblock 3, local 3, video 3, gaps 2, i18n 2, analytics 2, reliability 2.

| Capability | File | Symbols | What | Reusable? | Legal? |
|---|---|---|---|---|---|
| Rule library | `packages/rules/src/<category>/*.ts`, `loader.ts`, `categories.ts` | `Rule` objects (`metaTitleRule`…), zod `optionsSchema` | Deterministic SEO/a11y/perf/security/AX checks | Yes (TS, Bun-oriented) | Yes (MIT; rebrand) |
| Audit engine | `packages/audit-engine/src/{index,adapter,runner,scoring,page-rule-executor}.ts` | `runRulesOnStorage`, `buildSiteContext`, `generateReportFromStorage`, `findingFingerprint` | Runs rules over crawl storage and scores them | Partial (bun:sqlite) | Yes |
| Crawler | `packages/crawler/src` | — | Incremental crawl (ETag, hash), resumable | Partial (Bun) | Yes |
| Agent-experience audit | `packages/rules/src/ax/*` | — | llms.txt, AGENTS.md, AI crawler parity | Yes | Yes |
| Tech / WAF detection | `packages/tech-detect`, `packages/waf-detect` | — | Stack fingerprinting | Yes | Yes |
| Reports | `packages/report` | — | JSON/HTML/MD/LLM output | Yes | Yes |

- **Recommendation: SEPARATE SERVICE** (run the CLI/engine in a Bun worker and ingest its JSON) now, and COPY-AND-ADAPT individual rules later. It is the best technical-SEO + AEO "agent-readiness" audit in the group.
- Scores: coverage **5** (tech audit + AX); reusability **4** (Bun runtime coupling); licence **5** (MIT; trademark → rebrand); maintenance **5** (risk: v0.0.x churn); security/tests **5**; cost **5** (local, free; cloud extras optional); complexity **3**.

---

### 10. Unlighthouse
- URL: https://github.com/harlan-zw/unlighthouse · HEAD `9a2147d6d98bbc750b7313f531856cc02322b23a` (2026-10-23) · latest stable `v0.19.1` (2026-10-03); `v1.0.0-beta.0` (2026-10-03) · maintenance: **active**.
- Stack: TypeScript, pnpm monorepo `packages/{core,cli,client (Vue UI),server,unlighthouse,unlighthouse-ci}` + `crux-api` (Nitro). Uses `lighthouse ^13.5.0`, `puppeteer-core ^25`, `puppeteer-cluster ^0.25`, `chrome-launcher`, `h3`. Needs only Chrome, no DB.
- Tests/CI: 23 test files (`test/`, vitest). CI: `test.yml`, `nightly.yml`, `release.yml`, `demo.yml`. Advisories NOT VERIFIED.
- **Licence: MIT** (`LICENSE.md`, © Harlan Wilton). No other licence files.
- **How it orchestrates**: `packages/core/src/unlighthouse.ts createUnlighthouse(userConfig, provider)` is the **Node API entry**; `defineConfig` and `useUnlighthouse` are also exported from `packages/core/src/index.ts`. Route discovery: `src/discovery/{sitemap,robotsTxt,routes,routeDefinitions}.ts`. Concurrency: `src/puppeteer/cluster.ts launchPuppeteerCluster()` (puppeteer-cluster) and `worker.ts createUnlighthouseWorker(tasks)`. Tasks `src/puppeteer/tasks/{html,lighthouse,userFlow}.ts`. **Each Lighthouse scan runs in a separate Node child process** (`tinyexec` spawns `src/process/lighthouse.ts`, which imports `lighthouse/core/index.cjs` and passes the route and `--lighthouseOptions` as argv). Results are normalised by `normaliseLighthouseResult` and median runs use `lighthouse/core/lib/median-run.js computeMedianRun`. An h3 API/websocket server (`src/router/`) feeds the Vue client.

| Capability | File | Symbols | Reusable? | Legal? |
|---|---|---|---|---|
| Site-wide Lighthouse orchestration | `packages/core/src/unlighthouse.ts`, `puppeteer/cluster.ts`, `puppeteer/worker.ts` | `createUnlighthouse`, `launchPuppeteerCluster`, `createUnlighthouseWorker` | Yes (npm `@unlighthouse/core`) | Yes |
| Per-URL LH in child process | `src/puppeteer/tasks/lighthouse.ts`, `src/process/lighthouse.ts` | `normaliseLighthouseResult` | Yes, as a pattern to copy | Yes |
| URL discovery | `src/discovery/sitemap.ts`, `robotsTxt.ts` | — | Yes | Yes |
| CI budgets | `packages/unlighthouse-ci/src/index.ts` | — | Partial | Yes |

- **Recommendation: DEPENDENCY or SEPARATE SERVICE** (a worker running `@unlighthouse/core` for full-site Lighthouse), or COPY-AND-ADAPT the cluster/child-process pattern around Lighthouse directly.
- Scores: coverage **3** (performance/a11y/SEO/BP via LH only); reusability **4**; licence **5**; maintenance **4**; security/tests **3** (23 tests); cost **3** (Chrome CPU per URL); complexity **4**.

---

### 11. Google Lighthouse
- URL: https://github.com/GoogleChrome/lighthouse · HEAD `ea58ed1fd36cb8378a4080dbcb41cdc0e5a581b2` (2026-11-05) · latest tag `v13.6.0` (2026-10-27; `package.json` version 13.6.0) · maintenance: **active** (Google-maintained).
- Stack: JavaScript ESM (`"type":"module"`, main `./core/index.js`; CJS shim `core/index.cjs`). Deps: `puppeteer-core`, `chrome-launcher`, `axe-core 4.14.0`, `@paulirish/trace_engine`, `third-party-web`, `robots-parser`, **`@sentry/node`** (error reporting; it is opt-in per `docs/error-reporting.md`, but disable it in production). Needs Chrome.
- Tests/CI: 256 test-named files under `core/test`. `.github/workflows` was not checked out (sparse), so CI is NOT VERIFIED.
- **Licence: Apache-2.0** (root `LICENSE`, 202 lines, standard text; no NOTICE file found in the sparse checkout). Commercial/SaaS OK. "Lighthouse" is a Google trademark, so don't brand our feature with it beyond describing it ("powered by Lighthouse").
- Node API (`core/index.js`, verified): `lighthouse(url, flags, config, page)` (l.40) → `navigation()` → `Runner.audit`; user flows `startFlow(page, options)` (l.48 → `UserFlow` in `core/user-flow.js`); `navigation`, `snapshot`, `startTimespan`, `generateReport(result, format)`, `auditFlowArtifacts`, `getAuditList`; exports `Audit`, `Gatherer`, `defaultConfig`, `desktopConfig`. Docs: `docs/readme.md`, `docs/puppeteer.md`, `docs/user-flows.md`, `docs/running-at-scale.md` (recommends the PSI API or dedicated hardware), `docs/plugins.md`, `docs/new-audits.md`.
- Audits: `core/audits/` has **172 .js files**, including `seo/` (canonical, crawlable-anchors, hreflang, http-status-code, is-crawlable, link-text, meta-description, robots-txt), `accessibility/` (axe-based), `insights/`, `metrics/`, `byte-efficiency/`, and **`agentic/`** (`llms-txt.js`, `agent-accessibility-tree.js`, `ard-schema.js`) plus `webmcp-*.js`. These are new AEO/agent-readiness audits.

| Capability | File | Symbols | Reusable? | Legal? |
|---|---|---|---|---|
| Single-URL audit | `core/index.js` | `lighthouse()` | Yes (npm dependency) | Yes (Apache-2.0) |
| User flows | `core/user-flow.js` | `startFlow`, `UserFlow` | Yes | Yes |
| Custom audits/plugins | `core/audits/audit.js`, `docs/plugins.md` | `Audit`, `Gatherer` | Yes | Yes |
| Agentic audits | `core/audits/agentic/*.js` | — | Yes, via config | Yes |

- **Recommendation: DEPENDENCY** (npm), run inside our own worker (or via Unlighthouse). For low-volume checks, Google's free PSI API is an alternative (API-SDK).
- Scores: coverage **3**; reusability **5**; licence **5**; maintenance **5**; security/tests **5**; cost **3** (Chrome compute; PSI free with quota); complexity **4**.

---

### 12. BERTopic
- URL: https://github.com/MaartenGr/BERTopic · HEAD (default branch) `9036123c97aaa9a6cc4bec4a6db1a7caf9209df6` (2026-08-27) · latest stable `v0.17.4` (2025-12-03, matches `pyproject.toml` version); a **`v1.0.0b1` pre-release tag (2026-11-01)** exists off the default branch · maintenance: **active but slowing** (single maintainer; main has had no commits since August; a 1.0 beta is in progress).
- Stack: Python ≥3.10. **Core dependencies: `hdbscan`, `umap-learn`, `sentence-transformers` (pulls in torch + transformers), `scikit-learn`, `pandas`, `plotly`, `numpy`, `llvmlite`** (numba via umap). Extras: `fastembed`, `flair`, `gensim`, `spacy`, `use` (TensorFlow), `vision`. A default install is heavy, about 2+ GB with torch. Documented **lightweight install**: `pip install --no-deps bertopic` + `model2vec` + `umap-learn` (`docs/getting_started/tips_and_tricks/tips_and_tricks.md` §"Lightweight installation").
- Tests/CI: 25 test-named files (`tests/test_bertopic.py`, `test_representation/`, `test_reduction/`…). CI: `testing.yml`. Advisories NOT VERIFIED.
- **Licence: MIT** (© 2024 Maarten P. Grootendorst). Commercial/SaaS OK.
- Verified symbols: `bertopic/_bertopic.py` `class BERTopic` (l.88), `__init__` (l.145), `fit` (l.350), **`fit_transform(documents, embeddings=None, images=None, y=None)`** (l.395; accepts **precomputed embeddings**), `transform` (l.545), `merge_topics` (l.2101), `reduce_topics` (l.2313). Pluggable backends `bertopic/backend/` (`_openai.py`, `_cohere.py`, `_model2vec.py`, `_fastembed.py`, `_sentencetransformers.py`…). Representations `bertopic/representation/` (`_keybert.py`, `_mmr.py`, `_openai.py`, `_litellm.py`, `_zeroshot.py`) handle LLM topic labelling. `bertopic/cluster/_base.py` (`BaseCluster`) and `bertopic/dimensionality/_base.py` (`BaseDimensionalityReduction`) are no-op shims, so UMAP or HDBSCAN can be swapped or skipped.
- **Suitability for prompt clustering**: AI prompts are short (5–20 words), number from hundreds to low thousands per tenant, and need stable, explainable groups plus dedup. BERTopic's value is c-TF-IDF topic keywords + LLM labels + topic reduction/merge. Its cost is a heavy dependency tree and run-to-run instability from UMAP's stochasticity unless seeded. At our scale, **a lighter pipeline is enough**: provider/API embeddings (or model2vec/fastembed), cosine near-duplicate threshold for dedup, then HDBSCAN (or agglomerative), then an LLM label per cluster. This reproduces BERTopic's core loop without torch. BERTopic remains a good offline/analyst tool, and with `--no-deps` + precomputed embeddings + `BaseDimensionalityReduction` it becomes mostly a c-TF-IDF/labelling layer.

| Capability | File | Symbols | Reusable? | Legal? |
|---|---|---|---|---|
| Topic modelling | `bertopic/_bertopic.py` | `BERTopic.fit_transform`, `reduce_topics`, `merge_topics` | Yes (pip) | Yes (MIT) |
| c-TF-IDF | `bertopic/vectorizers/` | `ClassTfidfTransformer` (NOT VERIFIED by open; directory exists) | Yes, copyable | Yes |
| LLM topic labels | `bertopic/representation/_openai.py`, `_litellm.py` | — | Yes | Yes |
| Embedding backends | `bertopic/backend/*` | — | Yes | Yes |

- **Recommendation: REJECT as a core runtime dependency for the SaaS. Use a lighter embedding + HDBSCAN pipeline**; COPY-AND-ADAPT ideas (c-TF-IDF keywords, topic merge). Optionally run it as a DEPENDENCY in an offline analytics worker with `--no-deps`.
- Scores: coverage **3** (clustering/labelling only); reusability **4**; licence **5**; maintenance **3**; security/tests **3**; cost **2** (torch/GPU-ish footprint by default); complexity **3**.

---

## Group summary

**Best in group per capability**
- Keyword research / backlinks / SERP / AI-answer tracking data: **OpenSEO**, but only as a well-built **DataForSEO** client (keywords, backlinks, SERP, llm_responses API proxy, llm_scraper consumer-UI scraping for ChatGPT/Gemini, llm_mentions). All paid per call.
- Rank tracking with cheap SERP APIs + NZ city: **SerpBear adapters** (SerpApi, ValueSERP, Serper, SearchApi, SpaceSerp, HasData and CrazySERP accept `city,New Zealand`). OpenSEO via DataForSEO location codes (NZ 2554 + DFS city list) is the more robust geo option.
- Brand mention / share of voice logic: **OpenSEO** `aiVisibilityMatching.ts`, `shareOfVoice.ts`.
- Technical SEO + agent-readiness audit: **SquirrelScan** (319 rules, MIT, local). Lighthouse adds performance/a11y and its new `agentic/` audits; Unlighthouse runs Lighthouse site-wide.
- Content crawling / page→markdown: **Crawl4AI**.
- Topic/prompt clustering: a **lightweight own pipeline**; BERTopic is optional and offline.
- GSC: OpenSEO (OAuth, multi-tenant) > SerpBear (service account, single user).

**Overlaps**
- OpenSEO ⊃ SerpBear for rank tracking + GSC (multi-tenant, but DataForSEO-only). SerpBear contributes only its provider adapters.
- Unlighthouse ⊃ Lighthouse orchestration. OpenSEO's audit uses DataForSEO's hosted Lighthouse, which could be replaced by Lighthouse/Unlighthouse run in-house.
- SquirrelScan overlaps OpenSEO's own `lib/audit` crawler and checks (SquirrelScan is far deeper) and Lighthouse's SEO/agentic audits.
- Crawl4AI deep crawl overlaps the SquirrelScan crawler, with different goals: content vs audit.

**Red flags**
1. **Crawl4AI licence rider**: a non-standard attribution requirement covering "public uses", so add a Credits/About line. It also has a long 2026 SSRF/RCE history and depends on a vendor-forked `unclecode-litellm`. Never expose its Docker server; enforce our own SSRF controls.
2. **SerpBear `proxy` scraper** scrapes Google directly against its ToS, is brittle and has no geo params. SerpBear is single user with SQLite, Next 12 and no CI tests.
3. **OpenSEO's** usefulness rests on DataForSEO costs per tenant. Its AI-answer data for ChatGPT/Gemini comes partly from DataForSEO's *consumer-UI scraper* (llm_scraper), which carries provider ToS risk passed through DataForSEO.
4. **SquirrelScan**: trademark policy means we must rebrand. Cloud-only features are not in the repo. It is pre-1.0 with very fast churn and a Bun runtime.
5. **Lighthouse** bundles `@sentry/node` error reporting (opt-in, but verify it is off). "Lighthouse" is a Google trademark.
6. **BERTopic**: its default install pulls in torch, so it is too heavy for the request path.
7. GitHub API metadata (stars, archived flag, advisories) could not be verified in this session.

# Group CF: SEOMachine, WordPress, Strapi, Keycloak, PostgreSQL (+pgvector), Playwright, Ollama (+ Postgres job queues)

Audit date: 2026-11-07. Clones are in `/tmp/claude-0/-home-user-fix-issues/49dbb1af-8bc0-5bd0-bf15-046140e71753/scratchpad/repos/<name>`.
**GitHub API note:** every `gh api repos/...` call returned HTTP 403 ("GitHub access to this repository is not enabled for this session"). So stars, archived flag, open issues and security advisories are **NOT VERIFIED** for every repo here. Maintenance was judged from the HEAD commit date and the tags returned by `git ls-remote`. Large repos were cloned with `--depth 1 --filter=blob:none --sparse`, and file lists come from `git ls-tree` on HEAD. No repo code was run.

---

### 13. SEOMachine
- URL: https://github.com/TheCraigHewitt/seomachine. Commit `120e7b46dc07c98382cd4f68ac5b6515ab9f2604` (2026-10-23). **No tags or releases.** Archived, stars and advisories: NOT VERIFIED (API 403). Maintenance: **active but small**. The last commit was 2 weeks ago, and it is a single-maintainer project with no release process.
- **What it is:** mostly a **Claude Code workspace**: 25 slash commands in `.claude/commands/*.md`, 11 agents in `.claude/agents/*.md`, about 30 marketing skills in `.claude/skills/*/SKILL.md`, and brand-context templates in `context/*.md`. It also has **real executable Python**: 25 modules in `data_sources/modules/` plus 11 top-level `research_*.py`/`seo_*.py` scripts, about 17.3k lines of Python. There is also a Dockerfile (python:3.12-slim) and 3 WordPress PHP mu-plugins.
- Stack: Python 3.12, requests, pandas, scikit-learn (TF-IDF + KMeans), textstat, nltk, bs4, markdown, google-analytics-data, google-api-python-client. It needs no database or Redis and uses a file-based workflow (`drafts/`, `published/`, `research/`).
- Tests/CI: `tests/` has 3 files with 8 test functions, plus a root `test_dataforseo.py`. **There is no `.github/` folder, so no CI.** Advisories: NOT VERIFIED.
- **Licence:** **MIT**. Root `LICENSE` says "Copyright (c) 2025 Castos (original development) / SEO Machine Contributors". No other licence files, and no ee/ or commercial headers. Commercial modification and white-label use are OK as long as the copyright notice is kept. No SaaS obligations. (The brief expected possibly no licence, but there is one.)
- External data sources, all paid or account-based APIs:
  - **DataForSEO** (paid): `data_sources/modules/dataforseo.py` `class DataForSEO` calls `/v3/serp/google/organic/live/advanced`, `/v3/dataforseo_labs/google/related_keywords/live`, `/v3/dataforseo_labs/google/domain_metrics/live` and `/v3/serp/google/organic/ranking_history/live`.
  - **GA4 Data API**: `google_analytics.py` `GoogleAnalytics`.
  - **Google Search Console**: `google_search_console.py` `GoogleSearchConsole`.
  - **Exa** (paid, optional): `exa_search.py` `ExaSearch`.
  - No direct OpenAI, Anthropic, Gemini or Perplexity calls in the Python code (grep found none). The LLM work happens inside Claude Code itself.
- **AI-citation work is prompt-only.** `.claude/commands/research-ai-citations.md` asks Claude to write 100+ prompts, cluster them and produce an audit template. Step 3 says to "**manually** run them through ChatGPT and/or Perplexity". **No code queries AI engines.**

| Capability | File path(s) | Symbols / entry points | What it actually does | Deps | Inputs→Outputs | Tests | Independently reusable? | Legal to copy? |
|---|---|---|---|---|---|---|---|---|
| WordPress publishing | `data_sources/modules/wordpress_publisher.py` | `WordPressPublisher.parse_draft_file`, `markdown_to_html`, `get_or_create_category/tag`, `create_draft`, `set_seo_meta`, `publish_draft` | Turns a Markdown draft with frontmatter into HTML. Sends `POST {site}/wp-json/wp/v2/{posts\|pages}` with `status:'draft'`, authenticated by Basic auth with an Application Password (`session.auth=(user, app_password)`). Sets Yoast/RankMath meta. | requests, markdown | .md file → WP draft id/link | none | Yes (about 500 lines) | Yes (MIT) |
| Yoast/RankMath meta via REST | `wordpress/seo-machine-yoast-rest.php`, `seo-machine-rankmath-rest.php`, `functions-snippet.php` | `register_post_meta`, `register_rest_field('post','yoast_seo'/'rankmath_seo')` | mu-plugins that expose SEO meta keys to the REST API | WordPress | n/a | none | Yes | MIT. It runs inside WP, and MIT is GPL-compatible. |
| SERP / rank / keyword data | `data_sources/modules/dataforseo.py` | `get_rankings`, `get_serp_data`, `analyze_competitor`, `get_keyword_ideas`, `get_questions`, `get_domain_metrics`, `check_ranking_history` | A thin wrapper around the **paid DataForSEO** API | requests | keywords/domain → JSON | `tests/test_dataforseo_resilience.py` | Yes | Yes |
| GSC quick wins / CTR / trends | `google_search_console.py` | `get_quick_wins`, `get_low_ctr_pages`, `get_trending_queries`, `get_position_changes`, `_calculate_commercial_intent` | GSC queries plus a heuristic commercial-intent score | google-api-python-client | site → ranked opportunities | none | Yes | Yes |
| GA4 page performance / decline | `google_analytics.py` | `get_top_pages`, `get_page_trends`, `get_conversions`, `get_traffic_sources`, `get_declining_pages` | GA4 Data API reports | google-analytics-data | property → tables | `tests/test_google_analytics_compat.py` | Yes | Yes |
| Opportunity scoring | `opportunity_scorer.py` | `OpportunityScorer.calculate_score` (volume, position, intent, competition, CTR, freshness, trend) | Weighted heuristic priority score | none | metrics → score + explanation | none | Yes, pure Python | Yes |
| Content QA / scoring | `content_scorer.py`, `readability_scorer.py`, `seo_quality_rater.py` | `ContentScorer.score` (`_score_humanity`, `_score_specificity`, `_score_seo`, `_score_readability`) | Rule-based content quality score | textstat, nltk | text → score report | none | Yes | Yes |
| AI-text scrubber | `content_scrubber.py` | `ContentScrubber.scrub` (watermark chars, em-dash replacement, AI phrases) | Normalises LLM output | none | text → cleaned text | none | Yes | Yes |
| Topic / keyword clustering | `keyword_analyzer.py`, `research_topic_clusters.py` | TF-IDF + `KMeans` | Basic lexical clustering. Embeddings would do better. | scikit-learn | keywords → clusters | none | Yes | Yes |
| AI-citation research | `.claude/commands/research-ai-citations.md` | prompt file | **Docs/prompt only.** Manual ChatGPT/Perplexity checks. | Claude Code | n/a | n/a | Only as a prompt template | Yes |

- **Recommendation: COPY-AND-ADAPT** for selected modules (WordPress publisher, GSC/GA4 helpers, scorers and scrubber, and the prompt templates as seed content). Do not run it as a service. It is single-user, file-based and has no tenancy.
- Scores: functional coverage 3 (content and SEO workflow, no AEO monitoring); reusability 4 (small, self-contained modules); licence 5 (MIT); maintenance 3 (recent commits but no releases or CI); security/tests 2 (8 tests, no CI); operating cost 2 (DataForSEO and Exa are paid; GA4/GSC are free); complexity 4.

---

### 14. WordPress (wordpress-develop)
- URL: https://github.com/WordPress/wordpress-develop. Commit `d2fc75d6e3bf522c3b699b09947669c77b78ec36` (2026-11-06). Latest tag **7.1.4**. Maintenance: **active**. Stars and advisories: NOT VERIFIED (API 403).
- PHP + MySQL/MariaDB. CI: 40 workflows in `.github/workflows/`, including `phpunit-tests.yml`, `end-to-end-tests.yml`, `phpstan-static-analysis.yml` and `coding-standards.yml`.
- **Licence: GPL-2.0-or-later** (`src/license.txt`: "either version 2 of the License, or (at your option) any later version"). **This is copyleft.** It is triggered when you *distribute* WordPress or code derived from it, such as a plugin or theme that links into WP's PHP runtime.
- **Calling the REST API over HTTP does not make our code a derived work.** Online Reset would be a separate program talking to the client's WP site over HTTP/JSON, at arm's length, and nothing is linked into WP. The GPL does not reach that code. The GPL is also not AGPL, so it has no network-use clause even for code that does run inside WP. **Caveat:** any companion WP plugin we ship (such as SEOMachine-style mu-plugins for Yoast meta) runs inside WP's PHP process. Treat that plugin as GPL-compatible and release it under GPL-2.0+ or MIT. It is a separate, small component. "WordPress" is a WordPress Foundation trademark, so do not use it in our product name.

| Capability | File path(s) | Symbols | What it does | Inputs→Outputs | Legal to copy? |
|---|---|---|---|---|---|
| Create/update posts | `src/wp-includes/rest-api/endpoints/class-wp-rest-posts-controller.php` | `register_routes()` (`/wp/v2/<rest_base>` CREATABLE → `create_item`; `/<rest_base>/(?P<id>[\d]+)` EDITABLE → `update_item`), `create_item`, `update_item` (handles `$request['meta']` via `$this->meta->update_value`), `get_items`, `delete_item` | REST contract for drafts and publishing (`status` = draft/pending/publish/future) | JSON → post object | We call it over HTTP and copy no code. GPL applies only if we copy code. |
| Auth for publishing | `src/wp-includes/class-wp-application-passwords.php`, `.../endpoints/class-wp-rest-application-passwords-controller.php` | `WP_Application_Passwords::create_new_application_password`, `check_password`, `hash_password`, `record_application_password_usage`, `PW_LENGTH = 24` | Per-user, revocable 24-character passwords for HTTP Basic auth over HTTPS | user → app password (UUID-tracked) | Integrate only |
| Rollback | `src/wp-includes/rest-api/endpoints/class-wp-rest-revisions-controller.php` | `register_routes()` (`/<parent_base>/(?P<parent>[\d]+)/revisions` and `/revisions/(?P<id>[\d]+)`): `get_items`, `get_item`, `delete_item` | **There is no "restore" endpoint in core.** To roll back, GET the revision, then POST its title/content/excerpt to the parent via `update_item`. Alternatively, store our own pre-publish snapshot. | revision id → content | Integrate only |

- **Recommendation: API-SDK-MCP.** Integrate through the REST API with Application Passwords. Do not fork or embed.
- Scores: coverage 4 (publishing); reusability 5 (stable HTTP contract); licence 4 (GPL is irrelevant for HTTP integration; a companion plugin needs care); maintenance 5; security/tests 5; operating cost 5 (client-hosted); complexity 4.

---

### 15. Strapi
- URL: https://github.com/strapi/strapi. Commit `1144bb487e20ea7adc3032d7d615f7d4426595cc` (2026-11-06). Latest stable tag **v5.61.0** (`packages/core/strapi/package.json` version 5.61.0). Maintenance: **active**. Stars and advisories: NOT VERIFIED. CI: `tests.yml`, `nightly.yml`, `checks.yml` and others (33 workflows).
- Node/TypeScript. Needs Postgres, MySQL or SQLite.
- **Licence: dual licence (MIT + Strapi Enterprise), source-available for EE.** The root `LICENSE` puts anything under an `ee/` directory under the Enterprise licence (`packages/core/admin/ee/LICENSE` points to https://strapi.io/enterprise-terms). Everything else is "MIT Expat", but only if you **also have no registered Strapi Cloud account**. Otherwise the cloud agreement terms apply.
  - Enterprise-licensed directories: `packages/core/admin/ee/` (server and admin), `packages/core/core/src/ee/` (licence verification and entitlements).
  - Two **whole packages** carry their own Enterprise LICENSE ("All software that resides within this directory... Enterprise License"): **`packages/core/review-workflows/`** and **`packages/core/content-releases/`**. This is easy to miss because they are not named `ee/`. They are gated at runtime by `strapi.ee.features.isEnabled('review-workflows' | 'cms-content-releases')`.
  - EE feature list from `packages/core/core/src/ee/license.ts` (`DEFAULT_FEATURES`, `PLAN_FEATURE_CATALOG`): **sso, audit-logs, review-workflows, cms-content-releases, cms-content-history, cms-advanced-preview**, plus seat enforcement (`admin/ee/server/src/services/seat-enforcement.ts`). It verifies licences against `https://license.strapi.io` and `resources/key.pub`.
- **Is Strapi needed?** No, if clients publish to WordPress or Shopify. Online Reset should publish *to* the client's CMS. A headless CMS only helps if we host our own content or client microsites. The features we would want from it (approval workflow, scheduled releases, audit logs, SSO) are exactly the Enterprise ones. **REJECT as core.** At most, offer it later as a publishing target through its REST API (Community Edition, MIT).
- Scores: coverage 2; reusability 3; licence 2 (EE traps); maintenance 5; security/tests 4; operating cost 3; complexity 3.

---

### 33. Keycloak
- URL: https://github.com/keycloak/keycloak. Commit `d4d55541da034a55a785c09922fcd62e51cd5bde` (2026-11-06). Latest tag **26.8.2**. Maintenance: **active** (CNCF incubating, Red Hat-backed). Stars and advisories: NOT VERIFIED. CI: `ci.yml`, `codeql-analysis.yml`, `conformance.yml`, `operator-ci.yml` and others.
- **Licence: Apache-2.0** (`LICENSE.txt`). No ee/ directories. Commercial and white-label use OK. Login themes are customisable, so you can rebrand. Keep the NOTICE file. No SaaS obligations.
- Stack: Java + Quarkus (`pom.xml` `quarkus.version` 3.40.1.1), Infinispan cache, needs an RDBMS (Postgres works). **Weight:** `docs/guides/high-availability/partials/concepts/perf_recommendations.adoc` says "base memory usage for a Pod ... is **1250 MB of RAM**". A single small instance needs roughly 1.3 GB.
- **Organizations (multi-tenant B2B) code:**
  - SPI: `server-spi/src/main/java/org/keycloak/organization/OrganizationProvider.java`, `InvitationManager.java`; `server-spi-private/.../organization/OrganizationSpi.java`.
  - JPA: `model/jpa/src/main/java/org/keycloak/organization/jpa/JpaOrganizationProvider.java`, `JpaInvitationManager.java`; entities `OrganizationEntity`, `OrganizationDomainEntity`, `OrganizationInvitationEntity`, `OrganizationIdentityProviderEntity`.
  - Cache: `model/infinispan/.../organization/InfinispanOrganizationProvider.java`.
  - Admin REST: `services/src/main/java/org/keycloak/organization/admin/resource/OrganizationsResource.java` (`create`, `search`, `get`, `getOrganizationCount`, `members/{member-id}/organizations`), plus `OrganizationMemberResource`, `OrganizationInvitationResource`, `OrganizationIdentityProvidersResource` and `OrganizationGroupsResource`.
  - Login: `organization/authentication/authenticators/browser/OrganizationAuthenticator.java` does domain-based IdP routing.
  - Token claims: `protocol/mappers/oidc/OrganizationMembershipMapper.java`, `OrganizationScope.java`.
  - About 67 organization-related test files.
- Capabilities: per-org members, invites, email domains, per-org SSO IdP (SAML/OIDC brokering), org claims in tokens, groups.
- **Lighter alternative (addition):** **Better Auth**, https://github.com/better-auth/better-auth, commit `ba59f5d8ecec4741718dc6d16ca135d810a1bef0` (2026-11-06), tag v1.7.18. **MIT** (`LICENSE.md`), no ee/ directories found. The organization plugin is at `packages/better-auth/src/plugins/organization/` (`index.ts`, `adapter.ts`, `has-permission.ts`, with tests). It runs inside the TypeScript app on the same Postgres, with no extra service or JVM. Supabase Auth and Ory: not checked.
- **Recommendation:** for the MVP, **DEPENDENCY on Better Auth**. Use Keycloak as a **SEPARATE SERVICE** only once enterprise clients ask for SAML SSO, per-org IdPs or a compliance-grade IAM.
- Scores (Keycloak): coverage 5; reusability 4 (OIDC standard); licence 5; maintenance 5; security/tests 5; operating cost 2 (JVM, about 1.3 GB RAM); complexity 2.

---

### 34. PostgreSQL (+ pgvector)
- URL: https://github.com/postgres/postgres (mirror). Commit `0607aa61090ac1b574f8bafe854c684195b31e16` (2026-11-06). Latest stable tag **REL_18_6**; 19 is at **REL_19_RC1**. Maintenance: **active**. CI: `.github/workflows/pg-ci.yml` (the main CI is Cirrus/buildfarm).
- **Licence: PostgreSQL License**, a permissive BSD/MIT-like licence (`COPYRIGHT`). Commercial use OK. You only need to keep the notice. No obligations.
- **RLS as the tenant-isolation primitive:** `src/backend/rewrite/rowsecurity.c` (947 lines).
  - `get_row_security_policies()` is called from the rewriter. It gathers policies with `get_policies_for_relation()` and adds permissive policies (OR'd together) and restrictive policies (AND'd) through `add_security_quals()` and `add_with_check_options()`. `check_role_for_policy()` filters policies by role.
  - `check_enable_rls()` decides between RLS_ENABLED and bypass.
  - Regression suite: `src/test/regress/sql/rowsecurity.sql` (2,655 lines).
  - Pattern: `tenant_id` column, `CREATE POLICY ... USING (tenant_id = current_setting('app.tenant_id')::uuid)`, `ALTER TABLE ... FORCE ROW LEVEL SECURITY`, and a non-owner, non-BYPASSRLS app role. Set `SET LOCAL app.tenant_id` per transaction, which needs care with poolers such as PgBouncer.
- **pgvector (addition):** https://github.com/pgvector/pgvector, commit `724588a5504b0e9c462e3126563370e8d50a01eb` (2026-11-04), tag v0.8.7. **PostgreSQL License** (`LICENSE`). Code: `src/hnsw*.c` (HNSW index), `src/ivf*.c` including `ivfkmeans.c` (IVFFlat), `src/vector.c`, `halfvec.c`, `sparsevec.c`. CI: `.github/workflows/build.yml`. Use it to store prompt/answer embeddings, for near-duplicate detection on prompts (cosine distance), and as the input to clustering. The clustering itself still happens in application code (HDBSCAN or k-means). pgvector is available on all major managed Postgres hosts.
- **Recommendation: DEPENDENCY** on Postgres as the system of record, with RLS and pgvector.
- Scores: coverage 4; reusability 5; licence 5; maintenance 5; security/tests 5; operating cost 5; complexity 4 (RLS needs disciplined session handling).

---

### 35. Playwright
- URL: https://github.com/microsoft/playwright. Commit `07c7069cdbb1f5c7331d3f4d2abd864dcfde745a` (2026-11-06). Latest tag **v1.65.0** (main is at 1.66.0-next). Maintenance: **active** (Microsoft). CI: `tests_primary.yml`, `tests_secondary.yml`, `tests_mcp.yml`, `tests_docker.yml` and others. About 579 `*.spec.ts` files.
- **Licence: Apache-2.0** (`LICENSE`). `NOTICE` credits code derived from Puppeteer (Apache-2.0). Third-party notices are in `packages/playwright-core/ThirdPartyNotices.txt`. The downloaded browser binaries have their own licences (Chromium BSD-style, Firefox MPL-2.0, WebKit LGPL/BSD). Using them unmodified is fine.
- Relevant code:
  - `packages/playwright-core/src/server/page.ts` `Page.screenshot()`; `screenshotter.ts` `screenshotPage()` and `screenshotElement()`; `frames.ts` (goto/content); `network.ts`; `har/harRecorder.ts` (HAR capture).
  - An MCP server now lives in-repo at `packages/playwright-core/src/tools/mcp/` (`browserFactory.ts`, `cdpRelay.ts`, ...).
- Uses: rendering JS-heavy pages for the audit crawler, full-page and element screenshots for reports, HAR/network capture, and Lighthouse runs over CDP.
- **Caution, consumer AI UIs:** automating chatgpt.com, gemini.google.com, perplexity.ai or Copilot through Playwright breaks those services' Terms of Use (they forbid automated or programmatic access and scraping). It is also fragile because of bot detection, CAPTCHAs and logins, and it creates account-ban and legal risk. Use the official APIs (OpenAI, Gemini, Perplexity Sonar, Anthropic), or licensed providers such as DataForSEO's AI Overview/LLM endpoints. Record the method for each engine. Results from the API and from the consumer UI can differ.
- **Playwright vs Crawl4AI:** Playwright is a browser-control library only. It has no crawl frontier, deduplication, robots.txt handling, link extraction policy, rate limiting or markdown/content extraction. Crawl4AI (Apache-2.0, built on Playwright) adds those. Either use Crawl4AI or a crawler such as Crawlee, or build the crawl loop ourselves on top of Playwright.
- **Recommendation: DEPENDENCY**, in a worker container for rendering and screenshots. **REJECT** using it for consumer AI-UI scraping.
- Scores: coverage 3; reusability 5; licence 5; maintenance 5; security/tests 5; operating cost 3 (browser RAM/CPU); complexity 4.

---

### 36. Ollama
- URL: https://github.com/ollama/ollama. Commit `5e983d4f800053c6f5691496b675c3212aa8099d` (2026-11-06). Latest tag **v0.40.15**. Maintenance: **active**. CI: `test.yaml`, `release.yaml` and others. 484 `_test.go` files.
- **Licence: MIT** (`LICENSE`, "Copyright (c) Ollama"). llama.cpp is pulled in at build time (`LLAMA_CPP_VERSION`, `llama/`); its licence (MIT) was **NOT VERIFIED** in this clone. **Model weights carry their own licences** (Llama community licence, Gemma terms, Qwen Apache-2.0, ...), so check each model for commercial use.
- Stack: Go 1.26 (`go.mod`) with GPU or CPU inference. It runs as a single binary or Docker container.
- **OpenAI-compatible API** (`server/routes.go`, about lines 2427–2449): `/v1/chat/completions` (`middleware.ChatMiddleware`), `/v1/completions`, `/v1/embeddings` (`middleware.EmbeddingsMiddleware` → `s.EmbedHandler`), `/v1/models`, `/v1/responses`, audio endpoints, and an **Anthropic-compatible `/v1/messages`** (`middleware.AnthropicMessagesMiddleware`). Native endpoints: `/api/chat`, `/api/generate`, `/api/embed`. The translation code is in `openai/openai.go`, `openai/responses.go`, `middleware/openai.go` and `middleware/anthropic.go`.
- Note: there are **cloud passthrough** paths (`cloudPassthroughMiddleware`) and `/api/experimental/web_search`/`web_fetch`, which call **ollama.com**. Disable these, or avoid "cloud" models, to keep it local and free.
- Suitability: good for a **zero-cost local proof of concept**. It can produce prompt embeddings (nomic-embed-text, bge, etc.), classify intent, extract brands and citations from stored answers, and draft content. Because it is OpenAI-compatible, the same client code can switch to paid providers later.
- **Important:** a local model's answers are **not** what ChatGPT, Gemini, Perplexity or AI Overviews tell users. They cannot measure AEO/GEO visibility, citations or share of voice. Ollama is only for *processing*, never as the *engine being monitored*.
- **Recommendation: SEPARATE SERVICE**, for dev and POC, with optional self-hosting later.
- Scores: coverage 3; reusability 5; licence 4 (MIT, but model licences vary); maintenance 5; security/tests 4 (the API has no auth by default, so never expose it publicly); operating cost 5 on existing hardware, 3 if GPU hosting is needed; complexity 5.

---

### Additional repositories: Postgres job queues (to avoid Redis)
| Repo | Commit / date | Latest | Licence | Evidence | Notes |
|---|---|---|---|---|---|
| **pg-boss**, https://github.com/timgit/pg-boss | `5abc8ce59f5fb5ef6dc54a61953740eeb04b9115` (2026-11-06) | package.json 12.38.1 | **MIT** (root; `packages/dashboard` and `packages/proxy` are also MIT) | `src/manager.ts` `send`, `sendAfter`, `work`, retryLimit, dead-lettering, singletonKey; `src/timekeeper.ts` `schedule(name, cron, ...)`; uses SKIP LOCKED (`src/plans.ts`); 112 test files; `ci.yml` | Cron scheduling, retries with backoff, DLQ, throttling and debounce, plus a dashboard. A good fit for scheduled AEO runs. |
| **graphile-worker**, https://github.com/graphile/worker | `b4f1b41c7abd747586879bf68a46a5a22897fa96` (2026-11-05) | v0.18.0 | **MIT** (`LICENSE.md`) | `src/runner.ts`, `src/cron.ts`/`crontab.ts`, `src/workerUtils.ts` `makeWorkerUtils`, `addJobAdhoc`; 29 test entries in `__tests__`; `ci.yml` | Low latency through LISTEN/NOTIFY, with crontab. Still pre-1.0. |

Recommendation: **DEPENDENCY on pg-boss**, which is more feature-complete for scheduling and DLQ and is at major version 12. Graphile-worker is an equally legal alternative.

---

## Group summary
- **Best in group per capability:**
  - Tenant isolation: Postgres RLS.
  - Embeddings, prompt dedup and clustering input: pgvector, with local embeddings from Ollama for the POC.
  - Job scheduling and retries without Redis: pg-boss.
  - Auth/orgs: Better Auth now, Keycloak Organizations later for enterprise SSO.
  - CMS publishing: the WordPress REST API with Application Passwords, using SEOMachine's `WordPressPublisher` as an MIT starting point.
  - Page rendering and screenshots: Playwright.
  - SEO content workflow, prompt templates and GSC/GA4 helpers: SEOMachine.
- **Overlaps:** Better Auth's organization plugin covers most of Keycloak Organizations at MVP scale. pg-boss and graphile-worker do the same job, and either replaces Redis/BullMQ. Strapi is unnecessary if publishing targets the client's WP or Shopify. Playwright overlaps with Crawl4AI, which is built on it, but on its own it is not a crawler.
- **Red flags:**
  1. Strapi's `review-workflows` and `content-releases` packages are Enterprise-licensed even though they are not under `ee/`. Strapi's MIT grant is also conditional on having no Strapi Cloud account.
  2. Automating consumer AI UIs with Playwright breaks their Terms of Service.
  3. Ollama and local models cannot stand in for monitoring real AI engines, and model-weight licences vary. Turn off Ollama's cloud passthrough.
  4. SEOMachine's AEO "citation research" is a manual prompt template, not code. Its data comes from paid DataForSEO and Exa. It has no CI and few tests.
  5. Any WordPress-side plugin we ship must be GPL-compatible. Plain HTTP integration is not affected by the GPL.
  6. Keycloak needs about 1.3 GB RAM per instance.
  7. GitHub API metadata (stars, advisories, archived) could not be checked: HTTP 403 in this session.

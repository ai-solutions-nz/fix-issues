# Source-code audit brief (shared by all audit agents)

Context: "Online Reset" is a planned commercial, multi-tenant SaaS (NZ-based) for SEO + AEO/GEO
(AI-answer visibility) + agency delivery + conversion/CRM. Benchmark competitor: Adaptify.ai.
We want to know exactly which open-source CODE can be legally reused, as a library, a fork, or a
separately-run service, behind ONE branded frontend. This is research only: no building, deploying or paid APIs.

## Rules
- Clone into `/tmp/claude-0/-home-user-fix-issues/49dbb1af-8bc0-5bd0-bf15-046140e71753/scratchpad/repos/<name>`
  with `git clone --depth 1 --filter=blob:limit=2m <url>` (for very large repos such as postgres,
  keycloak, wordpress-develop, superset, playwright, matomo, chatwoot, appsmith, also consider
  `--sparse` and check out only the directories you need). Record `git rev-parse HEAD` and the
  date of the HEAD commit (`git log -1 --format=%cI`).
- Get the latest release/tag: `git ls-remote --tags <url> | tail` or `git ls-remote --tags --sort=-v:refname`.
- Use `gh api repos/<owner>/<repo>` (fields: archived, pushed_at, stargazers_count, license, open_issues_count)
  and `gh api repos/<owner>/<repo>/releases/latest` and `gh api repos/<owner>/<repo>/security-advisories`
  if available. (gh is proxy-preconfigured; if it fails, say so and rely on git.)
- DO NOT run install scripts, `npm install`, `pip install`, docker, Makefiles or any repo code.
  Reading files only. (Exception: none. Do not execute untrusted code.)
- Read the ACTUAL source, not just READMEs. Cite real file paths and symbol names you opened.
  Never invent a path or function. If you could not verify something, write "NOT VERIFIED".
- Licensing: read LICENSE files at root AND search for other licence files in subdirs
  (`find . -iname 'LICENSE*' -o -iname 'COPYING*' -o -iname 'NOTICE*' | head -50`), look for `ee/`,
  `enterprise/`, `packages/*-ee`, commercial headers (`grep -rIl "Commercial License\|Enterprise License\|Sustainable Use\|BUSL\|Business Source" --include=* . | head`).
  State: exact SPDX licence; directory exceptions; commercial modification OK?; white-label OK? (trademark/branding clauses);
  SaaS/network-use obligations (AGPL §13); must modified source be disclosed?; enterprise-only parts.
- Tests/CI: list test dirs, approx count of test files (`find . -path ./node_modules -prune -o -name '*test*' -type f -print | wc -l`),
  CI workflows in `.github/workflows`.
- Be concise and factual. Tables welcome.

## Output
Write ONE Markdown file to
`/tmp/claude-0/-home-user-fix-issues/49dbb1af-8bc0-5bd0-bf15-046140e71753/scratchpad/findings/<GROUP>.md`
with, for EACH repo:

### <n>. <Name>
- Canonical URL; audited commit SHA + commit date; latest release tag + date; archived?; stars; maintenance status
  (active / slowing / uncertain / discontinued) with evidence (pushed_at, recent commit cadence `git log` not available on depth 1 — use gh api commits or releases).
- Languages/frameworks; install complexity (what services it needs: Postgres, Redis, ClickHouse, etc.)
- Tests & CI evidence; known security advisories (or "none found via API"/"not checked").
- Licence block (as above), flag GPL / AGPL / source-available / proprietary explicitly.
- **Reusable implementation table**: | Capability | File path(s) | Symbols / entry points | What it actually does | Deps | Inputs→Outputs | Tests | Independently reusable? | Legal to copy? |
  At least 3–10 rows for relevant repos, focusing on capabilities useful to Online Reset (see list below).
  Separate real executable code from placeholders, docs-only features, and calls to paid external services
  (name the external service, e.g. DataForSEO, SerpAPI, OpenAI, BrightData).
- **Integration recommendation**: one of COPY-AND-ADAPT / DEPENDENCY / FORK / SEPARATE SERVICE / API-SDK-MCP / REJECT, with reasoning.
- **Weighted score inputs** (0–5 each, or "uncertain"): functional coverage, reusability, licence suitability,
  maintenance, security/tests, operating cost/external dependency burden, implementation complexity (5 = easiest). Justify each in a few words.

End the file with a "Group summary" section: best-in-group per capability, overlaps (which repo can replace which),
and red flags.

## Capabilities Online Reset cares about
AI prompt discovery/generation/clustering/dedup; querying ChatGPT/Claude/Gemini/Perplexity/Copilot/Google AI Overviews
(note: API vs consumer-UI scraping vs paid provider — record exactly which); brand mention / position / citation
extraction & scoring; share of voice; scheduling of runs; geo/location targeting (country/city); keyword research;
rank tracking; backlink data; technical SEO audit / crawler / Lighthouse; topic clustering; content
research/drafting/QA; CMS publishing (WordPress/Shopify/Strapi); multi-tenancy / orgs / RBAC; reporting/dashboards;
agent orchestration / workflows / retries / human approval; LLM tracing/cost; LLM evals; CRM / pipeline; chat/inbox;
web analytics & attribution; email/marketing automation; booking; SMS/missed-call; auth/SSO.

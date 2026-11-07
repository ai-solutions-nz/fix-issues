# 01 — Adaptify Capability Benchmark

**Subject:** Adaptify (https://adaptify.ai/), an AI SEO/GEO platform for agencies
**Research date:** 2026-11-07
**Raw evidence:** [`evidence/adaptify.md`](evidence/adaptify.md) has the full table, with quoted snippets and every source URL.

## Research limitation (read first)

The research session's network policy blocked `adaptify.ai`, `docs.adaptify.ai` and `web.archive.org`. Every attempt to fetch them failed with a DNS error or a refusal. All first-party (FP) evidence therefore comes from **search-engine snippets** of Adaptify's own pages: `adaptify.ai/docs/*`, `docs.adaptify.ai/*`, `/features/*` and `/blog/*`. Snippets can paraphrase or merge pages. **Re-verify every quote against the live site before using it externally.** Owner action: allow `adaptify.ai` and `docs.adaptify.ai` in the environment network settings, then run this check again (see 10-executive-decision-report.md, decision D1).

Absence of evidence is recorded as **"Not established"**. It does **not** mean Adaptify lacks the feature.

## Evidence classes

| Class | Meaning |
|---|---|
| **Verified (docs)** | First-party documentation describes how the feature works or is configured. |
| **Partial** | Some of it is documented and some is marketing, or the specifics are missing. |
| **Vendor-claimed** | Only marketing or feature-page claims; no documentation of how it works. |
| **Not established** | No evidence found in the sources available. |

## Capability classification

| # | Capability | Class | Key evidence (FP unless marked 3P) |
|---|---|---|---|
| 1 | AI prompt discovery, imports, clustering | **Verified (docs)** | Generates prompts from the site and keywords; bulk CSV import; dedup and "top up"; "AI clusters represent broader AI visibility topics" (docs/geo-strategy, docs/clusters, features/ai-visibility). |
| 2 | AI platform monitoring & scheduled tests | **Partial** | Feature page: ChatGPT, Claude, Gemini, Perplexity, Copilot, tested "directly through their native APIs" (i.e. **model APIs, not the consumer apps**), retest "every 14 days". The docs don't describe scheduling. **Google AI Overviews / AI Mode: not established.** GEO Performance "uses Bing data". |
| 3 | Competitor visibility intelligence | **Vendor-claimed** | Results include "competitor appearances"; a blog post recommends share of voice. No docs page. |
| 4 | GEO & SEO opportunity identification | **Verified (docs)** | GEO Potential score 0–100 from "cited evidence, search interest, content gaps, topic breadth"; keyword "Potential" from volume, difficulty and domain authority. |
| 5a | Keyword research | **Verified (docs)** | Cluster/keyword docs; "local keyword research". |
| 5b | Rank tracking | **Partial** | GSC "helps us monitor rankings"; "Adaptify-tracked keywords"; local map ranking is **beta**. Engines, frequency and location granularity are undocumented. |
| 6 | Technical SEO/GEO audit | **Partial** | SEO score, GEO score, Combined = average. The check list isn't public. |
| 7 | Automated content research/writing/optimisation | **Verified (docs)** | Cadence "disabled/weekly/regular/daily/boost"; "Create Article Now"; GEO articles keep their cluster and prompt context. |
| 8 | Content QA | **Verified (docs)** | "20+ quality checks", per-site checklist, custom checks, auto-rewrite on failure. No plagiarism check found. |
| 9 | CMS publishing | **Verified (docs)** | WordPress (plugin + REST, CRON fallback), Webflow, Shopify, Wix, Squarespace, Duda, Ghost, HubSpot, manual. |
| 10 | Backlinks | **Partial** | PR/journalist-query outreach from a "verified client-branded inbox" is documented. Volume/DR guarantees conflict between sources (DR30+ up to 20/mo vs DR40+ 1–6/mo). Backlink *discovery/gap* tooling: vendor-claimed (blog only). |
| 11 | Client onboarding & campaign mgmt | **Partial** | White-label onboarding pages and per-website settings. No campaign object documented. |
| 12 | White-label portal, approvals, reporting | **Verified (docs)** | Custom domain, logo, colours, sender identity, PDF reports, AI-written summaries; agency **and** customer approval gates before publishing. |
| 13 | Proposals & follow-ups | **Verified (docs)** | Proposal Mode from a prospect's URL; follow-ups on Day 3/7/14; proposal-view tracking. |
| 14 | Agent orchestration | **Not established** | "Autopilot" positioning only; no orchestration layer is documented. |
| 15 | Performance measurement & attribution | **Partial** | GSC connection and performance report are documented. **GA4, conversions, CRM, booking and revenue attribution: not established.** |

## Pricing (third-party only; Adaptify's own pricing page was not reached)

| Tier | Price (USD) | Source type |
|---|---|---|
| Single Site | $499/mo | 3P listings (SoftwareAdvice, review blogs) |
| Agency (3 sites) | $999/mo, then about +$299/site | 3P (Capterra) |
| Agency+ | Custom | 3P |

Other listed tiers ($49, $199, $899) conflict with these and look stale.

## Confirmed competitive baseline

Online Reset must match **at minimum** these first-party-documented capabilities:

1. Prompt and cluster model for AI visibility, with generation, CSV import and dedup.
2. A potential/opportunity score for prompts (GEO) and keywords (SEO).
3. Scheduled testing across ChatGPT, Claude, Gemini, Perplexity and Copilot **via model APIs**. The 14-day cadence and the engine list come from the feature page, so treat them as the target even though they are only partially documented.
4. Keyword research with a content plan and scheduled automated article generation.
5. Content QA: a configurable per-site checklist (20+ checks) with auto-rewrite.
6. Publishing to at least WordPress, Shopify, Webflow and Wix, plus a manual path.
7. Site audit producing SEO, GEO and combined scores.
8. White-label portal: custom domain, branded PDF reports, AI summaries, agency and client approval gates.
9. Proposal generator with automated Day 3/7/14 follow-ups and view tracking.
10. GSC integration and a performance report.
11. PR-style backlink outreach from a client-branded inbox.

## Where no Adaptify capability was found (opportunity, not a proven gap)

- Google AI Overviews / AI Mode measurement.
- Methodology transparency: raw-evidence retention; consumer-app vs API distinction.
- City-level (e.g. NZ city) geographic controls for AI answers. Only "local keyword research" and a local-map beta were found.
- GA4, conversion, CRM, call/SMS, booking or revenue linkage.
- An explicit agent-orchestration and audit-log layer.

These are treated in 09-competitive-differentiation.md as **"not publicly established"**, not as Adaptify weaknesses.

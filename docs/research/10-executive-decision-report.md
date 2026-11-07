# 10 — Executive Decision Report: Online Reset

*For the business owner. Plain-language summary. The technical evidence is in documents 01–09 and in `evidence/`.*

## The answer in one paragraph

You do not need to build Online Reset from scratch, and you do not need to run 36 applications. **One open-source project, Elmo, already contains most of the platform skeleton.** It provides:

- multiple client accounts with permissions,
- a white-label mode,
- AI-answer monitoring through the official ChatGPT and Claude APIs,
- scheduled tests,
- permanent storage of raw evidence,
- a single PostgreSQL database.

It is MIT-licensed, so we can modify it, rebrand it and sell it as our own service. We add proven pieces from about eight other projects, connect to the tools clients already use, and build the parts that make Online Reset different. That difference is **New Zealand city-level accuracy, evidence anyone can check, and the link from being found to getting enquiries, bookings and revenue.**

## 1. Which source-code projects should we use?

| Role | Project | How |
|---|---|---|
| **Platform base** | **Elmo** | We take a copy (fork) and make it Online Reset. |
| AI-answer engine improvements | **Canonry**, **Limelit Open** | Copy specific modules. |
| Keyword, ranking and backlink data | **OpenSEO** (code that talks to DataForSEO); **SerpBear** (backup data sources) | Copy modules. |
| Website audits | **SquirrelScan** + Google **Lighthouse** | Run behind the scenes. |
| Content quality and workflow | **SEOMachine** (scorers), **Promptfoo** (QA tests), **LangGraph.js** (approval workflows) | Copy and use as libraries. |
| Publishing | WordPress and Shopify connections, using code from **Canonry** and **Activepieces** | Copy modules. |
| Visitor tracking and attribution | **Umami** | Run behind the scenes. |
| Foundations | PostgreSQL + pgvector, pg-boss, Better Auth, Playwright | Libraries. **Ollama** for free local testing only. |

## 2. Which exact components do we take from each?

See 06 for the full list. The most important are:

- **Elmo:** almost all of it, except its own branding, its marketing site and its usage tracking, which we remove.
- **Canonry:** the code that tells ChatGPT, Claude and Perplexity *which city* a question comes from; prompt grouping; share-of-voice maths; WordPress publishing.
- **Limelit:** a brand-mention and ranking detector that needs no paid AI judge. **We ran its tests locally and they passed.**
- **OpenSEO:** the DataForSEO data client; Google Search Console and GA4 connections.
- **SEOMachine:** content scoring rules; Search Console "quick win" logic.
- **Chatwoot:** only the response-time calculation method.
- **Langfuse:** only its AI model price table.

## 3. Which projects should we reject?

| Rejected | Reason |
|---|---|
| **Windmill, EspoCRM** | Their licences would stop us rebranding, or would force us to publish our code. |
| **Activepieces, Flowise, Appsmith, Langfuse, Strapi, Chatwoot, Twenty** (as platforms) | The features we would need (multi-client, branding, single sign-on) are paid enterprise add-ons. We take only their free parts. |
| **OneGlanse**, plus parts of Canonry and SerpBear | They scrape the ChatGPT or Google websites with disguised browsers, which very likely breaches those companies' terms. |
| **Matomo, Mautic, Easy!Appointments, Listmonk** | Heavy, built for one business per install, or "copyleft" licences. |
| **Superset, Langflow, BERTopic, Keycloak, Crawl4AI** | Not needed now; each adds cost or complexity. Some may come back later. |

## 4. What existing code covers Adaptify's functions?

Adaptify's own documentation confirms nine core functions. Existing code covers the **monitoring, prompt research, audits, keyword data, content QA building blocks, WordPress/Shopify publishing, white-label portal base and Search Console** functions.

These Adaptify functions need **new code**: the **proposal generator with Day 3/7/14 follow-ups**, **backlink outreach**, **per-client branding with custom domains**, and **publishing to Webflow, Wix, Squarespace, Duda, Ghost and HubSpot**.

*Caveat:* Adaptify's website was blocked from our research environment. Its features were confirmed from search-engine copies of its own documentation pages, and these should be re-checked (decision D1).

## 5. What remains to be developed?

1. **Real database-level separation between clients.** Elmo separates clients in its application code only. We found it switches on the database protection without defining any rules. This is the top security task.
2. New Zealand city targeting and the evidence and methodology layer.
3. The content workflow: research, draft, quality check, approvals, publish, roll back, re-measure.
4. Client portal branding, reports, and the proposal engine.
5. The conversion engine: enquiry tracking, missed-call detection, SMS follow-up with consent, response times, CRM/booking connections (HubSpot, ServiceM8, Tradify, Fergus, Calendly), and outcome reports.

## 6. What can make Online Reset better than Adaptify?

These are evidence-based differences. "Not established" means Adaptify does not publicly show the feature; it does not prove Adaptify lacks it.

1. **Every number can be checked.** The raw AI answer, engine, model, date, question and city are stored, and different measurement methods are never mixed. *Adaptify: not established.*
2. **NZ city-level results** (Auckland vs Wellington vs Christchurch). *Not established.*
3. **"Who the AI recommends instead of you, and why"**, with the sources it cites. *Vendor-claimed only.*
4. **Priorities based on business value**, not just search volume. *Partial.*
5. **Landing-page conversion readiness.** *Not established.*
6. **Missed calls and response times.** *Not established.*
7. **Visibility → enquiry → booking → revenue reporting** that labels each figure as observed, tracked, inferred or unknown. *Not established.*
8. **Every change is approved, reversible and re-measured.** *Partial.*

## 7. What will the final platform look like?

- **One website and one login** for agency staff and their clients, under the Online Reset brand.
- **One database**, with each client's data walled off at database level.
- **Background workers** run scheduled AI tests, ranking checks, audits, content drafting and data syncs.
- **Approvals are mandatory** before anything is published or sent.
- **Two or three internal helper services** (audits, visitor analytics, an optional CRM) that customers never log into.
- **Interchangeable data suppliers**, so we can switch AI or data vendors without rebuilding.

## 8. What will initial development and testing cost?

- **Software licences: NZ$0.** Every component we use is free to use commercially, as long as we avoid the enterprise add-ons, which we do.
- **Local proof of concept: NZ$0** beyond your existing computer and Claude Code. It proves:
  - client separation,
  - prompt research,
  - mention detection,
  - audits,
  - the content workflow with approvals,
  - WordPress publishing and rollback,
  - visitor attribution,
  - a simulated missed-call → SMS flow.
- **What NZ$0 cannot prove:** what the real ChatGPT, Gemini and others say about a business. That needs their paid APIs. **The smallest valid test is 120 AI calls** (10 questions × 4 AI engines × Auckland × 3 repeats), with hard spending caps. First we check whether any free tier or trial credit covers it.
- **We have not quoted prices.** We could not verify them, and the brief forbids guessing. Document 07 lists the 10 quotes to obtain, and gives the formula that turns them into a monthly cost.

## 9. What recurring services will cost money?

| Service | Volume per client per month (assumption: 50 questions, 4 engines, every 14 days, 1 city, 100 keywords tracked weekly, 4 articles) |
|---|---|
| AI engine APIs (OpenAI, Anthropic, Google, Perplexity) | about 434 grounded calls, plus content and report AI calls (~26) |
| SEO data (DataForSEO or similar) | about 435 ranking checks, plus small keyword and backlink volumes |
| Optional: Google AI Overviews / Copilot via a data vendor | about 326 requests |
| Hosting | 1 server + managed database (pilot), growing to several servers at 50 clients |
| SMS / calls (Twilio or the client's phone system), email sending | Depends on usage |

At 10 clients, multiply by 10; at 50 clients, by 50.

**The biggest cost lever is method, not client count.** Weekly tests, three cities and repeat runs can multiply AI costs 18×. These should be priced as plan tiers.

## 10. What should Claude Code build first?

Once you approve:

1. **Phase 0:** copy Elmo, remove its branding and tracking, and add automatic licence checks.
2. **Phase 1:** database-level client separation and the evidence model.

These cost nothing but development time, and they close the biggest security gap. The AI-visibility engine (Phase 2) comes next, ending with the 120-call paid test.

## 11. Decisions that need your approval

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Allow `adaptify.ai` in this environment's network settings, so the benchmark can be re-verified from the live site. | Yes, before any external use of the comparison. |
| **D2** | Obtain the 10 price quotes, and approve a capped budget for the first 120-call AI test (plus a DataForSEO test). | Yes, with hard caps. |
| **D3** | Whether to measure **consumer** AI surfaces (Google AI Overviews, Copilot, the ChatGPT app) through a paid data vendor, and which vendor, after checking its terms. | Start with official APIs only; add one vendor for Google AI Overviews after due diligence. |
| **D4** | Commit to **Elmo as the base** and a **single TypeScript stack**. | Yes. |
| **D5** | Connect to clients' existing CRM, booking and inbox tools, or host our own (Twenty CRM, Chatwoot). | Connect to existing tools first. |
| **D6** | Choose the SMS/telephony provider, email-sending provider and hosting region. | NZ or AU hosting for Privacy Act reasons. |
| **D7** | Check the public security advisories for each adopted project (our environment could not reach GitHub's API). | Yes, before the build. |
| **D8** | **Approve the start of Phase 0–1.** | Yes. |
| **D9** | Brief legal review of licence notices, the Twenty API exception if used, and NZ messaging law for outreach and SMS. | Yes, before the first paying client. |

# 09 — Competitive Differentiation

## Ground rules

1. **Matching Adaptify comes first.** Section 1 maps every documented Adaptify capability to Online Reset code.
2. **A differentiator counts only if** it delivers measurable client value, it can be built from identified code plus stated custom work, and its success can be measured objectively.
3. **"Adaptify status" uses the evidence classes from 01.** Where nothing was found, the status is **"not publicly established"**. That is not proof Adaptify lacks the capability.

## 1. Parity map: verified Adaptify baseline → Online Reset

| Adaptify capability (from 01 confirmed baseline) | Online Reset implementation | Phase |
|---|---|---|
| Prompts + clusters, CSV import, dedup | Elmo `suggestPrompts` and bulk import; Canonry `clusterByCosine` on pgvector | 2 |
| GEO Potential and keyword Potential scores | Opportunity score (§3), built from Canonry `gap-query-score` and SEOMachine `OpportunityScorer` | 3 |
| Scheduled tests across ChatGPT, Claude, Gemini, Perplexity and Copilot via APIs (from a feature page, so only partially documented) | Elmo providers + Canonry geo; Copilot through a vendor adapter | 2 |
| Keyword research + content plan + scheduled article writing | OpenSEO DataForSEO client; LangGraph.js content graph | 3–4 |
| 20+ per-site QA checks with auto-rewrite | Per-site checklist (SEOMachine scorers ported) + Promptfoo rubric + bounded rewrite loop | 4 |
| Publishing to WP, Shopify, Webflow, Wix, Squarespace, Duda, Ghost, HubSpot | WP and Shopify in Phase 4; the others are custom adapters later | 4+ |
| Site audit with SEO, GEO and combined scores | SquirrelScan (319 rules) + Lighthouse + Elmo site-audit | 3 |
| White-label portal, custom domain, PDF reports, agency and client approvals | Elmo whitelabel mode, extended per tenant; approvals; Playwright PDF | 4 |
| Proposal Mode with Day 3/7/14 follow-ups and view tracking | Custom proposal engine | 4 |
| GSC integration and performance report | OpenSEO GSC client | 3 |
| PR backlink outreach from a client inbox | Custom outreach with approval and consent records | 4+ |

**Parity gap that remains after Phase 4:** CMS breadth (Webflow, Wix, Squarespace, Duda, Ghost and HubSpot CMS) and PR-style journalist outreach. Both are planned, but they are not in the MVP.

## 2. Differentiators

### D-1. Evidence-backed, method-separated AI visibility

- **Commercial value.** Clients and agencies can defend every number. They see exactly which engine, model, date, query and location produced it, and can open the raw answer. This reduces disputes and churn.
- **Reusable code.**
  - Elmo append-only `prompt_runs.raw_output` + `reprocess.ts`.
  - Canonry `answer-evidence.ts` (`deriveRetrievalStatus`, `resolveLocationTreatment`).
  - Limelit methodology with `n` on every metric.
  - Canonry SoV publication floors.
- **Missing implementation.** The `collection_method` separation, `location_applied`, methodology versioning, and an evidence viewer in the portal.
- **Client data required.** None beyond onboarding.
- **Objective measure.**
  - 100% of reported metrics link to their run IDs.
  - Re-processing stored evidence reproduces the published metrics exactly.
  - The reported variance between replications shows whether a change exceeds noise.
- **Adaptify equivalent.** Not publicly established. Adaptify states that it uses "native APIs", but no evidence viewer or method separation was found.

### D-2. NZ local-market accuracy (city-level)

- **Commercial value.** NZ service businesses compete city by city. National-level or US-default results misstate their visibility.
- **Reusable code.**
  - Canonry `user_location` for OpenAI, Claude and Perplexity.
  - The DataForSEO location model (OpenSEO `serp-locations.ts`).
  - Limelit country map (NZ = 2554).
  - SerpBear city strings as a fallback.
- **Missing implementation.** An NZ city/region catalogue, per-prompt location targets, a "location applied" flag in the evidence, and a city comparison view.
- **Client data required.** Service areas.
- **Objective measure.** For each prompt, compare results across Auckland, Wellington and Christchurch with the same method, and report the share of prompts whose recommended-business set differs by city. A difference shows the city controls have an effect. If none is found, we report that honestly.
- **Adaptify equivalent.** Not publicly established. Adaptify documents local keyword research and a local-map beta, but no city-level AI-answer targeting was found.

### D-3. Competitor recommendation-gap analysis

- **Commercial value.** Shows *which competitor* the AI engine recommends instead of the client, for *which buyer question*, and *which sources* it cites. That points to a concrete fix: a page, a citation source or a review profile.
- **Reusable code.**
  - Canonry `extractRecommendedCompetitors`, `computeCompetitorOverlap`, `gap-query-score.ts`, `content-targets.ts`.
  - Elmo citation classification.
- **Missing implementation.** Mapping each cited source to an action ("competitor is cited from site X; client is absent there").
- **Client data required.** A competitor list, which onboarding can also infer.
- **Objective measure.** The number of gap prompts closed, meaning the client starts appearing, after a targeted change, measured by the same method against a frozen prompt set.
- **Adaptify equivalent.** Vendor-claimed ("competitor appearances").

### D-4. Business-specific commercial prioritisation

- **Commercial value.** Work is ranked by expected business value, not by search volume alone.
- **Reusable code.** SEOMachine `OpportunityScorer` (weighted heuristic) and Canonry insights.
- **Missing implementation.** The scoring formula in §3.
- **Client data required.** Services, margins or average job value (optional), capacity, and target areas.
- **Objective measure.** The share of completed opportunities that produce a measured visibility or enquiry change within 60 days, reported with attribution class.
- **Adaptify equivalent.** Partial. Its documented GEO and keyword "Potential" scores use volume, difficulty, DA and cited evidence, with no commercial value input found.

### D-5. Service-page conversion readiness

- **Commercial value.** Being recommended is wasted if the landing page cannot convert: no click-to-call, slow on mobile, no service-area clarity.
- **Reusable code.**
  - SquirrelScan rules (content, local, legal, mobile, performance, a11y).
  - Lighthouse.
  - Umami funnels and goals.
- **Missing implementation.** A conversion checklist and a mapping from AI-cited URLs to their landing pages.
- **Client data required.** Site access (public) and, optionally, the Umami tracker.
- **Objective measure.** Conversion-checklist pass rate before and after, plus change in tracked enquiry rate per landing page (tracked attribution).
- **Adaptify equivalent.** Not publicly established. Adaptify's audit covers SEO and GEO scores; no conversion audit was found.

### D-6. Missed enquiries and response time

- **Commercial value.** For trades, a missed call is often a lost job. Measuring and recovering missed calls has direct revenue value.
- **Reusable code.**
  - Chatwoot MIT first-response-time algorithm (`reporting_event_listener.rb#first_reply_created`, business-hours helper).
  - Twilio handling patterns.
- **Missing implementation.**
  - Missed-call detection: **custom**, because Chatwoot's version is Enterprise-licensed.
  - Consent-based SMS follow-up.
  - A response-time dashboard.
- **Client data required.** Call events (a Twilio forwarding number or VoIP webhooks), plus enquiry and inbox timestamps.
- **Objective measure.**
  - Missed-call rate.
  - Median first-response time, in business hours.
  - Share of missed calls followed up within N minutes.
  - Enquiries recovered (observed outcome).
- **Adaptify equivalent.** Not publicly established.

### D-7. Visibility → enquiry → booking → revenue reporting with honest attribution

- **Commercial value.** The client sees outcomes, not only rankings. Credibility comes from labelling exactly how each link was made.
- **Reusable code.**
  - Umami UTM/gclid/fbclid capture and `getAttribution` (first and last click).
  - CRM connectors (Activepieces HubSpot logic).
  - Twenty API (optional).
- **Missing implementation.**
  - The outcome model carrying the four attribution classes.
  - An AI-assistant referrer list.
  - ServiceM8, Tradify and Fergus connectors.
  - Booking connectors.
- **Client data required.** Tracker install, CRM or job-system access, and optionally revenue per job.
- **Objective measure.** The share of enquiries with a known source (tracked attribution coverage) rises over time, and "unknown" is reported, never hidden.
- **Adaptify equivalent.** Not publicly established. Only GSC performance is documented, with no GA4, conversion or CRM link found.

### D-8. Human-controlled execution with measured results

- **Commercial value.** Agencies can safely automate more, because each change is approved, versioned, reversible and re-measured.
- **Reusable code.**
  - LangGraph.js `interrupt()` with `PostgresSaver`.
  - GeoLook ticket and verify concept.
  - WordPress revisions API.
- **Missing implementation.**
  - Change tickets with acceptance criteria.
  - Snapshots and rollback.
  - A re-measure job tied to each ticket.
- **Client data required.** CMS credentials (Application Password).
- **Objective measure.**
  - 100% of published changes have an approval and a snapshot.
  - Median time from approval to re-measurement.
  - Share of tickets whose acceptance criteria pass on verification.
- **Adaptify equivalent.** Partial. Adaptify documents approval gates, but no rollback or per-change re-measurement was found.

## 3. Opportunity scoring v1 (proposal for owner review)

```
priority = demand × gap × winnability × commercial_value × confidence
  demand            = normalised(search volume, prompt-cluster size, GSC impressions)        [OpenSEO / GSC]
  gap               = 1 − client visibility share for the cluster (same method, same location) [Elmo + Canonry]
  winnability       = f(competitor strength, citation sources reachable, page exists?)        [Canonry gap score, SquirrelScan]
  commercial_value  = client-supplied service value × service-area match (default 1 if unknown)
  confidence        = f(n runs, replication variance)  → down-weights thin evidence          [Limelit n, Canonry floors]
```

The score is shown with all five components visible. Each component is stored, so the ranking can be explained and reproduced.

## 4. Summary

| Area | Position vs Adaptify (on public evidence) |
|---|---|
| Core SEO/GEO automation, portal, approvals, proposals | **Parity target**, reached after Phase 4. CMS breadth comes later. |
| Methodology transparency and evidence | **Differentiator** (D-1). |
| NZ city-level accuracy | **Differentiator** (D-2). |
| Competitor gap → action | **Stronger** (D-3; Adaptify's is vendor-claimed). |
| Commercial prioritisation | **Stronger** (D-4; Adaptify's is partial). |
| Conversion, missed calls, response time, revenue | **Differentiator** (D-5 to D-7; Adaptify's are not publicly established). |
| Controlled execution with rollback and re-measurement | **Stronger** (D-8; Adaptify's is partial). |

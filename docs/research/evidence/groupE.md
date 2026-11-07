# Group E: CRM / inbox / analytics / marketing automation / booking / email

Audit date: 2026-11-07. Method: shallow clones (`--depth 1 --filter=blob:limit=2m`, later deepened to about 150 commits with `--filter=tree:0` to measure cadence). Large repos (Twenty, Matomo) were inspected through `git ls-tree` / `git grep HEAD` and a partial checkout.
**`gh api` was blocked for all 8 repos** ("GitHub access to this repository is not enabled for this session", HTTP 403). As a result, stars, open issues, the archived flag and security advisories are **NOT VERIFIED**. Maintenance status is based on commit dates and `git ls-remote` tags. None of the repos looks archived, since every one has commits in the last 3 weeks.
No repo code was executed.

---

### 25. Twenty CRM
- URL https://github.com/twentyhq/twenty. Audited commit `d539d31fee6585fe036c5d9ac998954901be813f` (2026-11-07). Latest tag `v2.9.0` (2026-06-04). Tagging appears to have stopped after v2.9.0, yet the 150 most recent commits span only 2026-11-04 to 2026-11-07. Status: **very active**.
- Stack: TypeScript Nx monorepo, NestJS server (`packages/twenty-server`), React front, GraphQL + REST + MCP. Requires **Postgres 16 + Redis** and a worker (`packages/twenty-docker/docker-compose.yml`). Helm and k8s manifests are included.
- Tests/CI: about 5,169 `*.spec|test.ts(x)` files. 60+ workflows (`ci-server.yaml`, `ci-server-integration-test.yaml`, `ci-e2e-main.yaml`, `ci-breaking-changes.yaml`, ...). Advisories: not checked (API blocked).
- **Licence (mixed):**
  - The root `LICENSE` is **AGPL-3.0**, with two qualifications plus an additional permission:
    - (a) Every file headed `/* @license Enterprise */` falls under the **"Twenty.com Commercial License"** (`LICENSE` line 727 and following). Production use requires a paid Enterprise subscription. Copying and modifying are allowed only for dev/test, and Twenty owns any modifications.
    - (b) **MIT** applies to `twenty-cli`, `twenty-sdk`, `twenty-client-sdk`, `create-twenty-app`, `twenty-shared`, `twenty-ui` and `packages/twenty-apps`.
    - (c) A new **"Twenty Application Exception" (AGPL §7 additional permission)**: an "Application" that talks to Twenty only through its published REST/GraphQL APIs, webhooks, manifest, logic functions, front components or SDKs, and does **not** incorporate or modify Twenty source, is *not* covered by the AGPL and may be proprietary. Point 4 limits this: if you modify Twenty, AGPL §13 applies in full.
  - **Enterprise-marked code:** 639 files under `packages/twenty-server` and `twenty-shared`, plus 56 in `twenty-front`. Features and directories:

    | Feature | Directories |
    |---|---|
    | Billing / Stripe | `engine/core-modules/billing` (211 files), `billing-webhook` |
    | Row-level security / record permissions | `engine/permissions/internal/{rls,record-share,private-record,record-permission-orm,principal,role,combine}`, `metadata-modules/row-level-permission-predicate` |
    | SSO SAML/OIDC | `engine/core-modules/sso`, `auth/.../saml.auth.strategy.ts`, `oidc.auth.strategy.ts` |
    | Validation rules | `metadata-modules/validation-rule` |
    | Related-record paths | `metadata-modules/related-record-path` |
    | Usage metering and limits | `core-modules/usage`, `usage-limit` |
    | Audit/event logs | `core-modules/event-logs` (16 files) |
    | Custom AI provider / enterprise-key validation | `core-modules/enterprise`. `MAX_SEATS_WITHOUT_ENTERPRISE_KEY = 25` gates custom AI providers |
    | Email-sending domains | `core-modules/emailing-domain` |
    | Front-end | `twenty-front/src/modules/settings/{security,roles,domains}` |

  - Trademark (`.github/TRADEMARK.md`): white-labelling is allowed and is in fact required for a publicly operated fork ("give it its own name and branding"). You may not use "Twenty" in your product name or logo.
- **Reusable implementation table**

| Capability | File path(s) | Symbols / entry points | What it actually does | Deps | Inputs→Outputs | Tests | Independently reusable? | Legal to copy? |
|---|---|---|---|---|---|---|---|---|
| CRM objects | `twenty-server/src/modules/{person,company,opportunity}/standard-objects/*.workspace-entity.ts` | `OpportunityWorkspaceEntity` (name, amount, closeDate, stage, probability, pointOfContact, company, owner) | Standard CRM schema on a metadata-driven, per-workspace ORM | TypeORM/Postgres | metadata → per-workspace tables | yes | No (engine-bound) | AGPL |
| Custom fields / objects (lead source, UTM) | `engine/metadata-modules/*` | metadata GraphQL API | No standard `leadSource`/UTM field exists on Person or Opportunity (grep). It must be added as a custom field through the metadata API | — | API → schema change | yes | via API | API use OK (exception) |
| REST + GraphQL API | `engine/api/rest/core/controllers/rest-api-core.controller.ts`, `engine/api/graphql/workspace-schema-builder`, `core-modules/open-api/open-api.service.ts` | auto-generated per-workspace schema + OpenAPI | CRUD on every object | — | HTTP → records | yes | via API | API use OK |
| MCP server | `engine/api/mcp/controllers/mcp-core.controller.ts`, `tools/list-object-metadata-names.tool.ts` | MCP endpoint | Exposes CRM to LLM agents | — | MCP → records | some | via API | API use OK |
| Outbound webhooks | `engine/metadata-modules/webhook/jobs/call-webhook.job.ts` | `CallWebhookJob`, HMAC-SHA256 `X-Twenty-Webhook-Signature`/`-Timestamp`/`-Nonce`, `webhook-rate-limit.service.ts` | Queue-based signed webhooks on record events | Redis queue | event → POST | yes | pattern only | AGPL (copy = AGPL) |
| Workflows | `modules/workflow/{workflow-trigger,workflow-executor,workflow-runner,workflow-wait}` | automated triggers, waits | No-code automations inside the CRM | queue | trigger → actions | yes | No | AGPL |
| Multi-tenancy | `engine/core-modules/workspace/workspace.entity.ts`, `user-workspace` | Workspace | Many workspaces per instance, schema per workspace | Postgres | — | yes | No | AGPL. RLS/roles granular permissions = **Enterprise** |
| Inbound email/messaging | `modules/messaging`, `modules/messaging-webhooks/drivers/{resend,aws-ses}` | `ResendWebhookDriverService`, `SesInboundWebhookDriverService` | Gmail/MS sync, campaign email (Resend/SES) | Google/MS OAuth, Resend/SES (paid) | — | yes | No | AGPL. `modules/emailing/services` has 1 enterprise file |
| TS SDK | `packages/twenty-sdk`, `twenty-client-sdk` | genql client | Typed API client | — | — | yes | **Yes** | **MIT** |

- **Recommendation: SEPARATE SERVICE (unmodified) + API-SDK (MIT SDK).** Run stock Twenty and integrate only through REST/GraphQL/webhooks/MCP, so the Application Exception keeps Online Reset proprietary. Never enable or ship Enterprise-marked features (SSO, RLS, audit logs) without a subscription. If you fork or modify the server, you must publish your modified source to users (AGPL §13).
- Scores: functional 4 (modern CRM, API, webhooks, MCP; no native UTM); reusability 3 (service + MIT SDK); licence 3 (the API exception is unusually friendly; EE files are a trap); maintenance 5; security/tests 4 (large suites; advisories unchecked); op-cost 3 (PG+Redis+worker, heavy); complexity 2.

---

### 26. EspoCRM
- URL https://github.com/espocrm/espocrm. Audited commit `b137f20cd93b7552e1487bac50167f1db20acf6c` (2026-11-06). Latest `10.0.11` (2026-10-23). Status: **active** (150+ commits in 30 days).
- Stack: PHP 8 + JS SPA (`client/`). Needs MySQL/MariaDB or Postgres, cron, and optionally a websocket daemon (`daemon.php`, `websocket.php`).
- Tests/CI: 316 `*Test.php` files. Workflows `test.yml`, `test-integration.yml`, `test-integration-pg.yml`, `ts-check.yml`. Advisories: not checked.
- **Licence: AGPL-3.0-or-later** (`LICENSE.txt`) with an **AGPL §7(b) attribution term** in every file header (e.g. `index.php` lines 21–27), quoted exactly:
  > "The interactive user interfaces in modified source and object code versions of this program must display Appropriate Legal Notices, as required under Section 5 of the GNU Affero General Public License version 3. In accordance with Section 7(b) of the GNU Affero General Public License version 3, these Appropriate Legal Notices must retain the display of the "EspoCRM" word."

  Consequence: **full white-labelling is not permitted**. The "EspoCRM" word must remain visible in the UI of any modified version. No enterprise directory exists in core (paid extensions are sold separately and are not in the repo).
- Reusable implementation table

| Capability | File path(s) | Symbols | What it does | Deps | I→O | Tests | Reusable? | Legal to copy? |
|---|---|---|---|---|---|---|---|---|
| Lead / Opportunity schema with `source` | `application/Espo/Modules/Crm/Resources/metadata/entityDefs/Lead.json` (`source` enum: Call, Email, Existing Customer, Partner, Web Site, Campaign, ...; mapped to Opportunity `leadSource`) | — | Built-in lead-source field | — | — | — | schema idea | AGPL |
| Lead capture (web-to-lead) | `application/Espo/Tools/LeadCapture/{CaptureService,FormService,Api/PostForm}.php` | `CaptureService` | API-key form/endpoint that creates a Lead and optionally adds it to a target list, with opt-in email | — | POST → Lead | partial | No | AGPL |
| Webhooks | `application/Espo/Core/Webhook/{Manager,Queue,Sender}.php`, `Classes/Jobs/ProcessWebhookQueue.php` | `Sender::send`, `buildSignature` (hash_hmac sha256) | Queued, signed outbound webhooks with internal-URL blocking (`FieldValidators/Webhook/Url/NotInternal.php`) | cron | event → POST | yes | pattern | AGPL |
| REST API + OpenAPI | `application/Espo/Tools/OpenApi/*`, `Tools/Api` | — | Generic CRUD REST API + OpenAPI generation | — | — | yes | via API | API use OK |
| Campaigns / mass email / tracking URLs | `Modules/Crm/Tools/{Campaign,MassEmail}`, entityDefs `CampaignTrackingUrl.json` | — | Email campaigns with click tracking | SMTP | — | some | No | AGPL |
| Pipelines / Kanban | `Tools/Pipeline`, `Tools/Kanban` | — | Opportunity stage boards | — | — | — | No | AGPL |
| Multi-tenancy | none found | — | **Single tenant per install** (no workspace/org model) | — | — | — | — | — |

- **Recommendation: REJECT** for Online Reset. Twenty covers the same ground with true multi-workspace support. EspoCRM's §7(b) "EspoCRM" display term blocks a branded UI, and it has no tenancy model. If a customer already runs EspoCRM, integrate with its REST API instead.
- Scores: functional 4; reusability 2; licence 1 (AGPL + forced attribution); maintenance 5; security/tests 3; op-cost 4 (plain LAMP); complexity 3.

---

### 27. Chatwoot
- URL https://github.com/chatwoot/chatwoot. Audited commit `625d5964e3cb3f1d917b43c3b8332219e525a4b8` (2026-11-06). Latest `v4.19.1` (2026-10-24). Status: **very active**.
- Stack: Rails + Sidekiq + Vue. Needs **Postgres with pgvector (pg16) + Redis** (`docker-compose.production.yaml`).
- Tests/CI: about 1,062 RSpec files (`spec/`) + 537 JS specs. Workflows `run_foss_spec.yml`, `frontend-fe.yml`, `publish_foss_docker.yml` (this one runs `rm -rf enterprise` to build the pure-MIT image), `publish_ee_docker.yml`. Advisories: not checked (`ghsa-linear-sync.yml` shows an active GHSA process).
- **Licence:** **MIT (Expat)** for everything outside `enterprise/`. `enterprise/LICENSE` = **Chatwoot Enterprise License**: production use requires a paid subscription, dev/test only otherwise, and Chatwoot owns any modifications.
  - Premium features (`config/features.yml`, `premium: true`, 24 features) include `disable_branding`, `audit_logs`, `sla`, `custom_roles`, `saml`, `channel_voice`, the `captain_*` AI features, `advanced_search`, `campaign_analytics`, `company_enrichment` and `auto_translate`.
  - Branding: the `enterprise/config/premium_installation_config.yml` + `enterprise/app/services/internal/reconcile_plan_config_service.rb` path **resets `INSTALLATION_NAME`, `LOGO`, `BRAND_NAME` to "Chatwoot" unless on a premium plan**. In the FOSS build (enterprise removed) those reset paths are absent, and MIT allows rebranding. Chatwoot's trademark still cannot be used. Whether the FOSS UI shows any residual "Powered by Chatwoot" text was NOT VERIFIED.
- Reusable implementation table

| Capability | File path(s) | Symbols | What it does | Deps | I→O | Tests | Reusable? | Legal to copy? |
|---|---|---|---|---|---|---|---|---|
| Channels | `app/models/channel/{web_widget,twilio_sms,sms,whatsapp,email,api,facebook_page,instagram,telegram,line,tiktok}.rb` | `Channel::*` | Omnichannel inbox | Twilio, Meta WhatsApp Cloud API, IMAP/SMTP (paid/external) | inbound → conversation | yes | No (Rails app) | **MIT** |
| Website widget SDK | `app/javascript/sdk/{IFrameHelper,bubbleHelpers,cookieHelpers}.js`, `app/javascript/widget` | `window.chatwootSDK` | Embeddable chat bubble (iframe) | — | — | yes | partly | MIT |
| Twilio SMS/WhatsApp | `app/services/twilio/{incoming_message_service,send_on_twilio_service,webhook_setup_service,delivery_status_service,oneoff_sms_campaign_service}.rb`, `app/controllers/twilio/callback_controller.rb` | `Twilio::IncomingMessageService` | Receive/send SMS & WhatsApp via Twilio, one-off SMS campaigns | **Twilio (paid)** | webhook → message | yes | adaptable | **MIT** |
| WhatsApp Cloud | `app/services/whatsapp/*`, `app/controllers/webhooks/whatsapp_controller.rb` | `Whatsapp::EmbeddedSignupService` | Meta embedded signup, templates | Meta (paid per conversation) | — | yes | adaptable | MIT |
| **Missed-call detection** | `enterprise/app/models/call.rb#missed?`, `enterprise/app/jobs/voice/missed_call_notification_job.rb`, `enterprise/app/services/voice/status_update_service.rb` (maps Twilio `no-answer`/`busy` → `no_answer`), `enterprise/app/controllers/twilio/voice_controller.rb` | `Voice::MissedCallNotificationJob` | Twilio Voice inbound calls. A missed call creates an **agent notification** (`voice_call_missed`). **No automatic SMS text-back to the caller was found** (grep for text-back/missed+sms returned nothing) | Twilio Voice | call status → notification | yes | — | **Enterprise licence: NOT usable** |
| First-response-time reporting | `app/listeners/reporting_event_listener.rb#first_reply_created`, `app/helpers/reporting_event_helper.rb#business_hours,last_non_human_activity`, `app/builders/v2/reports/first_response_time_distribution_builder.rb`, `app/controllers/api/v2/accounts/reports_controller.rb` | `ReportingEvent(name:'first_response', value, value_in_business_hours)` | FRT = first agent reply minus last non-human activity, also computed in business hours (inbox working hours) | — | message events → metrics | yes | **Yes (logic is small)** | **MIT** |
| Outbound webhooks | `app/models/webhook.rb` (`ALLOWED_WEBHOOK_EVENTS`: conversation_created/updated/status_changed, message_created, contact_created, ...), `lib/webhooks/trigger.rb` (`X-Chatwoot-Signature` = HMAC-SHA256 of `ts.body`) | `Webhooks::Trigger` | Signed webhooks at account or inbox level | — | — | yes | pattern | MIT |
| Multi-tenancy | `app/models/inbox.rb` (`account_id`), `app/controllers/platform/api/v1/{accounts,users,account_users}_controller.rb` | Platform API | Many accounts per install, created programmatically | — | — | yes | via API | MIT |

- **Recommendation: SEPARATE SERVICE (FOSS build with `enterprise/` removed) or COPY-AND-ADAPT the MIT pieces** (FRT logic, Twilio webhook handling). Use the Platform API to provision one account per Online Reset tenant. Do not use voice or missed-call handling, which are Enterprise. Build missed-call text-back separately on Twilio Voice status callbacks, or on the customer's phone system.
- Scores: functional 5 (inbox, SMS, WA, email, FRT); reusability 4; licence 4 (MIT core, clearly fenced EE); maintenance 5; security/tests 4; op-cost 3 (PG+Redis+Sidekiq, plus Twilio/Meta fees); complexity 3.

---

### 28. Umami
- URL https://github.com/umami-software/umami. Audited commit `559e3c607c23d2c72d9bd4f6481bda428255323c` (2026-10-23) = latest tag `v3.4.1` (2026-10-23). Only 13 commits in the last 30 days, and the 150-commit window reaches back to 2026-08-05. Status: **active, slower cadence**.
- Stack: Next.js 16 + Prisma 7. Needs **Postgres**. ClickHouse (`@clickhouse/client`) and Kafka (`kafkajs`) are optional for scale.
- Tests/CI: 139 test files (vitest + Playwright API). Workflows `ci.yml`, `cd.yml`, `cd-cloud.yml`, `gitleaks.yml`. Advisories: not checked.
- **Licence: MIT** (`LICENSE`, no other licence files, no EE directory). Commercial and white-label use are allowed. The "Umami" trademark is not granted.
- Reusable implementation table

| Capability | File path(s) | Symbols | What it does | Deps | I→O | Tests | Reusable? | Legal? |
|---|---|---|---|---|---|---|---|---|
| Tracker script | `src/tracker/index.ts` (18.5 KB TS source incl. type docs, about 5.6 KB gzipped source; built minified size **NOT VERIFIED**, not built), `rollup.tracker.config.js` | `data-umami-event-*` attributes, `umami.track()`, `fetch(endpoint)` | Cookieless pageview/event tracking; strips same-origin referrer | — | browser → `/api/send` | `src/tracker/index.test.ts` | **Yes** | MIT |
| Event ingest API | `src/app/api/send/route.ts`, `api/batch` | POST `/api/send` | Parses URL, referrer, **utm_source/medium/campaign/content/term, gclid, fbclid**, writes session/event | Postgres/ClickHouse | JSON → event rows | `route.test.ts` | Yes | MIT |
| UTM / click-ID storage | `prisma/schema.prisma` (utmSource ... utmTerm, gclid, ...) | — | Per-event attribution columns | — | — | — | Yes | MIT |
| Attribution report | `src/queries/sql/attribution/getAttribution.ts` | `getAttribution(websiteId,{model:'first-click'|'last-click'})` | First- or last-click attribution of conversions to referrer/UTM | SQL | — | `getAttribution.test.ts` | Yes | MIT |
| Goals / funnels / journeys / retention / revenue | `src/queries/sql/{goals,funnels,journeys,retention,revenue}` | — | Product analytics reports | — | — | some | Yes | MIT |
| Multi-website / teams | `prisma/schema.prisma` `model Team`, `TeamUser`; `src/app/api/teams` | — | Teams own websites, with roles (`src/permissions`) | — | — | yes | Yes | MIT |

- **Recommendation: SEPARATE SERVICE (or FORK).** It is the best fit in the group for web analytics plus UTM/referrer attribution, and MIT permits a white-labelled embed. Matomo's AI-assistant referrer classification idea (#29) could be ported conceptually as a new referrer channel.
- Scores: functional 4; reusability 5; licence 5; maintenance 4; security/tests 4; op-cost 5 (Postgres only); complexity 4.

---

### 29. Matomo
- URL https://github.com/matomo-org/matomo. Audited commit `1175158baff801c34769f770effc5e633121ebc0` (2026-11-06). Latest stable `5.14.2` (2026-10-22); 6.0.0 betas exist (`6.0.0-b9...` on 2026-10-29). Status: **active**.
- Stack: PHP + MySQL/MariaDB, cron archiving. Plugins such as `TagManager`, `MarketingCampaignsReporting` and `QueuedTracking` are **git submodules** (empty in this checkout).
- Tests/CI: about 945 `*Test.php` files. Workflows `matomo-tests.yml`, `phpstan.yml`, `phpcs.yml`, `buildtrackerjs.yml`, ... Advisories: not checked.
- **Licence: GPL-3.0-or-later** (`LICENSE`, `LEGALNOTICE`). Exceptions per `LEGALNOTICE`:
  - `js/matomo.js`/`piwik.js` JS tracker and `libs/PiwikTracker` PHP tracker are **BSD-3-Clause**.
  - `javascriptTag.tpl` is Public Domain.
  - "Matomo" is a registered trademark. `LEGALNOTICE` says you "may not ... modify the software in such a way that misrepresents the origin".
  - Premium marketplace plugins (e.g. Multi Channel Conversion Attribution, Funnels, Heatmaps) are **not in this repo**, are proprietary or vary in licence, and were NOT VERIFIED.
- Reusable implementation table

| Capability | File path(s) | Symbols | What it does | Deps | I→O | Tests | Reusable? | Legal? |
|---|---|---|---|---|---|---|---|---|
| Goals and conversion recording | `core/Tracker/GoalManager.php`, `plugins/Goals/{API,Archiver}.php` | `GoalManager::detectGoalsMatchingUrl`, `recordGoals`, `Goals\API::addGoal` | URL/event/numeric goal matching; conversion attributed to the visit's referrer/campaign | MySQL | hit → conversion | yes | No | GPL |
| **AI-assistant referrer channel** | `plugins/Referrers/AIAssistant.php`, `Reports/GetAIAssistants.php`, `Columns/AIAssistant.php`, `tests/Unit/AIAssistantTest.php` | `AIAssistant::getDefinitions` (loads `vendor/matomo/searchengine-and-social-list/AIAssistants.yml`) | Classifies visits from ChatGPT/Perplexity/etc. as an "AI Assistant" referrer type, which is **relevant to AEO traffic attribution** | definitions list (licence of the list NOT VERIFIED) | referrer → channel | yes | idea/list | GPL code |
| AI goal recommendations | `plugins/Goals/API.php#runGoalRecommendationScan($idSite,$useAi)` | — | Rule-based goal suggestions, with optional AI through the `AIProviders` plugin | LLM provider (optional) | — | NOT VERIFIED | No | GPL |
| JS tracker | `matomo.js` (68 KB unminified) | — | Full-featured tracker | — | — | yes | yes | **BSD** |
| Multi-site | `plugins/SitesManager`, `UsersManager` | — | Many sites; per-user access levels; no orgs | — | — | yes | No | GPL |

- **Recommendation: REJECT** (Umami covers the need with an MIT licence and a far lighter footprint). Keep only the *idea* of an AI-assistant referrer channel. Integrate with Matomo only when a customer already runs it (Reporting API).
- Scores: functional 4; reusability 2; licence 2 (GPL, trademark); maintenance 5; security/tests 4; op-cost 3; complexity 2.

---

### 30. Mautic
- URL https://github.com/mautic/mautic. Audited commit `4b2f796c71b3b65aa953c6dc2130a7c816c909b9` (2026-11-06). Latest `7.2.2` (2026-10-26). Status: **very active**.
- Stack: PHP/Symfony + MySQL/MariaDB, cron or Symfony Messenger workers, GrapesJS builder.
- Tests/CI: about 1,374 `*Test.php` files. Workflows `tests.yml`, `e2e-tests.yml`, `api-library-tests.yml`, `coverage-check.yml`. Advisories: not checked.
- **Licence: GPL-3.0-or-later** (`LICENSE.txt`). "Mautic is a trademark of the Mautic project of the Open Source Collective." No enterprise directory. `plugins/` (Clearbit, FullContact, CRM, Zapier, ...) are GPL too.
- Reusable implementation table

| Capability | File path(s) | Symbols | What it does | Deps | I→O | Tests | Reusable? | Legal? |
|---|---|---|---|---|---|---|---|---|
| Campaign engine | `app/bundles/CampaignBundle/Executioner/{KickoffExecutioner,ScheduledExecutioner,InactiveExecutioner,RealTimeExecutioner,EventExecutioner}.php` | executioners | Decision/action/condition drip campaigns with scheduling | cron | contact → actions | yes | No | GPL |
| Forms | `app/bundles/FormBundle/Model/{FormModel,SubmissionModel}.php` | `SubmissionModel` | Embeddable forms → contacts → actions | — | POST → contact | yes | No | GPL |
| Lead scoring | `app/bundles/PointBundle/Model/{PointModel,TriggerModel,PointGroupModel}.php`, `Entity/{GroupContactScore,LeadPointLog}.php` | Points, Triggers, Point groups | Event-based scores with threshold triggers | — | — | yes | No | GPL |
| UTM tags | `app/bundles/LeadBundle/Entity/UtmTag.php` | `UtmTag` | Stores UTM values per contact | — | — | — | idea | GPL |
| SMS (Twilio) | `app/bundles/SmsBundle/Integration/Twilio/{TwilioTransport,TwilioCallback}.php` | `TwilioTransport` | Send SMS from campaigns | **Twilio (paid)** | — | yes | No | GPL |
| Webhooks | `app/bundles/WebhookBundle/Model/WebhookModel.php` (`Webhook-Signature` header) | — | Signed event webhooks | — | — | yes | pattern | GPL |
| Projects | `app/bundles/ProjectBundle` | `Project` entity | Groups assets into "projects". **Not** tenancy; one tenant per install | — | — | yes | — | — |

- **Recommendation: REJECT** as an embedded component (heavy PHP, single-tenant, GPL). Integrate via REST API only if a customer runs it. For NZ trades, use simple sequences in the customer's existing tool (HubSpot / Mailchimp / ActiveCampaign) or Listmonk.
- Scores: functional 5; reusability 1; licence 2; maintenance 5; security/tests 4; op-cost 2; complexity 1.

---

### 31. Easy!Appointments
- URL https://github.com/alextselegidis/easyappointments. Audited commit `f6c8a4c2f364bf8c64b1f913a531a7134dcfd3c6` (2026-10-19). Latest `1.6.1` (2026-10-19). 32 commits in 30 days. Status: **active (single maintainer)**.
- Stack: PHP CodeIgniter 3 + MySQL. Uses the Google API PHP client.
- Tests/CI: **12 `*Test.php` files** (thin coverage), workflow `ci.yml`. Advisories: not checked.
- **Licence: GPL-3.0** (`LICENSE`). The booking and backend footers link to "Easy!Appointments" (`application/views/components/booking_footer.php` line 15, `backend_footer.php`). Under GPL this link is removable, but keep the copyright notices. The project also sells a "premium" offering (link in `backend_header.php`), whose code is not in the repo.
- Reusable implementation table

| Capability | File path(s) | Symbols | What it does | Deps | I→O | Tests | Reusable? | Legal? |
|---|---|---|---|---|---|---|---|---|
| Booking REST API | `application/controllers/api/v1/{Appointments,Availabilities,Customers,Providers,Services,Webhooks,...}_api_v1.php` | `index/show/store/update/destroy` | CRUD + availability lookup | — | HTTP → JSON | few | via API | API use OK |
| Availability calc | `application/libraries/Availability.php` | — | Free slots from working plans, exceptions and blocked periods | — | — | some | port idea | GPL |
| Webhooks | `application/libraries/Webhooks_client.php#trigger,call`; events `WEBHOOK_APPOINTMENT_SAVE` etc. in `application/config/constants.php` | — | POST on save/delete. Auth is a **static secret header/token, not an HMAC signature** | — | — | NOT VERIFIED | — | GPL |
| Google Calendar sync | `application/libraries/Google_sync.php` (`get_auth_url`, `add_appointment`, `update_appointment`, `delete_appointment`) | — | Per-provider OAuth two-way-ish sync | Google Calendar API | — | — | No | GPL |
| CalDAV sync | `application/libraries/Caldav_sync.php` | — | CalDAV sync | — | — | — | No | GPL |
| SMS | none (grep sms/twilio found nothing) | — | Email notifications only | — | — | — | — | — |
| Tenancy | `application/libraries/Instance.php` | — | Single business per install | — | — | — | — | — |

- **Recommendation: REJECT** (single-tenant, weak tests, no signed webhooks). NZ trades customers already use **ServiceM8 / Tradify / Fergus / Calendly / Google Calendar**, so integrate with those via their APIs or webhooks.
- Scores: functional 3; reusability 2; licence 2; maintenance 3; security/tests 1; op-cost 4; complexity 3.

---

### 32. Listmonk
- URL https://github.com/knadh/listmonk. Audited commit `91b76ece31fc3265334582c112833e0672cca95b` (2026-11-06). Latest tag `v6.2.0` (2026-06-26). The 150-commit window runs 2026-10-10 to 2026-11-06. Status: **active**.
- Stack: **single Go binary** (`go 1.27.3`, echo v5) with an embedded Vue admin. **Postgres only** (`schema.sql`, 16 tables).
- Tests/CI: 2 `*_test.go` files + Playwright browser tests (`tests/specs`, 9 spec files). Workflows `build-sanity.yml`, `release.yml`, `nightly.yml`. Advisories: not checked.
- **Licence: AGPL-3.0** (`LICENSE`). No EE code.
- Reusable implementation table

| Capability | File path(s) | Symbols | What it does | Deps | I→O | Tests | Reusable? | Legal? |
|---|---|---|---|---|---|---|---|---|
| Transactional API | `cmd/tx.go#SendTxMessage`, route `POST /api/tx` (`cmd/handlers.go:243`) | `models.TxMessage` | Template-based transactional email, with attachments | SMTP/SES etc. | JSON → email | e2e | via API | API use OK |
| Campaign API | `cmd/campaigns.go`, `/api/campaigns` | — | Lists, campaigns, scheduling, analytics (`cmd/campaign_analytics.go`) | SMTP | — | e2e | via API | API use OK |
| Bounce webhooks (inbound) | `internal/bounce/webhooks/{ses,sendgrid,forwardemail,lettermint}.go`, `/webhooks/service/:service` | — | Processes provider bounce callbacks | provider | — | — | — | AGPL |
| Postback messenger | `internal/messenger/postback/postback.go#Push` | `Postback` | Sends campaign messages to an arbitrary HTTP endpoint (can bridge to SMS gateways) | — | message → HTTP | — | pattern | AGPL |
| Outbound event webhooks | none. `cmd/events.go` is only an internal SSE stream | — | — | — | — | — | — | — |
| RBAC | `internal/auth`, `cmd/roles.go`, `permissions.json` | — | User/list roles within one instance; **no multi-tenant orgs** | — | — | — | — | — |

- **Recommendation: SEPARATE SERVICE (unmodified, API-only)**, and only if Online Reset needs its own bulk or nurture email. Run one instance per tenant, or shared with list-level separation. Integrating by HTTP API does not make Online Reset a derivative work. If you modify Listmonk, AGPL §13 requires offering the modified source to its network users.
- Scores: functional 3; reusability 4 (as service); licence 3; maintenance 4; security/tests 2; op-cost 5; complexity 5.

---

## AGPL/GPL practical consequences (closed-source SaaS)
- **API-only integration** (Online Reset calls a separately running, unmodified Twenty, Listmonk or EspoCRM over HTTP): no obligation on Online Reset's own code. AGPL §13 binds only the AGPL program itself; you just offer its (unmodified) source. Twenty additionally *expressly* confirms this in its §7 Application Exception.
- **Modifying an AGPL service you host** (Twenty, Listmonk, EspoCRM): you must offer the complete corresponding source of *your modified version* to every user who interacts with it over the network. Your separate frontend stays proprietary if it communicates only at arm's length. EspoCRM additionally forces "EspoCRM" to stay visible.
- **Copying or embedding AGPL/GPL code into Online Reset's codebase**: the combined work becomes AGPL or GPL.
  - AGPL: your whole SaaS source must be offered to users.
  - GPL (Matomo, Mautic, E!A): obligations trigger on *distribution*. Pure SaaS hosting does not distribute, but shipping on-prem builds, agents or plugins would.
  - Avoid copying either way.
- **Enterprise/commercial files** (Twenty `@license Enterprise`, Chatwoot `enterprise/`): production use requires a paid subscription, regardless of modification.

## Group summary
- **Best in group:**

  | Capability | Pick |
  |---|---|
  | CRM / pipeline | **Twenty**, run as a separate service; MIT SDK |
  | Chat/inbox, SMS, WhatsApp, FRT reporting | **Chatwoot FOSS (MIT)** |
  | Web analytics + UTM/referrer attribution | **Umami (MIT)** |
  | Email | **Listmonk** (separate service) |
  | Booking | none; integrate external tools |

- **Overlaps:** Twenty ≈ EspoCRM ≈ Mautic contacts. Umami ≈ Matomo. Listmonk ≈ Mautic email. Chatwoot campaigns ≈ Mautic SMS.
- **Missed-call / SMS follow-up:** the only missed-call code is **Chatwoot Enterprise** (`Voice::MissedCallNotificationJob`), which notifies agents only, sends no text-back, and is not licensed for free use. MIT Twilio SMS code in Chatwoot (`app/services/twilio/*`) can send the follow-up SMS. Missed-call detection itself must be built from scratch on Twilio Voice status callbacks (`no-answer`/`busy`), or taken from the trade customer's phone/VoIP provider.
- **Minimal subset to run:**
  1. Umami (attribution)
  2. Chatwoot FOSS (inbox, SMS, WhatsApp, FRT), with one account per tenant via the Platform API
  3. Optionally Twenty as the default CRM for customers without one, API-only
  4. Optionally Listmonk
- **Integrate instead with customers' existing systems:** HubSpot / Pipedrive / Zoho (CRM), ServiceM8 / Tradify / Fergus (NZ trades job management + booking), Calendly / Google Calendar (booking), Mailchimp / ActiveCampaign (email), Twilio / NZ carriers (SMS/voice).
- **Reject:** EspoCRM (forced attribution, single-tenant), Matomo (GPL, heavy; borrow only the AI-referrer idea), Mautic (heavy, single-tenant, GPL), Easy!Appointments (single-tenant, 12 tests, unsigned webhooks).
- **Red flags:**
  - Twenty and Chatwoot mix commercial files into otherwise open repos. Strip or avoid them, and use Chatwoot's FOSS image build approach.
  - Chatwoot EE resets branding unless premium.
  - EspoCRM §7(b) attribution.
  - Twenty has not tagged a release since June 2026 despite daily commits.
  - gh API blocked, so stars and security advisories are unverified for all 8.

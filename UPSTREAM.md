# Upstream sources

Every piece of reused code, where it came from, and at which commit. Licences
were verified at these commits (see `docs/research/02-open-source-repository-audit.md`).

| Upstream | Commit | Licence | What we use | Where it lives here |
|---|---|---|---|---|
| elmohq/elmo | `db2d52b560b1917ea4e8fe4b619f1c402b8cdb14` | MIT | Whole platform base (fork) | everything not listed below |
| limelit-co/open | `53d178b62fc33bf23270aa4399f5f5ae4e5243bd` | Apache-2.0 (+NOTICE) | `internal/mentions/mentions.go`, `phrase.go` (deterministic mention + list-rank matcher, phrase-name rule), their tests and `testdata/phrase_names.json`; prompt-pack intent approach | `packages/or-core/src/mentions.ts`, `mentions.test.ts`, `testdata/limelit-phrase-names.json` |
| Canonry/canonry | `f5d4612e23d2b1f0e5f46b217245359125c52a80` | MIT | `packages/contracts/src/embeddings.ts` (cosine, single-link clustering, representative); `packages/intelligence/src/share-of-voice-frame.ts` (SoV with publication floors); `user_location` request shape from `provider-openai`/`provider-claude` `normalize.ts` | `packages/or-core/src/clustering.ts`, `share-of-voice.ts`, `geo.ts` |
| Canonry/canonry | `f5d4612` | MIT | `packages/integration-wordpress/src/wordpress-client.ts` (Basic-auth REST requests, error mapping, credential redaction, page create/update) | `packages/lib/src/or/publishing/wordpress.ts` |
| elmohq/elmo (in-fork reuse) | `db2d52b` | MIT | `packages/site-audit` crawler and AI-readiness checks (extended to return parsed pages); `packages/lib/src/secrets/crypto.ts` for CMS credential encryption; pg-boss scheduling; better-auth RBAC | used in place |
| aigclink/geolook | `9492cb3` | MIT | Approach only (no code copied): fix tickets with re-crawl verification; JSON-LD generation from brand facts | `packages/or-core/src/content.ts`, `packages/lib/src/or/optimisation.ts` |
| TheCraigHewitt/seomachine | `120e7b4` | MIT | Approach only (no code copied): rule-based content QA and AI-phrase checks | `packages/or-core/src/content.ts` |

Rows are added as modules are ported. Ported files carry a header naming the
upstream file and commit.

## Removed from the Elmo fork

- PostHog telemetry with a hard-coded key (worker, CLI, web fallback key) — replaced by no-ops / opt-in only.
- `apps/www` (Elmo marketing site and blog), `packages/docs`, Elmo agent/editor
  config, CLA, funding, changesets and upstream-only CI workflows (including the
  scheduled live-provider test that spends API credit).

## Keeping the fork current

`git remote -v` shows `upstream` → elmohq/elmo. Rebase or cherry-pick from
upstream deliberately; record the new base commit in this file.

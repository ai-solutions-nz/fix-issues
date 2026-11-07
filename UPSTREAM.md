# Upstream sources

Every piece of reused code, where it came from, and at which commit. Licences
were verified at these commits (see `docs/research/02-open-source-repository-audit.md`).

| Upstream | Commit | Licence | What we use | Where it lives here |
|---|---|---|---|---|
| elmohq/elmo | `db2d52b560b1917ea4e8fe4b619f1c402b8cdb14` | MIT | Whole platform base (fork) | everything not listed below |

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

# Online Reset CLI

The command-line tool for running Online Reset on your own infrastructure. It generates a Docker Compose stack, manages secrets and configuration, and gives you one command to start, stop and upgrade it.

Online Reset is built on the open-source Elmo project (MIT); see `UPSTREAM.md` and `THIRD_PARTY_NOTICES.md` at the repository root.

## Install

The Online Reset CLI is not published to a package registry. Build it from this repository:

```bash
pnpm install
pnpm -C apps/cli build
node apps/cli/dist/index.js --help
```

The executable is still named `elmo` (its package name, `@elmohq/cli`, and its config paths are inherited from upstream and kept so existing installs keep working). Linking the package puts `elmo` on your `PATH`.

## Quick start

```bash
elmo init
elmo compose up -d
```

`elmo init` prompts for a few things (database, AI provider credentials), generates `elmo.yaml` and `.env`, and can start the stack for you.

## Commands

| Command                    | Description                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `elmo init`                | Interactive wizard to set up a local Online Reset instance                                                                                  |
| `elmo compose <args...>`   | Run any `docker compose` command against your Online Reset project (e.g. `elmo compose up -d`, `elmo compose down`, `elmo compose logs -f`) |
| `elmo edit <env\|compose>` | Change API keys, scrape targets, or the Docker Compose YAML                                                                                 |
| `elmo upgrade`             | Move your deployment to this CLI's version: runs migrations, re-pins image tags, and restarts the stack                                     |

Run `elmo --help` or `elmo <command> --help` for the full list of flags.

### Useful flags

- `--dir <path>`: point any command at a specific config directory (defaults to `~/.elmo`).
- `elmo init --dev`: build images from a local checkout of the repo instead of pulling them.

## Telemetry

Online Reset sends no telemetry. The upstream CLI's event and newsletter calls have been removed; `DISABLE_TELEMETRY` is still accepted but has nothing to switch off.

# MiteGuard Google Ads MCP server

A small Streamable-HTTP MCP server wrapping the Google Ads API for MiteGuard's
own account. Read tools (account summary, campaigns, search terms) plus a
handful of write tools (negative keywords, budget, campaign status, device
bid modifiers) — each write tool requires `confirm: true` to run.

No credentials are stored in this repo. Everything comes from environment
variables, set directly on the host (Railway → Variables) — never in code,
never in chat.

## Required environment variables

| Variable | Where it comes from |
|---|---|
| `GOOGLE_ADS_CLIENT_ID` | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_ADS_CLIENT_SECRET` | Same place — **rotate immediately if it was ever pasted anywhere insecure** |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Google Ads → Tools & Settings → API Center |
| `GOOGLE_ADS_CUSTOMER_ID` | The MiteGuard Ads account ID (digits only, no dashes) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | Optional — set only if accessing MiteGuard's account through a manager (MCC) account |
| `GOOGLE_ADS_REFRESH_TOKEN` | Generated via a one-time OAuth consent flow (see below) — not yet done |
| `MCP_ACCESS_TOKEN` | A long random string you generate yourself — this server checks it on every request, so only claude.ai's connector config (which you'll paste it into) can call it |

## Getting the refresh token

This is the one remaining manual step. From a machine with Node installed and
these packages available, run a short one-time script that opens the OAuth
consent URL, lets you log in as the account admin, and exchanges the
authorization code for a refresh token. I can generate that script on request
— it should be run once, locally, by whoever holds the credentials, and its
output (the refresh token) goes straight into Railway's Variables, not
back through chat.

## Deploying

```
npm install
npm start
```

Or deployed to Railway: push this directory, set the environment variables
above in the Railway service's Variables tab, Railway handles the rest
(`npm start` via the `start` script).

## Registering as a custom connector in claude.ai

Settings → Connectors → Add custom connector → paste the deployed URL with
`/mcp` appended (e.g. `https://your-service.up.railway.app/mcp`) → set the
Authorization header to `Bearer <MCP_ACCESS_TOKEN>`.

## Tools exposed

- `get_account_summary` — impressions/clicks/cost/conversions over a date range
- `list_campaigns` — per-campaign status, budget, performance
- `get_search_terms` — search terms with cost/clicks/conversions, for finding negative-keyword candidates
- `add_negative_keyword` *(write, confirm required)*
- `update_campaign_budget` *(write, confirm required)*
- `set_campaign_status` *(write, confirm required — pause/enable)*
- `set_device_bid_modifier` *(write, confirm required)*

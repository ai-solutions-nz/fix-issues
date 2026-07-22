# Shopify → Big Cartel product sync

Keeps a Big Cartel store's sold-out/back-in-stock status in sync with a Shopify store.

## Scope

Big Cartel's public API does not support writing a product's price or exact
inventory quantity — the "Update a product" endpoint only accepts `name`,
`description`, `status`, `on_sale`, and `permalink`. So this integration syncs
**stock status only**: when a mapped Shopify product's variants all hit zero
inventory, the matching Big Cartel product is set to `sold_out`; when stock
returns, it's set back to `active`. A product left `hidden` or `coming_soon`
in Big Cartel is never touched.

Big Cartel product options also have no SKU field, so products are matched
by hand in `bigcartel-mapping.json` rather than automatically by SKU.

## Setup

### 1. Map your products

Edit `bigcartel-mapping.json`, mapping each Shopify product ID to its Big
Cartel product ID:

```json
{
  "7854321098765": "123456789"
}
```

### 2. Create a Big Cartel API app and get an access token

1. Register an app at your Big Cartel developer account to get a `client_id`
   and `client_secret`.
2. Send yourself through the authorize step:
   `https://my.bigcartel.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=YOUR_REDIRECT_URI`
3. Exchange the returned `code` for an access token:
   ```
   curl -X POST https://api.bigcartel.com/oauth/token \
     -d client_id=YOUR_CLIENT_ID \
     -d client_secret=YOUR_CLIENT_SECRET \
     -d code=THE_CODE \
     -d redirect_uri=YOUR_REDIRECT_URI
   ```
   The response has `access_token` and `account_id` — you'll need both.

### 3. Configure environment variables

Copy `.env.example` and fill in, then set the same values in your Netlify
site's environment variables:

- `BIGCARTEL_ACCESS_TOKEN` — from step 2
- `BIGCARTEL_ACCOUNT_ID` — from step 2
- `SHOPIFY_WEBHOOK_SECRET` — set when you create the webhook below

### 4. Register the Shopify webhook

In Shopify admin, create a webhook for the `products/update` topic pointing
at:

```
https://YOUR_SITE.netlify.app/.netlify/functions/shopify-product-sync
```

Use the webhook's signing secret as `SHOPIFY_WEBHOOK_SECRET`.

### 5. Deploy

Deploy this repo to Netlify (functions live in `netlify/functions`, picked
up automatically via `netlify.toml`).

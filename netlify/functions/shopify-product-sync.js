const { verifyShopifyWebhook } = require("../../lib/verifyShopifyWebhook");
const { getProductStatus, setProductStatus } = require("../../lib/bigcartel");
const mapping = require("../../bigcartel-mapping.json");

const {
  SHOPIFY_WEBHOOK_SECRET,
  BIGCARTEL_ACCESS_TOKEN,
  BIGCARTEL_ACCOUNT_ID,
} = process.env;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;

  const hmacHeader = event.headers["x-shopify-hmac-sha256"];
  if (!verifyShopifyWebhook(rawBody, hmacHeader, SHOPIFY_WEBHOOK_SECRET)) {
    return { statusCode: 401, body: "Invalid webhook signature" };
  }

  const product = JSON.parse(rawBody);
  const bigCartelProductId = mapping[String(product.id)];

  if (!bigCartelProductId) {
    return { statusCode: 200, body: "No Big Cartel mapping for this product, skipping" };
  }

  const variants = product.variants || [];
  const inStock = variants.some((v) => (v.inventory_quantity ?? 0) > 0);

  const currentStatus = await getProductStatus({
    accountId: BIGCARTEL_ACCOUNT_ID,
    productId: bigCartelProductId,
    accessToken: BIGCARTEL_ACCESS_TOKEN,
  });

  // Only manage the active <-> sold_out transition, so a product deliberately
  // left `hidden` or `coming_soon` in Big Cartel is never touched here.
  if (inStock && currentStatus === "sold_out") {
    await setProductStatus({
      accountId: BIGCARTEL_ACCOUNT_ID,
      productId: bigCartelProductId,
      status: "active",
      accessToken: BIGCARTEL_ACCESS_TOKEN,
    });
    return { statusCode: 200, body: "Marked back in stock" };
  }

  if (!inStock && currentStatus === "active") {
    await setProductStatus({
      accountId: BIGCARTEL_ACCOUNT_ID,
      productId: bigCartelProductId,
      status: "sold_out",
      accessToken: BIGCARTEL_ACCESS_TOKEN,
    });
    return { statusCode: 200, body: "Marked sold out" };
  }

  return { statusCode: 200, body: "No status change needed" };
};

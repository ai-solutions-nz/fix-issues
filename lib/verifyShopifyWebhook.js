const crypto = require("crypto");

function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  if (!hmacHeader) return false;

  const digest = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  const digestBuffer = Buffer.from(digest);
  const headerBuffer = Buffer.from(hmacHeader);

  if (digestBuffer.length !== headerBuffer.length) return false;
  return crypto.timingSafeEqual(digestBuffer, headerBuffer);
}

module.exports = { verifyShopifyWebhook };

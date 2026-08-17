const { GoogleAdsApi } = require("google-ads-api");

// All credentials come from environment variables only.
// Nothing here is ever hardcoded — set these as secrets on the hosting
// platform (Railway → Variables), never committed, never passed through chat.
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

let _client = null;
let _customer = null;

function getClient() {
  if (_client) return _client;
  _client = new GoogleAdsApi({
    client_id: requireEnv("GOOGLE_ADS_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_ADS_CLIENT_SECRET"),
    developer_token: requireEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
  });
  return _client;
}

// customer_id = the MiteGuard client account being managed.
// login_customer_id = the manager (MCC) account the developer token is issued under,
// only needed if the target account is accessed through a manager account.
function getCustomer() {
  if (_customer) return _customer;
  const client = getClient();
  _customer = client.Customer({
    customer_id: requireEnv("GOOGLE_ADS_CUSTOMER_ID"),
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
    refresh_token: requireEnv("GOOGLE_ADS_REFRESH_TOKEN"),
  });
  return _customer;
}

module.exports = { getCustomer };

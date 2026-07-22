const API_BASE = "https://api.bigcartel.com/v1";

async function bigCartelRequest(path, { method = "GET", accessToken, body } = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Big Cartel API ${method} ${path} failed: ${res.status} ${text}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

async function getProductStatus({ accountId, productId, accessToken }) {
  const json = await bigCartelRequest(`/accounts/${accountId}/products/${productId}`, {
    accessToken,
  });
  return json.data.attributes.status;
}

async function setProductStatus({ accountId, productId, status, accessToken }) {
  return bigCartelRequest(`/accounts/${accountId}/products/${productId}`, {
    method: "PATCH",
    accessToken,
    body: {
      data: {
        id: String(productId),
        type: "products",
        attributes: { status },
      },
    },
  });
}

module.exports = { getProductStatus, setProductStatus };

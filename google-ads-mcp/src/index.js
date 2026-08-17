const express = require("express");
const { randomUUID } = require("crypto");
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StreamableHTTPServerTransport } = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { tools } = require("./tools");

const REQUIRED_ENV = [
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "MCP_ACCESS_TOKEN", // shared secret this server checks on every request — set your own random string
];

function buildServer() {
  const server = new McpServer({ name: "miteguard-google-ads", version: "1.0.0" });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.schema },
      async (args) => {
        try {
          const result = await tool.handler(args);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true,
          };
        }
      }
    );
  }
  return server;
}

const app = express();
app.use(express.json());

// Simple bearer-token gate. This server holds write access to a live ad
// account — MCP_ACCESS_TOKEN must be set to a long random string, and only
// requests carrying it get through. Set it in Railway's Variables, share it
// only with claude.ai's connector config, never in chat.
app.use((req, res, next) => {
  const expected = process.env.MCP_ACCESS_TOKEN;
  const got = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!expected || got !== expected) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.get("/healthz", (req, res) => res.json({ ok: true }));

app.post("/mcp", async (req, res) => {
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID() });
  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Set these in Railway → Variables before this server can do anything.");
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`MiteGuard Google Ads MCP server listening on :${port}`));

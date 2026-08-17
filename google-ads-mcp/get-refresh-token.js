#!/usr/bin/env node
// One-time script to generate a Google Ads API refresh token.
//
// Run this LOCALLY, on the machine of whoever is logged into the Google
// account that administers the MiteGuard Google Ads account. It never sends
// your credentials anywhere except Google's own OAuth servers.
//
// Usage:
//   npm install google-auth-library
//   GOOGLE_ADS_CLIENT_ID=... GOOGLE_ADS_CLIENT_SECRET=... node get-refresh-token.js
//
// It opens a browser window, you log in and approve access, and the
// resulting refresh token is printed to your terminal. Copy that value
// straight into Railway's Variables tab as GOOGLE_ADS_REFRESH_TOKEN —
// do not paste it into a chat, an email, or a shared doc.

const http = require("http");
const { OAuth2Client } = require("google-auth-library");

const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET;
const PORT = 8967;
const REDIRECT_URI = `http://localhost:${PORT}`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET as env vars before running this.");
  process.exit(1);
}

const oAuth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent", // forces a refresh token even if you've authorized this app before
  scope: ["https://www.googleapis.com/auth/adwords"],
});

console.log("\nOpen this URL, log in with the account that administers the MiteGuard Google Ads account, and approve access:\n");
console.log(authUrl + "\n");
console.log(`Waiting for the redirect back to ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get("code");
  if (!code) {
    res.end("No code received — check the terminal and try again.");
    return;
  }
  res.end("Success — you can close this tab and return to your terminal.");
  server.close();

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    console.log("\nRefresh token (copy this into Railway → Variables → GOOGLE_ADS_REFRESH_TOKEN):\n");
    console.log(tokens.refresh_token);
    console.log("\nDo not paste this into chat, email, or a shared doc — treat it like a password.\n");
  } catch (err) {
    console.error("Failed to exchange code for tokens:", err.message);
  }
  process.exit(0);
});

server.listen(PORT);

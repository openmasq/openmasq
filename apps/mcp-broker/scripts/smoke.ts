/**
 * End-to-end smoke test of the `demo` platform with NO external credentials.
 * Drives the full OAuth flow by hand (DCR → authorize → token), then connects a
 * real MCP client and calls a tool. Run: `pnpm --filter @openmasq/mcp-broker smoke`.
 */
import { randomBytes } from "node:crypto";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
process.env.PORT = String(PORT);
process.env.PUBLIC_URL = BASE;

const { createApp } = await import("../src/index.js");
const { s256Challenge } = await import("../src/oauth/pkce.js");
const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
const { StreamableHTTPClientTransport } = await import(
  "@modelcontextprotocol/sdk/client/streamableHttp.js"
);

const ok = (c: boolean, m: string) => {
  console.log(`${c ? "✅" : "❌"} ${m}`);
  if (!c) process.exitCode = 1;
};

const server = createApp().listen(PORT);
await new Promise((r) => setTimeout(r, 200));

try {
  // 1) Dynamic client registration.
  const reg = await fetch(`${BASE}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ redirect_uris: ["http://127.0.0.1:0/callback"], client_name: "smoke" }),
  }).then((r) => r.json());
  ok(!!reg.client_id, `registered client ${reg.client_id?.slice(0, 12)}…`);

  // 2) Authorize (demo auto-consents → redirect carries the code).
  const verifier = randomBytes(32).toString("base64url");
  const redirectUri = "http://127.0.0.1:51999/callback";
  const auth = new URL(`${BASE}/oauth/authorize`);
  auth.search = new URLSearchParams({
    response_type: "code",
    client_id: reg.client_id,
    redirect_uri: redirectUri,
    code_challenge: s256Challenge(verifier),
    code_challenge_method: "S256",
    state: "st-123",
    resource: `${BASE}/demo/mcp`,
  }).toString();
  const authRes = await fetch(auth, { redirect: "manual" });
  const loc = new URL(authRes.headers.get("location") ?? "", BASE);
  const code = loc.searchParams.get("code");
  ok(loc.searchParams.get("state") === "st-123" && !!code, `authorize redirected with a code`);

  // 3) Token exchange.
  const tok = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code ?? "",
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: reg.client_id,
    }).toString(),
  }).then((r) => r.json());
  ok(!!tok.access_token, `token issued (expires_in=${tok.expires_in})`);

  // Wrong PKCE must be rejected.
  const bad = await fetch(`${BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: code ?? "",
      code_verifier: "totally-wrong",
      redirect_uri: redirectUri,
      client_id: reg.client_id,
    }).toString(),
  });
  ok(bad.status === 400, `replayed/!PKCE code rejected (${bad.status})`);

  // 4) MCP client call through the broker.
  const client = new Client({ name: "smoke", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/demo/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${tok.access_token}` } },
  });
  await client.connect(transport);
  const tools = await client.listTools();
  ok(
    tools.tools.some((t) => t.name === "list_recent_senders"),
    `tools/list → ${tools.tools.map((t) => t.name).join(", ")}`,
  );
  const result = await client.callTool({ name: "list_recent_senders", arguments: { limit: 3 } });
  const text = (result.content as { type: string; text: string }[]).map((c) => c.text).join("");
  console.log("   result →", JSON.stringify(text.slice(0, 80)));
  ok(/Alice Morvan/.test(text), "list_recent_senders returned sender data");
  await client.close();
} finally {
  server.close();
}

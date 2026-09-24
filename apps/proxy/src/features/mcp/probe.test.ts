import { describe, expect, it } from "vitest";
import { probeServer, probeUrlAllowed } from "./probe";

describe("the metadata probe only follows a public https name", () => {
  it("allows a real authorization server", () => {
    for (const u of [
      "https://accounts.google.com/.well-known/openid-configuration",
      "https://mcp.notion.com/.well-known/oauth-authorization-server",
      "https://auth.example.co.uk/.well-known/openid-configuration",
    ])
      expect(probeUrlAllowed(u), u).toBe(true);
  });

  it("refuses the shapes a hostile server would name to pivot inward", () => {
    for (const u of [
      "http://mcp.example.com/.well-known/x", // downgraded
      "https://169.254.169.254/.well-known/x", // cloud metadata
      "https://10.0.0.5/.well-known/x",
      "https://127.0.0.1/.well-known/x",
      "https://[::1]/.well-known/x",
      "https://localhost/.well-known/x",
      "https://printer.local/.well-known/x",
      "https://intranet/.well-known/x", // a bare name is not a public server
      "file:///etc/passwd",
      "not a url",
    ])
      expect(probeUrlAllowed(u), u).toBe(false);
  });

  it("makes no request at all to a target it refuses", async () => {
    const asked: string[] = [];
    const fetchFn = (async (u: string) => {
      asked.push(String(u));
      // The endpoint answers by pointing the chain at the cloud metadata service.
      return new Response(JSON.stringify({ authorization_servers: ["https://169.254.169.254"] }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    await probeServer("https://mcp.example.com/mcp", fetchFn);
    expect(asked.some((u) => u.includes("169.254.169.254"))).toBe(false);
    // …while the server's OWN origin is still asked, which is what the probe is for.
    expect(asked.some((u) => u.startsWith("https://mcp.example.com/"))).toBe(true);
  });
});

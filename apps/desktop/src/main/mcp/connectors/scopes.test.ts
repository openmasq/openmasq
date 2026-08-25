import { describe, expect, it } from "vitest";
import type { Connector } from "@openmasq/connectors";
import { effectiveScopes, parseGrantedScopes } from "./scopes";
import { makeConnectorConnection } from "./run";

const GMAIL_READ = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send";

describe("parseGrantedScopes", () => {
  it("splits the space-delimited scope field", () => {
    expect(parseGrantedScopes(`${GMAIL_SEND} ${GMAIL_READ}`)).toEqual([GMAIL_SEND, GMAIL_READ]);
    expect(parseGrantedScopes("  a\n b  ")).toEqual(["a", "b"]);
  });

  it("is undefined when the server said nothing — NOT an empty grant", () => {
    // The difference matters: `undefined` falls back to the requested list, `[]`
    // would strip every scoped tool from a connection that works fine.
    expect(parseGrantedScopes(undefined)).toBeUndefined();
    expect(parseGrantedScopes("")).toBeUndefined();
    expect(parseGrantedScopes("   ")).toBeUndefined();
  });
});

describe("effectiveScopes", () => {
  it("prefers what was GRANTED — granular consent may have removed one", () => {
    expect(effectiveScopes([GMAIL_SEND], [GMAIL_READ, GMAIL_SEND])).toEqual([GMAIL_SEND]);
  });

  it("falls back to the requested list when nothing was recorded (no regression)", () => {
    // A connection stored before scopes were captured, or a flow that never reports
    // them (Slack relay, GitHub device) — must keep every tool it has today.
    expect(effectiveScopes(undefined, [GMAIL_READ, GMAIL_SEND])).toEqual([GMAIL_READ, GMAIL_SEND]);
    expect(effectiveScopes([], [GMAIL_READ])).toEqual([GMAIL_READ]);
  });
});

/** A stand-in connector: one unscoped tool, one per Gmail scope. */
const connector = {
  id: "gmail",
  name: "Gmail",
  auth: "pkce",
  scopes: { managed: [GMAIL_SEND], byo: [GMAIL_READ, GMAIL_SEND] },
  tools: [
    { name: "whoami", description: "…", inputSchema: {}, run: async () => ({}) },
    { name: "search", description: "…", inputSchema: {}, scope: GMAIL_READ, run: async () => ({}) },
    { name: "send", description: "…", inputSchema: {}, scope: GMAIL_SEND, run: async () => ({}) },
  ],
} as unknown as Connector;

const toolNames = async (grantedScopes: string[]) => {
  const conn = makeConnectorConnection({
    id: "gmail",
    connector,
    getToken: async () => "t",
    grantedScopes,
  });
  return (await conn.listTools()).map((t) => t.name);
};

describe("the tool list a connection exposes", () => {
  it("hides a tool whose scope was not granted — the model never learns it exists", async () => {
    expect(await toolNames([GMAIL_SEND])).toEqual(["whoami", "send"]);
  });

  it("lists it once the scope is there", async () => {
    expect(await toolNames([GMAIL_READ, GMAIL_SEND])).toEqual(["whoami", "search", "send"]);
  });

  it("always keeps the unscoped tools", async () => {
    expect(await toolNames([])).toEqual(["whoami"]);
  });

  it("REGRESSION: a scope requested but declined leaves its tool out", async () => {
    // "Mes clés" asks for read+send; the user unticks read on the consent screen.
    // Listing `search` anyway made the model call it and hit a 403 mid-conversation.
    const granted = effectiveScopes(parseGrantedScopes(GMAIL_SEND), connector.scopes.byo);
    expect(await toolNames(granted)).not.toContain("search");
  });
});

import type { RedactionMatch } from "@openmasq/redact";
import { describe, expect, it } from "vitest";
import { HUE_HEX } from "./palette";
import { outcomeHex, type RequestEvent, requestLines } from "./rows";
import { createTty } from "./tty";

const plain = createTty(false, () => 200);
const m = (category: string): RedactionMatch =>
  ({ type: "x", value: "REAL-VALUE", placeholder: "FAKE", category }) as RedactionMatch;
const event = (o: Partial<RequestEvent> = {}): RequestEvent => ({
  method: "POST",
  path: "/v1/messages",
  family: "anthropic",
  status: 200,
  ms: 812,
  matches: [],
  stream: false,
  ...o,
});

describe("request rows", () => {
  /** The gutter is the answer before the line is read, so its order of precedence is the
   *  reader's: a failed request is a failure first, whatever it protected on the way. */
  it("colours the gutter by outcome, upstream failure outranking the masking", () => {
    expect(outcomeHex(event({ matches: [m("EMAIL")] }))).toBe(HUE_HEX.mint);
    expect(outcomeHex(event())).toBe(HUE_HEX.slate);
    expect(outcomeHex(event({ status: 302 }))).toBe(HUE_HEX.amber);
    expect(outcomeHex(event({ status: 502, matches: [m("EMAIL")] }))).toBe(HUE_HEX.red);
  });

  it("says where the request went, and prints counts — never a value", () => {
    const lines = requestLines(plain, event({ matches: [m("EMAIL"), m("NAME"), m("NAME")] }), {
      clock: "12:04:31",
      counts: { EMAIL: 1, NAME: 2 },
      upstream: "api.anthropic.com",
    });
    const out = lines.join("\n");
    expect(lines).toHaveLength(2);
    expect(out).toContain("POST /v1/messages");
    expect(out).toContain("api.anthropic.com");
    expect(out).toContain("[NAME 2]");
    expect(out).toContain("3 masked");
    expect(out).not.toContain("REAL-VALUE");
    expect(out).not.toContain("FAKE");
  });

  it("names the family when no card taught it the host", () => {
    const [head] = requestLines(
      plain,
      event({ method: "TOOL", path: "crm__search", family: "mcp" }),
      {
        clock: "12:04:31",
        counts: {},
      },
    );
    expect(head).toContain("mcp");
  });

  /** A relayed probe carried no text: one line, not two — it must not read like a request
   *  that had nothing sensitive in it. */
  it("gives a relayed GET one line and a POST its verdict", () => {
    expect(
      requestLines(plain, event({ method: "GET", path: "/v1/models" }), { clock: "0", counts: {} }),
    ).toHaveLength(1);
    const post = requestLines(plain, event(), { clock: "0", counts: {} });
    expect(post).toHaveLength(2);
    expect(post[1]).toContain("nothing to mask");
  });

  /** Bars and strips are pure colour: without it they are identical blocks saying nothing. */
  it("drops the histogram when the terminal has no colours", () => {
    const [, body] = requestLines(plain, event({ matches: [m("EMAIL")] }), {
      clock: "0",
      counts: { EMAIL: 1 },
    });
    expect(body).not.toContain("█");
    const colored = requestLines(
      createTty(true, () => 200, { depth: 24, theme: "dark" }),
      event({ matches: [m("EMAIL")] }),
      { clock: "0", counts: { EMAIL: 1 } },
    );
    expect(colored[1]).toContain("█");
  });
});

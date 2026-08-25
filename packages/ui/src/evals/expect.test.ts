import { describe, expect, it } from "vitest";
import { verifySuite, type CallSuiteSpec } from "./expect";

// The conformance checker itself must be pinned: a lax matcher turns a broken agent
// into a green eval — the one failure mode this framework must not have.

const RUN = {
  dispatched: [
    { name: "hubspot__get_contact", args: { name: "Karl Studio" } },
    { name: "browser__browser_navigate", args: { url: "https://karl-studio.fr" } },
    { name: "gmail__send_email", args: { to: "contact@karl-studio.fr", subject: "Devis", body: "ok" } },
  ],
  confirmedTools: ["gmail__send_email"],
  answer: "C'est envoyé — devis confirmé auprès de Karl Studio.",
};

describe("verifySuite — sequence (subsequence semantics)", () => {
  it("passes when required calls appear in order, extra calls tolerated", () => {
    const spec: CallSuiteSpec = {
      sequence: [
        { tool: "hubspot__get_contact" },
        { tool: "gmail__send_email", where: { to: "contact@karl-studio.fr" } },
      ],
    };
    expect(verifySuite(spec, RUN)).toEqual({ ok: true, failures: [] });
  });

  it("FAILS on out-of-order required calls (wrote before it read)", () => {
    const spec: CallSuiteSpec = {
      sequence: [{ tool: "gmail__send_email" }, { tool: "hubspot__get_contact" }],
    };
    const v = verifySuite(spec, RUN);
    expect(v.ok).toBe(false);
    expect(v.failures[0]).toContain("hubspot__get_contact");
  });

  it("FAILS on a mis-parameterised call, naming the offending arg (near-miss)", () => {
    const spec: CallSuiteSpec = {
      sequence: [{ tool: "gmail__send_email", where: { to: "someone-else@corp.fr" } }],
    };
    const v = verifySuite(spec, RUN);
    expect(v.ok).toBe(false);
    expect(v.failures[0]).toMatch(/arg « to »/);
  });

  it("string arg-matcher is case-insensitive containment; RegExp and predicate work", () => {
    const spec: CallSuiteSpec = {
      sequence: [
        { tool: "browser__browser_navigate", where: { url: "KARL-STUDIO.FR" } },
        { tool: "gmail__send_email", where: { subject: /^Devis$/, body: (v) => v === "ok" } },
      ],
    };
    expect(verifySuite(spec, RUN).ok).toBe(true);
  });

  it("an optional step may be skipped; a required one may not", () => {
    const spec: CallSuiteSpec = {
      sequence: [
        { tool: "slack__send_message", optional: true },
        { tool: "gmail__send_email" },
      ],
    };
    expect(verifySuite(spec, RUN).ok).toBe(true);
    expect(verifySuite({ sequence: [{ tool: "slack__send_message" }] }, RUN).ok).toBe(false);
  });
});

describe("verifySuite — forbidden / confirms / answer", () => {
  it("flags a forbidden dispatch, with its args in the failure", () => {
    const v = verifySuite({ sequence: [], forbidden: [/send_email$/] }, RUN);
    expect(v.ok).toBe(false);
    expect(v.failures[0]).toContain("contact@karl-studio.fr");
  });

  it("requires the named confirm cards to have OPENED", () => {
    expect(verifySuite({ sequence: [], confirms: ["gmail__send_email"] }, RUN).ok).toBe(true);
    const v = verifySuite({ sequence: [], confirms: ["google-calendar__create_event"] }, RUN);
    expect(v.ok).toBe(false);
  });

  it("checks the final answer (RegExp or predicate)", () => {
    expect(verifySuite({ sequence: [], answer: /envoyé/i }, RUN).ok).toBe(true);
    expect(verifySuite({ sequence: [], answer: (s) => s.includes("refusé") }, RUN).ok).toBe(false);
  });

  it("an empty run fails a non-empty spec with a diagnosable message", () => {
    const v = verifySuite({ sequence: [{ tool: "gmail__send_email" }] }, { dispatched: [], confirmedTools: [], answer: "" });
    expect(v.ok).toBe(false);
    expect(v.failures[0]).toContain("aucun");
  });
});

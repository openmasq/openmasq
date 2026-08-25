import { describe, it, expect } from "vitest";
import { isWriteToolName } from "./writeGate";

describe("isWriteToolName (audit M6 — mirrors the renderer write heuristic)", () => {
  it("flags mutating verbs and un-annotated unknowns (fail closed)", () => {
    expect(isWriteToolName("gmail__send_email")).toBe(true);
    expect(isWriteToolName("stripe__create_customer")).toBe(true);
    expect(isWriteToolName("fs__delete_file")).toBe(true);
    expect(isWriteToolName("db__execute_sql")).toBe(true);
    expect(isWriteToolName("gh__merge_pull_request")).toBe(true);
    // Neither read nor write verb, no annotation → treat as WRITE (unknown effect).
    expect(isWriteToolName("acme__frobnicate")).toBe(true);
  });

  it("a GENERIC name is a write on BOTH sides of the boundary (the drift regression)", () => {
    // The two hand-kept classifiers had drifted with OPPOSITE defaults; both now call
    // catalog's `classifyToolWrite`, so these must be writes here AND in the renderer.
    for (const n of ["notion__notion-duplicate-page", "linear__issue", "stripe__customers"]) {
      expect(isWriteToolName(n), n).toBe(true);
    }
  });

  it("leaves genuine read-only tools ungated", () => {
    expect(isWriteToolName("gmail__list_messages")).toBe(false);
    expect(isWriteToolName("stripe__search_customers")).toBe(false);
    expect(isWriteToolName("gh__get_issue")).toBe(false);
    // A vendor-prefixed read verb with ZERO write evidence stays a read — what keeps
    // the fail-closed default from prompting on every Notion/Stripe read tool.
    expect(isWriteToolName("stripe__stripe_api_read")).toBe(false);
    expect(isWriteToolName("notion__notion-fetch")).toBe(false);
    expect(isWriteToolName("acme__frobnicate", { readOnlyHint: true })).toBe(false);
  });

  it("a destructive verb hides behind a read token — the anchor closes it", () => {
    expect(isWriteToolName("mail__delete_read_receipts")).toBe(true);
    expect(isWriteToolName("crm__get_and_purge")).toBe(true);
  });

  it("a compromised server annotation can RAISE but not LOWER suspicion", () => {
    // destructiveHint / readOnlyHint:false force a write even for a read-verb name.
    expect(isWriteToolName("acme__get_report", { destructiveHint: true })).toBe(true);
    expect(isWriteToolName("acme__list_things", { readOnlyHint: false })).toBe(true);
    // A read-verb + conjunction + write verb is a write despite the read prefix.
    expect(isWriteToolName("gmail__get_and_send_email")).toBe(true);
    // But readOnlyHint:true must NOT wave through a write-verb NAME.
    expect(isWriteToolName("gmail__send_email", { readOnlyHint: true })).toBe(true);
  });
});

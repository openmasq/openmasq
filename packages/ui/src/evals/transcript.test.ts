import { describe, expect, it } from "vitest";
import { Transcript } from "./transcript";

// The evals themselves need a real model + a key, so they can't run here. The views they
// assert THROUGH are pure, and they are pinned here — a wrong view turns a real leak into
// a green eval, which is the one failure mode this whole harness exists to prevent.

function turn(): Transcript {
  const t = new Transcript();
  t.push({ t: "model:in", messages: [{ role: "user", content: "un mail à Norvik Group" }] });
  t.push({ t: "model:out", text: "", calls: [{ name: "gmail__search", args: { q: "Norvik Group" } }] });
  t.push({ t: "tool:out", name: "gmail__search", args: { q: "Karl Studio" } });
  t.push({ t: "tool:in", name: "gmail__search", text: "De : Norvik Group" });
  t.push({ t: "model:in", messages: [{ role: "tool", content: "De : Norvik Group" }] });
  t.push({ t: "model:out", text: "Trouvé.", calls: [] });
  t.push({ t: "answer", text: "Trouvé chez Karl Studio." });
  return t;
}

describe("Transcript — the two sides of the trust boundary", () => {
  it("separates what the model ASKED from what was DISPATCHED", () => {
    const t = turn();
    expect(t.asked()).toEqual(["gmail__search"]);
    expect(t.dispatched()).toEqual(["gmail__search"]);
  });

  it("a gate that refuses shows up as asked-but-NOT-dispatched", () => {
    const t = new Transcript();
    t.push({ t: "model:out", text: "", calls: [{ name: "gmail__send_email", args: {} }] });
    t.push({ t: "confirm", tool: "gmail__send_email", reason: "write", approved: false });
    expect(t.asked()).toEqual(["gmail__send_email"]);
    expect(t.dispatched()).toEqual([]); // refused ⇒ never left
    expect(t.confirms()).toEqual([{ tool: "gmail__send_email", reason: "write", approved: false }]);
  });

  it("wireArgsOf is what the OUTSIDE received — the REAL value, not the fake", () => {
    // The model asked with the fake ("Norvik Group"); the client un-redacted on the way out.
    expect(turn().wireArgsOf("gmail__search")).toEqual({ q: "Karl Studio" });
    expect(turn().wireArgsOf("nope__nope")).toBeUndefined();
  });

  it("modelInbox spans EVERY model call, not just the last", () => {
    const inbox = turn().modelInbox();
    expect(inbox).toContain("un mail à Norvik Group");
    expect(inbox).toContain("De : Norvik Group");
  });
});

describe("Transcript.leaked — the promise the whole harness exists for", () => {
  it("returns [] when the model only ever saw fakes", () => {
    // "Karl Studio" is the REAL value; it appears in tool:out and in the de-redacted
    // ANSWER, and neither is the model's inbox — so neither is a leak.
    expect(turn().leaked(["Karl Studio"])).toEqual([]);
  });

  it("CATCHES a real value that reached the model", () => {
    const t = turn();
    t.push({ t: "model:in", messages: [{ role: "tool", content: "contact: Karl Studio" }] });
    expect(t.leaked(["Karl Studio"])).toEqual(["Karl Studio"]);
  });

  it("is case-INSENSITIVE — the engine expands a value to every casing, so a leak in\n     another casing is still a leak (an exact match would report a clean turn)", () => {
    const t = new Transcript();
    t.push({ t: "model:in", messages: [{ role: "tool", content: "de la part de KARL STUDIO" }] });
    expect(t.leaked(["Karl Studio"])).toEqual(["Karl Studio"]);
  });

  it("ignores empty secrets (an empty vault value would otherwise match everything)", () => {
    const t = turn();
    expect(t.leaked([""])).toEqual([]);
  });
});

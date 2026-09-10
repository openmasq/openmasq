import type { RedactionMatch } from "@openmasq/redact";
import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../../config/config";
import { categoryPill } from "./pills";
import { createReporter, revealFor } from "./reporter";
import { createTty } from "./tty";

const m = (category: string): RedactionMatch =>
  ({ type: "x", value: "REAL-VALUE", placeholder: "FAKE", category }) as RedactionMatch;

const capture = () => {
  const lines: string[] = [];
  return { lines, write: (l: string) => lines.push(l) };
};

describe("reporter", () => {
  it("writes one request line with a pill per category, counts only — never a value", () => {
    const c = capture();
    const r = createReporter({ write: c.write, colors: false, now: () => 0 });
    r.request({
      method: "POST",
      path: "/v1/messages",
      family: "anthropic",
      status: 200,
      ms: 812,
      matches: [m("EMAIL"), m("NAME"), m("NAME")],
      stream: true,
    });
    const out = c.lines.join("\n");
    expect(out).toContain("POST");
    expect(out).toContain("/v1/messages");
    expect(out).toContain("[200]");
    expect(out).toContain("812ms");
    expect(out).toContain("stream");
    expect(out).toContain("[NAME 2]");
    expect(out).toContain("[EMAIL 1]");
    expect(out).toContain("3 masked");
    expect(out).not.toContain("REAL-VALUE");
    expect(out).not.toContain("FAKE");
  });

  it("says when there was nothing to mask, and keeps quiet mode to errors", () => {
    const c = capture();
    const r = createReporter({ write: c.write, colors: false });
    r.request({
      method: "GET",
      path: "/v1/models",
      family: "openai",
      status: 200,
      ms: 40,
      matches: [],
      stream: false,
    });
    // A relayed GET carried no text: ONE line, and no "nothing to mask" under it — a
    // client's health probe must not read like a request that had nothing sensitive in it.
    expect(c.lines.join("\n")).toContain("GET /v1/models");
    expect(c.lines.join("\n")).not.toContain("nothing to mask");
    // A POST that carried text and had nothing to mask still says so.
    r.request({
      method: "POST",
      path: "/v1/messages",
      family: "anthropic",
      status: 200,
      ms: 40,
      matches: [],
      stream: false,
    });
    expect(c.lines.join("\n")).toContain("nothing to mask");
    const q = capture();
    const quiet = createReporter({ write: q.write, colors: false, quiet: true });
    quiet.request({
      method: "GET",
      path: "/v1/models",
      family: "openai",
      status: 200,
      ms: 40,
      matches: [],
      stream: false,
    });
    quiet.error(502, "fetch failed", "ECONNREFUSED");
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toContain("502");
    expect(q.lines[0]).toContain("ECONNREFUSED");
  });

  it("emits one JSON object per line in json mode, and totals in the summary otherwise", () => {
    const j = capture();
    const json = createReporter({ write: j.write, json: true, now: () => 0 });
    json.banner(DEFAULTS, { model: "on", version: "0.1.0" });
    json.request({
      method: "POST",
      path: "/v1/chat/completions",
      family: "openai",
      status: 200,
      ms: 100,
      matches: [m("EMAIL")],
      stream: false,
      session: "s1",
    });
    expect(j.lines).toHaveLength(1);
    expect(JSON.parse(j.lines[0])).toMatchObject({
      method: "POST",
      status: 200,
      masked: 1,
      categories: { EMAIL: 1 },
      session: "s1",
    });
    const c = capture();
    const r = createReporter({ write: c.write, colors: false, now: () => 0 });
    r.request({
      method: "POST",
      path: "/v1/messages",
      family: "anthropic",
      status: 200,
      ms: 1,
      matches: [m("EMAIL"), m("NAME")],
      stream: false,
    });
    r.request({
      method: "POST",
      path: "/v1/messages",
      family: "anthropic",
      status: 200,
      ms: 1,
      matches: [m("NAME")],
      stream: false,
    });
    expect(r.stats()).toMatchObject({ requests: 2, totals: { NAME: 2, EMAIL: 1 } });
  });

  it("draws the card with the endpoint and the env lines, and hides the env block when compact", () => {
    const c = capture();
    const r = createReporter({ write: c.write, colors: false, now: () => 0 });
    r.banner({ ...DEFAULTS, port: 8787, level: "renforce" }, { model: "on", version: "1.2.3" });
    const full = c.lines.join("\n");
    expect(full).toContain("OpenMasq proxy");
    expect(full).toContain("http://127.0.0.1:8787");
    expect(full).toContain("OPENAI_BASE_URL=http://127.0.0.1:8787/v1");
    expect(full).toContain("local model ✓");
    const d = capture();
    createReporter({ write: d.write, colors: false }).banner(
      { ...DEFAULTS, rulesOnly: true, level: "renforce" },
      { model: "off", version: "1", compact: true },
    );
    const compact = d.lines.join("\n");
    expect(compact).toContain("model OFF");
    expect(compact).not.toContain("OPENAI_BASE_URL");
    // The default level needs no model at all: that is a statement, not a warning.
    const s = capture();
    createReporter({ write: s.write, colors: false }).banner(DEFAULTS, {
      model: "rules",
      version: "1",
    });
    expect(s.lines.join("\n")).toContain("pattern rules only");
  });

  /** The card is where the upstreams are stated, so the reporter reads them there rather than
   *  having every call site carry a host: a reporter that printed no card names the family. */
  it("learns from the card which host each family goes to", () => {
    const c = capture();
    const r = createReporter({ write: c.write, colors: false, now: () => 0 });
    const e = {
      method: "POST",
      path: "/v1/messages",
      family: "anthropic",
      status: 200,
      ms: 1,
      matches: [],
      stream: false,
    };
    r.request(e);
    expect(c.lines.join("\n")).toContain("anthropic");
    expect(c.lines.join("\n")).not.toContain("api.anthropic.com");
    r.banner(DEFAULTS, { model: "rules", version: "0.1.0" });
    const after = capture();
    const r2 = createReporter({ write: after.write, colors: false, now: () => 0 });
    r2.banner(DEFAULTS, { model: "rules", version: "0.1.0" });
    r2.request(e);
    expect(after.lines.join("\n")).toContain("api.anthropic.com");
  });

  it("colours a pill with the category's own hue, and prints plain brackets without colours", () => {
    const colored = categoryPill(createTty(true), "EMAIL", 1);
    expect(colored).toMatch(/\[48;2;\d+;\d+;\d+m/); // a 24-bit background
    expect(createTty(true).strip(colored)).toBe(" EMAIL 1 ");
    expect(categoryPill(createTty(false), "ORG", 2)).toBe("[COMPANY 2]"); // the engine's normalised category
  });

  it("reveals what each value became, one line per distinct value, only when asked", () => {
    const matches = [m("NAME"), m("NAME"), m("EMAIL")];
    matches[0].value = "Camille Roussel";
    matches[0].placeholder = "Armelle Aubertin";
    matches[1].value = "Camille Roussel"; // the same person twice: one line
    matches[1].placeholder = "Armelle Aubertin";
    matches[2].value = "camille@exemple.fr";
    matches[2].placeholder = "armelle@melvio.com";
    const off = capture();
    createReporter({ write: off.write, colors: false }).request({
      method: "POST",
      path: "/v1/messages",
      family: "anthropic",
      status: 200,
      ms: 1,
      matches,
      stream: false,
    });
    expect(off.lines.join("\n")).not.toContain("Camille Roussel");

    const on = capture();
    createReporter({ write: on.write, colors: false, reveal: { on: true } }).request({
      method: "POST",
      path: "/v1/messages",
      family: "anthropic",
      status: 200,
      ms: 1,
      matches,
      stream: false,
    });
    const out = on.lines.join("\n");
    expect(out).toContain("Camille Roussel → Armelle Aubertin");
    expect(out).toContain("camille@exemple.fr → armelle@melvio.com");
    expect(out.match(/Camille Roussel/g)).toHaveLength(1);
  });

  it("never reveals into a machine log", () => {
    const j = capture();
    const r = createReporter({ write: j.write, json: true, reveal: { on: true }, now: () => 0 });
    const one = m("NAME");
    one.value = "Camille Roussel";
    r.request({
      method: "POST",
      path: "/v1/messages",
      family: "anthropic",
      status: 200,
      ms: 1,
      matches: [one],
      stream: false,
    });
    expect(j.lines.join("\n")).not.toContain("Camille Roussel");
  });

  /** ⚠️ The property behind `--reveal --console -- <tool>`: the console page shows the
   *  values, the log FILE never does. The file reporter's toggle is off whatever the flag
   *  says — and stays off, since it is a separate object the `f` key never reaches. */
  it("never carries the reveal toggle into a file", () => {
    const reveal = { on: true };
    const file = revealFor(reveal, { toFile: true });
    expect(file.on).toBe(false);
    reveal.on = true;
    expect(file.on).toBe(false);
    expect(revealFor(reveal, { toFile: false })).toBe(reveal);
    const c = capture();
    const r = createReporter({ write: c.write, colors: false, reveal: file });
    r.request({
      method: "POST",
      path: "/v1/messages",
      family: "anthropic",
      status: 200,
      ms: 5,
      matches: [
        { type: "name", value: "REAL-VALUE", placeholder: "FAKE", category: "name" } as never,
      ],
      stream: false,
    });
    expect(c.lines.join("\n")).not.toContain("REAL-VALUE");
  });
});

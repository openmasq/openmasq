import { describe, expect, it } from "vitest";
import type { RedactionMatch } from "@openmasq/redact";
import type { RequestEvent } from "../../lib/ui/index";
import { REDACTION_SECTIONS } from "@openmasq/redact";
import { REDACTION_CATEGORIES } from "@openmasq/catalog";
import { getMessages } from "@openmasq/i18n";
import { disabledKindsFor } from "../../lib/masker";
import { MCP_CONNECTORS } from "@openmasq/catalog/mcp";
import {
  activeCategories,
  connectorCatalog,
  createConsoleBus,
  sideShown,
  rules,
  sectionOf,
  sections,
  sectionSlug,
} from "./events";

const match = (value: string, placeholder: string, category: string): RedactionMatch =>
  ({ type: category, value, placeholder, category }) as RedactionMatch;

const request = (over: Partial<RequestEvent> = {}): RequestEvent => ({
  method: "POST",
  path: "/v1/chat/completions",
  family: "openai",
  status: 200,
  ms: 120.6,
  stream: false,
  matches: [match("camille@vidal.fr", "marc@brevanet.fr", "email")],
  ...over,
});

const at = () => new Date("2026-09-09T16:04:08").getTime();

const EN = getMessages("en").redactionCatalog;

describe("what the console is allowed to know", () => {
  it("sends the substitute and NOT the real value by default", () => {
    const bus = createConsoleBus(false, at);
    const seen: unknown[] = [];
    bus.subscribe((e) => seen.push(e));
    bus.publish(request());
    expect(JSON.stringify(seen)).toContain("marc@brevanet.fr");
    expect(JSON.stringify(seen)).not.toContain("camille@vidal.fr");
  });

  it("adds the real value beside it only when the RUN revealed", () => {
    const bus = createConsoleBus(true, at);
    const seen: { items: { real?: string; fake: string }[] }[] = [];
    bus.subscribe((e) => seen.push(e));
    bus.publish(request());
    expect(seen[0].items[0]).toEqual({
      cat: "contact",
      fake: "marc@brevanet.fr",
      real: "camille@vidal.fr",
      type: EN.categories.email.label,
      n: 1,
    });
  });

  it("drops the query string, exactly as the terminal does — a Gemini key rides in ?key=", () => {
    const bus = createConsoleBus(false, at);
    const seen: { path: string }[] = [];
    bus.subscribe((e) => seen.push(e));
    bus.publish(request({ path: "/v1beta/models/x:generateContent?key=SECRET" }));
    expect(seen[0].path).toBe("/v1beta/models/x:generateContent");
  });

  it("labels the value from the CATALOGUE, never a string invented here", () => {
    const bus = createConsoleBus(false, at);
    const seen: { items: { type: string }[] }[] = [];
    bus.subscribe((e) => seen.push(e));
    bus.publish(request({ matches: [match("FR76…", "FR14…", "iban")] }));
    // The catalogue's own wording, verbatim and in the console's language (the English
    // i18n catalogue) — this test would fail if the console started inventing a shorter one.
    expect(seen[0].items[0].type).toBe(EN.categories.iban.label);
  });

  it("folds a repeated value into ONE row that COUNTS its occurrences", () => {
    const bus = createConsoleBus(false, at);
    const seen: { items: unknown[] }[] = [];
    bus.subscribe((e) => seen.push(e));
    bus.publish(
      request({
        matches: [
          match("/a/b", "/x/y", "path"),
          match("/a/b", "/x/y", "path"),
          match("Acme", "Cyberdyne", "company"),
        ],
      }),
    );
    expect(seen[0].items).toHaveLength(2);
    // Folded, not dropped: the per-value view shows how often it left.
    expect(seen[0].items[0]).toMatchObject({ fake: "/x/y", n: 2 });
    expect(seen[0].items[1]).toMatchObject({ fake: "Cyberdyne", n: 1 });
  });

  it("gives a tab opened late the backlog, and bounds it", () => {
    const bus = createConsoleBus(false, at);
    for (let i = 0; i < 600; i++) bus.publish(request({ ms: i }));
    expect(bus.backlog()).toHaveLength(500);
    // Bounded from the FRONT: what a late tab sees is the most recent traffic.
    expect(bus.backlog().at(-1)?.ms).toBe(599);
  });

  it("stops sending to a subscriber that left", () => {
    const bus = createConsoleBus(false, at);
    let n = 0;
    const off = bus.subscribe(() => n++);
    bus.publish(request());
    off();
    bus.publish(request());
    expect(n).toBe(1);
    expect(bus.subscribers()).toBe(0);
  });

  it("levels the event the way the page reads it: a refusal is a 403", () => {
    const bus = createConsoleBus(false, at);
    const seen: { status: number; items: unknown[] }[] = [];
    bus.subscribe((e) => seen.push(e));
    bus.publish(request({ status: 403, matches: [] }));
    expect(seen[0]).toMatchObject({ status: 403, items: [] });
  });
});

describe("the colour a value is painted in", () => {
  it("speaks in SECTIONS, which is what the palette names", () => {
    // The engine says `email`; the design token is `--cav-contact`. `CATEGORY_SECTION` is the
    // one home of that step, so the page never has to guess.
    expect(sectionOf(match("a@b.fr", "x@y.fr", "email"))).toBe("contact");
    expect(sectionOf(match("FR76…", "FR14…", "iban"))).toBe("financier");
    expect(sectionOf(match("Jean", "Marc", "name"))).toBe("identite");
  });

  it("paints an unknown category as a SECRET, which is the engine's own fail-closed default", () => {
    // `redactionCategory` resolves anything it does not recognise to `secret`, so the most
    // cautious colour is what an unclassified value wears — not a neutral grey.
    expect(sectionOf(match("x", "y", "not-a-category"))).toBe("secrets");
  });

  it("hands the page the product's OWN sections, so it holds no list to drift", () => {
    // The kit shipped eight of the nine plus a fallback, which left `Système` rendering as a
    // bare lowercase id the first time a file path was masked. The page now holds none.
    expect(sections()).toHaveLength(REDACTION_SECTIONS.length);
    // The console is in English: the label is the i18n catalogue's, the id the token slug.
    expect(sections()).toContainEqual({ id: "systeme", label: EN.sections["Système"] });
    for (const label of REDACTION_SECTIONS)
      expect(sections().map((x) => x.id)).toContain(sectionSlug(label));
  });
});

describe("the rules panel's data", () => {
  /** The page paints the catalogue's own tree — a category added upstream has to reach the
   *  panel without an edit in the page or a label re-typed in it. */
  it("is the product's sections, with the product's labels", () => {
    const tree = rules();
    expect(tree.map((s) => s.label)).toEqual(REDACTION_SECTIONS.map((fr) => EN.sections[fr]));
    const items = tree.flatMap((s) => s.items);
    expect(items.length).toBe(REDACTION_CATEGORIES.length);
    for (const it of items) {
      // English, from the i18n catalogue — the source label only when no translation exists.
      const en = (EN.categories as Record<string, { label: string } | undefined>)[it.key];
      expect(it.label).toBe(en?.label ?? REDACTION_CATEGORIES.find((c) => c.key === it.key)?.label);
      expect(typeof it.ai).toBe("boolean");
    }
  });

  /**
   * ⚠️ The invariant: what the panel shows as ON and what the masker actually masks are ONE
   * reading of the rules. A panel computing its own would be read against the log beside it —
   * and would be believed.
   */
  it("agrees with the masker, level by level and with --disable", () => {
    for (const level of ["standard", "renforce", "strict"] as const) {
      for (const extra of [[], ["email"], ["name", "iban"]]) {
        const on = activeCategories(level, extra);
        const off = disabledKindsFor(level, extra);
        expect(on.filter((k) => off.includes(k)), `${level} ${extra.join()}`).toEqual([]);
        for (const k of extra) expect(on).not.toContain(k);
      }
    }
    // The levels differ the way the catalogue says: the model's categories are what `renforce`
    // adds, and `strict` leaves nothing off.
    expect(activeCategories("standard", [])).not.toContain("name");
    expect(activeCategories("renforce", [])).toContain("name");
    expect(activeCategories("strict", []).length).toBe(REDACTION_CATEGORIES.length);
  });
});

/* The MCP panel lists the desktop's own catalogue, and it lists it with the BRAND MARKS —
   the reason the marks moved to `@openmasq/catalog/mcp`, which a Node-only proxy can import.
   The hard constraint is that a mark travels WITH the list: the console page may fetch
   nothing from anywhere, so a remote logo URL would be a blank tile at best and a privacy
   console phoning a CDN at worst. */
describe("the connector catalogue carries its marks, and nothing to fetch", () => {
  const cat = connectorCatalog();

  it("is the catalogue itself, never a second list", () => {
    expect(cat.connectors).toHaveLength(MCP_CONNECTORS.length);
    expect(cat.connectors.map((c) => c.id).sort()).toEqual(MCP_CONNECTORS.map((c) => c.id).sort());
  });

  it("gives a real mark to every BRAND, and letters only to what is not one", () => {
    const lettersOnly = cat.connectors.filter((c) => !c.logo && !c.img).map((c) => c.id).sort();
    // The local server, the built-in browser and the demo broker are not brands — the
    // desktop paints those with initials too.
    expect(lettersOnly).toEqual(["browser", "demo", "filesystem"]);
  });

  it("embeds every mark — a tile must never cost a request", () => {
    const wire = JSON.stringify(cat);
    expect(wire).not.toMatch(/https?:\/\//);
    for (const c of cat.connectors) {
      if (c.logo) expect(c.logo.hex, c.id).toMatch(/^#[0-9a-fA-F]{6}$/);
      if (c.img) expect(c.img, c.id).toMatch(/^data:image\//);
    }
  });

  /** ALLOW-listed, not deny-listed (rule 7): a field added upstream reaches this panel only
   *  by being named here, so a connector entry that one day carries a token cannot ride out
   *  to a browser tab because nobody thought to exclude it. */
  it("carries no field beyond what a tile needs", () => {
    const ALLOWED = new Set(["id", "name", "category", "tone", "logo", "img"]);
    for (const c of cat.connectors)
      for (const k of Object.keys(c)) expect(ALLOWED.has(k), `${c.id}.${k}`).toBe(true);
  });
});

/* A mark colours the redacted SPAN of whatever is on screen -- one rule, but it lands on
   opposite values depending on which side you are looking at. This page is a log of what
   left, so its marks sit on substitutes; the app's composer shows what you wrote, so its
   marks sit on the real values. Read one after the other that looks inverted, and the fix is
   to NAME the side rather than to flip either. Both names are the app's own. */
describe("the page says which side of the crossing it shows", () => {
  it("names this side and the other one with the app's own words", () => {
    const t = getMessages("en").modals.transparency;
    expect(sideShown()).toEqual({ here: t.modelReceived, there: t.youWrote });
  });

  it("never invents them -- a rewording upstream reaches the page", () => {
    const { here, there } = sideShown();
    const en = getMessages("en").modals.transparency;
    expect([here, there]).toEqual([en.modelReceived, en.youWrote]);
    expect(here).not.toBe(there);
  });
});

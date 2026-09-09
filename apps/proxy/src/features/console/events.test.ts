import { describe, expect, it } from "vitest";
import type { RedactionMatch } from "@openmasq/redact";
import type { RequestEvent } from "../../lib/ui/index";
import { REDACTION_SECTIONS } from "@openmasq/redact";
import { createConsoleBus, sectionOf, sections, sectionSlug } from "./events";

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
      type: "E-mail",
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
    // The catalogue's own wording, verbatim — this test would fail if the console started
    // inventing a shorter one.
    expect(seen[0].items[0].type).toBe("IBAN / coordonnées bancaires");
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
    expect(sections()).toContainEqual({ id: "systeme", label: "Système" });
    for (const label of REDACTION_SECTIONS)
      expect(sections().map((x) => x.id)).toContain(sectionSlug(label));
  });
});

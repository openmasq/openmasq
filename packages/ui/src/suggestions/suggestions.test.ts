import { getMessages, LOCALES } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS, findConnector } from "@openmasq/catalog/mcp";
import { isUntouchedDraft, pickSuggestions } from "./suggestions";
import {
  skillSuggestions,
  suggestedSkills,
  type SkillSuggestion,
} from "./skillSuggestions";
import {
  routineSuggestions,
  focusRoutines,
  ownKeysNeeded,
  suggestedRoutines,
} from "./routineSuggestions";
import { genericRoutineFor } from "./routineGeneric";
import { offeredTemplates, isRoutineTemplate, templateCategory } from "./offered";
import { SKILL_CATEGORIES } from "../skills/skills";
import { makeSkill } from "../skills/skills";
import type { Skill } from "../types";

const asSkill = (s: SkillSuggestion): Skill =>
  makeSkill({ name: s.name, prompt: s.prompt, desc: s.desc, cat: s.cat })!;

const fr = getMessages("fr");
const SKILL_LIST = skillSuggestions(fr);
const ROUTINE_LIST = routineSuggestions(fr);

describe("pickSuggestions", () => {
  const all = [
    { id: "a", name: "Réponse e-mail", desc: "", prompt: "p" },
    { id: "b", name: "Résumé", desc: "", prompt: "p" },
    { id: "c", name: "Traduction", desc: "", prompt: "p" },
  ];

  it("drops a template the user already authored — by NAME, case/accent-insensitive", () => {
    // The saved copy carries a fresh id, so only the name can recognise it.
    const kept = pickSuggestions(all, [{ name: "  reponse E-MAIL " }], 10);
    expect(kept.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("caps at the limit and keeps catalog order when nothing ranks", () => {
    expect(pickSuggestions(all, [], 2).map((s) => s.id)).toEqual(["a", "b"]);
    expect(pickSuggestions(all, [], 0)).toEqual([]);
  });

  it("ranks by score, ties keeping catalog order", () => {
    const score = (s: { id: string }) => (s.id === "c" ? 1 : 0);
    expect(pickSuggestions(all, [], 3, { score }).map((s) => s.id)).toEqual(["c", "a", "b"]);
  });

  describe("reserveLastFor", () => {
    const score = (s: { id: string }) => (s.id === "c" ? 0 : 1); // c ranks last
    const isC = (s: { id: string }) => s.id === "c";

    it("gives the last slot to a dropped match when the cap hid every one of them", () => {
      expect(pickSuggestions(all, [], 2, { score }).map((s) => s.id)).toEqual(["a", "b"]);
      expect(pickSuggestions(all, [], 2, { score, reserveLastFor: isC }).map((s) => s.id)).toEqual([
        "a",
        "c",
      ]);
    });

    it("leaves the list alone when a match already made the cut", () => {
      expect(pickSuggestions(all, [], 3, { score, reserveLastFor: isC }).map((s) => s.id)).toEqual([
        "a",
        "b",
        "c",
      ]);
    });

    it("leaves the list alone when nothing was dropped, and never duplicates", () => {
      const two = all.slice(0, 2); // no "c" to reserve for
      expect(pickSuggestions(two, [], 5, { score, reserveLastFor: isC }).map((s) => s.id)).toEqual([
        "a",
        "b",
      ]);
    });
  });
});

describe("isUntouchedDraft — the guard that makes a pick safe without a confirm", () => {
  const all = [{ id: "a", name: "Résumé", desc: "d", prompt: "p" }];

  it("is true on an empty draft and on a verbatim template (re-pick allowed)", () => {
    expect(isUntouchedDraft({ name: "", desc: "", prompt: "" }, all)).toBe(true);
    expect(isUntouchedDraft({ name: " ", desc: "", prompt: "\n" }, all)).toBe(true);
    expect(isUntouchedDraft({ name: "Résumé", desc: "d", prompt: "p" }, all)).toBe(true);
  });

  it("is false as soon as ANY field was edited — typed work is never overwritten", () => {
    expect(isUntouchedDraft({ name: "Résumé", desc: "d", prompt: "p et plus" }, all)).toBe(false);
    expect(isUntouchedDraft({ name: "Mon résumé", desc: "d", prompt: "p" }, all)).toBe(false);
    expect(isUntouchedDraft({ name: "", desc: "", prompt: "juste mon texte" }, all)).toBe(false);
  });
});

describe("COMPETENCE_LIST", () => {
  it("are all saveable as-is (the create bar `makeCompetence` enforces)", () => {
    for (const s of SKILL_LIST) expect(asSkill(s)).not.toBeNull();
  });

  it("carry a known category and unique ids/names", () => {
    const cats = new Set(SKILL_CATEGORIES.map((c) => c.id));
    for (const s of SKILL_LIST) expect(cats.has(s.cat)).toBe(true);
    expect(new Set(SKILL_LIST.map((s) => s.id)).size).toBe(
      SKILL_LIST.length,
    );
    expect(new Set(SKILL_LIST.map((s) => s.name)).size).toBe(
      SKILL_LIST.length,
    );
  });

  /**
   * ⚠️ The OFFERED list, not the catalogue: the strip is capped, so it is the catalogue's
   * order that a person actually sees — grouped by theme, a lawyer would only ever see
   * redaction.
   *
   * « Routines » is served by the OTHER catalogue (`ROUTINE_LIST`): it has its
   * own ranking rule (what is connected goes first), and the two only meet
   * in `offeredTemplates`. So it is excluded here and required there —
   * requiring it on both sides would force writing a "routine" prose template that
   * drives nothing, i.e. lying about what the category is.
   */
  it("cover every category IN THE OFFERED SET — the strip is capped, so catalog order is what a user actually sees", () => {
    const shown = new Set(suggestedSkills([], fr).map((s) => s.cat));
    for (const c of SKILL_CATEGORIES) {
      if (c.id === "routine") continue;
      expect(shown.has(c.id), `no template shown for "${c.id}"`).toBe(true);
    }
  });

  it("« Routines » est servie par l'autre catalogue — la fusion n'a laissé aucune catégorie vide", () => {
    const offered = offeredTemplates([], fr, { limit: 99 });
    const cats = new Set(offered.map(templateCategory));
    for (const c of SKILL_CATEGORIES)
      expect(cats.has(c.id), `aucun modèle proposé pour « ${c.id} »`).toBe(true);
    // And an offered routine ACTUALLY drives connectors: this field, and it
    // alone, is what makes the behavioural difference.
    for (const t of offered.filter((x) => templateCategory(x) === "routine"))
      expect(isRoutineTemplate(t) && t.servers.length > 0, t.id).toBe(true);
  });

  it("stop being offered once saved — a picked template never re-appears", () => {
    const saved = [asSkill(SKILL_LIST[0])];
    const offered = suggestedSkills(saved, fr, 99);
    expect(offered.some((s) => s.id === SKILL_LIST[0].id)).toBe(false);
    expect(offered).toHaveLength(SKILL_LIST.length - 1);
  });
});

describe("ROUTINE_LIST", () => {
  it("are all saveable as-is", () => {
    for (const s of ROUTINE_LIST)
      expect(
        makeSkill({ name: s.name, prompt: s.prompt, desc: s.desc, servers: s.servers }),
      ).not.toBeNull();
  });

  it("only name connector ids the CATALOG knows (rule 9 — no second registry here)", () => {
    for (const s of ROUTINE_LIST)
      for (const id of s.servers)
        expect(findConnector(id), `unknown connector "${id}" in template "${s.id}"`).toBeTruthy();
  });

  it("leads with a template that needs NO ACCOUNT — a first-run user has nothing connected, so catalog order is all they get", () => {
    const first = suggestedRoutines([], fr)[0];
    for (const id of first.servers)
      expect(findConnector(id)?.transport, `"${first.id}" needs an account`).toBe("builtin");
  });

  it("keeps the dev-only routines OUT of the capped default strip", () => {
    const shown = suggestedRoutines([], fr).flatMap((s) => s.servers);
    for (const devOnly of ["github", "linear", "sentry"]) expect(shown).not.toContain(devOnly);
    expect(suggestedRoutines([], fr).map((s) => s.id)).toContain("revue-boite-mail");
  });

  it("the default strip is FULLY launchable in one click (30/07/2026: no gated template left)", () => {
    // Since 1-click covers 100% of Google's capabilities, no template
    // requires "vos clés" anymore. The historic rule (at most ONE gated template, marked)
    // re-applies itself on its own if a gated connector comes back into the catalogue.
    const gated = suggestedRoutines([], fr).filter((s) => ownKeysNeeded(s, fr).length > 0);
    expect(gated).toEqual([]);
  });

  it("« Préparer ma journée » stays CASA-free — no Gmail read hiding in the agenda routine", () => {
    const journee = ROUTINE_LIST.find((s) => s.id === "preparer-journee")!;
    expect(journee.servers).toEqual(["google-calendar"]);
    expect(ownKeysNeeded(journee, fr)).toEqual([]);
  });

  it("has unique ids and names, and every template names at least one connector", () => {
    expect(new Set(ROUTINE_LIST.map((s) => s.id)).size).toBe(ROUTINE_LIST.length);
    expect(new Set(ROUTINE_LIST.map((s) => s.name)).size).toBe(ROUTINE_LIST.length);
    for (const s of ROUTINE_LIST) expect(s.servers.length).toBeGreaterThan(0);
  });

  it("ranks the launchable ones first — a connected connector wins the top slot", () => {
    const last = ROUTINE_LIST[ROUTINE_LIST.length - 1];
    const offered = suggestedRoutines([], fr, { connected: new Set(last.servers) });
    expect(offered[0].id).toBe(last.id);
  });

  it("falls back to catalog order with nothing connected", () => {
    expect(suggestedRoutines([], fr, { connected: new Set(), limit: 99 }).map((s) => s.id)).toEqual(
      ROUTINE_LIST.map((s) => s.id),
    );
  });

  it("drops a template naming a connector this host cannot offer (a dead routine, not a hint)", () => {
    const offered = suggestedRoutines([], fr, { unavailable: new Set(["browser"]), limit: 99 });
    expect(offered.some((s) => s.servers.includes("browser"))).toBe(false);
    // …and only that one: the rest of the catalog is untouched.
    expect(offered).toHaveLength(
      ROUTINE_LIST.filter((s) => !s.servers.includes("browser")).length,
    );
  });

  it("always keeps ONE routine needing a new connection — the strip is how a 2nd integration is discovered", () => {
    // Enough connected that the 6 top-ranked templates would ALL be launchable.
    const connected = new Set([
      "browser",
      "gmail",
      "google-calendar",
      "google-drive",
      "slack",
      "tavily",
    ]);
    const offered = suggestedRoutines([], fr, { connected });
    const discovery = offered.filter((s) => !s.servers.some((id) => connected.has(id)));
    expect(discovery).toHaveLength(1);
    // …and it is the best-ranked one, not an arbitrary leftover.
    expect(discovery[0].id).toBe("compte-rendu-reunions");
    // The reserved slot costs exactly one: the rest is still launchable today.
    expect(offered).toHaveLength(6);
  });

  it("drops one already saved", () => {
    const saved = [
      makeSkill({ name: ROUTINE_LIST[0].name, prompt: "x" }) as Skill,
    ];
    expect(suggestedRoutines(saved, fr, { limit: 99 }).map((s) => s.id)).not.toContain(
      ROUTINE_LIST[0].id,
    );
  });
});

describe("focusRoutines — ticking an integration always answers about IT", () => {
  const ranked = suggestedRoutines([], fr, { limit: 99 });

  it("REGRESSION: an integration no curated template names still gets its own idea", () => {
    // Reported: tick Outlook → the panel showed Slack/Gmail ideas under « pour ces
    // intégrations », and clicking one swapped the tick that had just been made.
    const items = focusRoutines(ranked, new Set(["microsoft-outlook"]), fr);
    expect(items.length).toBeGreaterThan(0);
    for (const s of items) expect(s.servers).toEqual(["microsoft-outlook"]);
    expect(items[0].name).toContain("Outlook");
  });

  it("EVERY connector in the catalog answers with an idea scoped to itself", () => {
    // The promise in one assertion: no service may come back with someone else's idea.
    for (const c of MCP_CONNECTORS) {
      const items = focusRoutines(ranked, new Set([c.id]), fr);
      expect(items.length, `no idea for "${c.id}"`).toBeGreaterThan(0);
      expect(
        items.some((s) => s.servers.includes(c.id)),
        `ideas for "${c.id}" name none of it: ${items.map((s) => s.id).join(", ")}`,
      ).toBe(true);
    }
  });

  it("prefers the CURATED idea when one exists, and doesn't add a generic twin", () => {
    const items = focusRoutines(ranked, new Set(["gmail"]), fr);
    expect(items[0].id).toBe("revue-boite-mail");
    expect(items.some((s) => s.id.startsWith("generic:"))).toBe(false);
  });

  it("mixes curated + generated when the ticks span both, one per unserved service", () => {
    const items = focusRoutines(ranked, new Set(["gmail", "microsoft-outlook"]), fr);
    expect(items.some((s) => s.servers.includes("gmail"))).toBe(true);
    expect(items.filter((s) => s.id === "generic:microsoft-outlook")).toHaveLength(1);
  });

  it("stretches past the cap rather than dropping a ticked service", () => {
    // Eight ticks and six slots is the same broken promise, two services further down.
    const ticks = MCP_CONNECTORS.slice(0, 8).map((c) => c.id);
    const items = focusRoutines(ranked, new Set(ticks), fr, 6);
    for (const id of ticks)
      expect(
        items.some((s) => s.servers.includes(id)),
        `dropped "${id}"`,
      ).toBe(true);
  });

  it("un-ticking everything goes back to the general list", () => {
    expect(focusRoutines(ranked, new Set(), fr).map((s) => s.id)).toEqual(
      ranked.slice(0, 6).map((s) => s.id),
    );
  });
});

describe("genericRoutineFor", () => {
  it("is saveable, read-only, and speaks the catalog's own words", () => {
    const g = genericRoutineFor("microsoft-outlook", fr)!;
    expect(
      makeSkill({ name: g.name, prompt: g.prompt, desc: g.desc, servers: g.servers }),
    ).not.toBeNull();
    expect(g.prompt).toContain("Lecture seule");
    expect(g.prompt).toContain("{"); // a value to fill at launch, like every template
    expect(g.desc).toContain(findConnector("microsoft-outlook")!.desc.slice(1));
  });

  it("hérite du catalogue : plus AUCUN connecteur marqué « vos clés » depuis le 30/07/2026", () => {
    // The mark is DERIVED (`byoOnly`/`byoAdds`) and the catalogue no longer carries any —
    // 1-click covers 100% of Google's capabilities, and SharePoint/Teams are
    // `adminConsent` (a different mechanism). It relights on its own if a
    // gated connector comes back; the "is DERIVED" test below pins the derivation.
    for (const id of ["google-drive", "gmail", "microsoft-sharepoint", "slack"])
      expect(ownKeysNeeded(genericRoutineFor(id, fr)!, fr), id).toEqual([]);
  });

  it("returns nothing for an unknown id rather than inventing a service", () => {
    expect(genericRoutineFor("defunct-connector", fr)).toBeUndefined();
  });
});

describe("ownKeysNeeded — « il faut vos propres clés pour ça »", () => {
  const byId = (id: string) => ROUTINE_LIST.find((s) => s.id === id)!;

  it("Gmail et Drive ne sont PLUS gated — le 1-clic couvre lecture + envoi (30/07/2026)", () => {
    // This was the day predicted by the "is DERIVED" test below: the marks
    // disappeared on their own once `byoAdds`/`byoOnly` were removed from the catalogue.
    expect(ownKeysNeeded(byId("revue-boite-mail"), fr)).toEqual([]);
    expect(ownKeysNeeded(byId("point-client"), fr)).toEqual([]);
  });

  it("says nothing for a one-click template", () => {
    for (const id of [
      "comparer-offres",
      "preparer-journee",
      "point-hebdo-slack",
      "recherche-notion",
    ])
      expect(ownKeysNeeded(byId(id), fr), id).toEqual([]);
  });

  it("is DERIVED, so it disappears on its own the day the audit clears", () => {
    // Nothing in the template declares it — remove `byoAdds`/`byoOnly` from the
    // catalog and the mark is gone, with no template to edit.
    for (const s of ROUTINE_LIST)
      expect(Object.keys(s)).toEqual(expect.not.arrayContaining(["ownKeys", "byo", "needsKeys"]));
  });
});

describe("les modèles livrés existent dans CHAQUE langue", () => {
  /* The lists are `Record<string, …>`: an id added to the shape without its words
     compiles, and would render empty in front of the person. This test is what forbids that. */
  for (const locale of LOCALES) {
    it(`${locale} — chaque routine et chaque compétence a nom, description et invite`, () => {
      const t = getMessages(locale);
      for (const r of routineSuggestions(t)) {
        expect(r.name, r.id).toBeTruthy();
        expect(r.desc, r.id).toBeTruthy();
        expect(r.prompt, r.id).toBeTruthy();
      }
      for (const c of skillSuggestions(t)) {
        expect(c.name, c.id).toBeTruthy();
        expect(c.desc, c.id).toBeTruthy();
        expect(c.prompt, c.id).toBeTruthy();
      }
    });
  }
});

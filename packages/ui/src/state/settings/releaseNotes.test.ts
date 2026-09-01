import { getMessages } from "@openmasq/i18n";
import { describe, it, expect } from "vitest";
import { groupHighlights, latestPerVersion, splitHighlight } from "./releaseNotes";

// `groupHighlights` buckets Contentful's flat `highlights` list into the design's
// 3 colour-coded sections by an optional leading `feat:`/`imp:`/`fix:` token, while
// keeping un-prefixed bullets under "Nouveautés" so existing flat notes are unchanged.
const fr = getMessages("fr");

describe("groupHighlights", () => {
  it("puts un-prefixed bullets under Nouveautés (feat), preserving full text", () => {
    const groups = groupHighlights(["Workflows — enchaînez des actions", "Mode sombre"], fr);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "feat", label: "Nouveautés", tone: "" });
    expect(groups[0].items).toEqual(["Workflows — enchaînez des actions", "Mode sombre"]);
  });

  it("routes prefixed bullets into their group and strips the token", () => {
    const groups = groupHighlights([
      "feat: Nouvel onboarding",
      "imp: Recherche plus rapide",
      "fix: Correction du mode sombre",
    ], fr);
    expect(groups.map((g) => g.key)).toEqual(["feat", "imp", "fix"]);
    expect(groups.map((g) => g.tone)).toEqual(["", "imp", "fix"]);
    expect(groups[0].items).toEqual(["Nouvel onboarding"]);
    expect(groups[1].items).toEqual(["Recherche plus rapide"]);
    expect(groups[2].items).toEqual(["Correction du mode sombre"]);
  });

  it("keeps a real 'word:' bullet intact when the tag isn't a known category", () => {
    const groups = groupHighlights(["Stripe: nouvelle intégration"], fr);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("feat");
    expect(groups[0].items).toEqual(["Stripe: nouvelle intégration"]);
  });

  it("accepts category synonyms (French + English)", () => {
    const groups = groupHighlights([
      "amélioration: X",
      "improvement: Y",
      "bug: Z",
      "correction: W",
    ], fr);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.items]));
    expect(byKey.imp).toEqual(["X", "Y"]);
    expect(byKey.fix).toEqual(["Z", "W"]);
  });

  it("emits groups in Nouveautés → Améliorations → Corrections order and drops empties", () => {
    const groups = groupHighlights(["fix: A", "feat: B"], fr);
    expect(groups.map((g) => g.key)).toEqual(["feat", "fix"]);
  });

  it("ignores blank entries", () => {
    expect(groupHighlights(["", "   ", "feat:   "], fr)).toEqual([]);
  });
});

describe("splitHighlight", () => {
  it("splits 'Titre — bénéfice' and passes a plain string through", () => {
    expect(splitHighlight("Workflows — enchaînez")).toEqual({ title: "Workflows", body: "enchaînez" });
    expect(splitHighlight("Mode sombre")).toEqual({ title: "Mode sombre" });
  });
});

/**
 * ONE note per version. The endpoint returns several for the same version (a
 * welcome note and the real one), from most recent to oldest — the help
 * history therefore showed « 0.4.1 » twice in a row, which reads as an app bug.
 */
describe("latestPerVersion", () => {
  const note = (version: string, title: string) => ({ version, title, releaseDate: null, body: "", highlights: [] });

  it("garde la PREMIÈRE note de chaque version (la plus récente) et l'ordre reçu", () => {
    const out = latestPerVersion([note("0.4.1", "vraie"), note("0.4.1", "accueil"), note("0.3.1", "ancienne")]);
    expect(out.map((n) => `${n.version}:${n.title}`)).toEqual(["0.4.1:vraie", "0.3.1:ancienne"]);
  });

  it("un suffixe de pré-version ne crée pas une seconde entrée", () => {
    expect(latestPerVersion([note("v0.4.1", "a"), note("0.4.1-rc1", "b")]).map((n) => n.version)).toEqual(["v0.4.1"]);
  });

  it("une note sans version est ignorée plutôt que rendue sans titre de version", () => {
    expect(latestPerVersion([note("", "orpheline"), note("0.4.1", "a")]).map((n) => n.version)).toEqual(["0.4.1"]);
  });
});

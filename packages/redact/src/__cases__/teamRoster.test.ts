import { describe, expect, it } from "vitest";
import { pseudonymize, type Vault, type Detection } from "../index";

/**
 * End-to-end regression for the TEAM-PAGE audit (« the redaction looks approximate on
 * lists ») — a roster of "Prénom / rôle" pairs, plus an expert committee. Three
 * distinct failures were reported at once, each pinned here:
 *
 *  1. UNDER-detection — half the bare first names shipped in clear (no prose context,
 *     out-of-vocabulary names). Closed by `engine/teamLists.ts` (structure as context).
 *  2. GLUED spans — the NER emitted "Muriel DPO Vergnaud" (two people + a role label) and
 *     the variant-tolerant substitution faithfully redacted it ACROSS the list lines as
 *     ONE fake. Closed by `pseudonymize/lineSplit.ts` (a name never crosses a line).
 *  3. OVER-redaction — role labels ("Expert", "PARTNERSHIP"), lab words ("Medialab",
 *     the "Sciences" fragment of Sciences-Po) and world-famous institutions were faked.
 *     Closed by the role vocabulary + the academic entries in `notorious.ts`.
 */
const PAGE = `L'équipe derrière Velna

Aurélien
Product

Joséphine
Design

Milena
go-to-market

Fernand
Expert

Tharsiga
Security

Grégory
TECH

Muriel
DPO

Vergnaud
RED TEAM & AI

Astrid
JOURNALIST

Camille Fraysse
Professeure à Columbia University

Benjamin Verdelet
Medialab de Sciences-Po`;

/** The glued spans the real NER emitted on this material (from the user's journal). */
const gluedNer = async (): Promise<Detection[]> => [
  { value: "Fernand Expert", category: "PERSON" },
  { value: "Muriel DPO Vergnaud", category: "PERSON" },
  { value: "Camille Fraysse", category: "PERSON" },
  { value: "Benjamin Verdelet", category: "PERSON" },
  { value: "Medialab", category: "ORG" },
  { value: "Sciences", category: "ORG" },
  { value: "Columbia University", category: "ORG" },
];

describe("team roster — the list audit, end to end", () => {
  it("every first name is redacted, every role label stays, world knowledge stays", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(PAGE, { vault, detectLocal: gluedNer });

    // 1 — the names, INCLUDING the ones only the roster detector can see.
    for (const name of [
      "Aurélien", "Joséphine", "Milena", "Fernand", "Tharsiga", "Grégory",
      "Muriel", "Vergnaud", "Astrid", "Camille Fraysse", "Benjamin Verdelet",
    ]) {
      expect(text, name).not.toContain(name);
    }

    // 3 — the role labels are KINDS, not identities: they must survive verbatim.
    for (const role of ["Product", "Design", "go-to-market", "Expert", "Security", "TECH", "DPO", "RED TEAM & AI", "JOURNALIST"]) {
      expect(text, role).toContain(role);
    }

    // 3 — world knowledge: the famous institution and its hyphenated form survive.
    expect(text).toContain("Columbia University");
    expect(text).toContain("Sciences-Po");
    expect(text).toContain("Medialab");
  });

  it("a glued span never redacted ACROSS list lines as one fake (« Muriel DPO Vergnaud »)", async () => {
    const vault: Vault = {};
    await pseudonymize(PAGE, { vault, detectLocal: gluedNer });
    // No vault FAKE may map back to a value containing a line break or the role label —
    // that is the glued chip the user saw. Each person got their own entry instead.
    for (const original of Object.values(vault)) {
      expect(original, original).not.toMatch(/\n/);
      expect(original).not.toMatch(/DPO|Expert/);
    }
    const muriel = Object.values(vault).filter((v) => /\bmuriel\b/i.test(v));
    const vergnaud = Object.values(vault).filter((v) => /\bvergnaud\b/i.test(v));
    expect(muriel.length).toBeGreaterThan(0);
    expect(vergnaud.length).toBeGreaterThan(0);
  });

  it("a duplicated first name keeps ONE identity (Fernand seul + « Fernand Expert »)", async () => {
    const vault: Vault = {};
    await pseudonymize(PAGE, { vault, detectLocal: gluedNer });
    // The casing machinery may alias the fake ("Marc"/"marc") — that is still ONE
    // identity: every fake mapping to Fernand must be a casing of the same word.
    const fakes = Object.entries(vault)
      .filter(([, v]) => /fernand/i.test(v))
      .map(([k]) => k.toLowerCase());
    expect(new Set(fakes).size, fakes.join(", ")).toBe(1);
  });
});

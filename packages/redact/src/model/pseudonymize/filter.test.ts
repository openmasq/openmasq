import { describe, it, expect } from "vitest";
import {
  filterCandidates,
  deNest,
  dropUnanchoredProseGeo,
  disabledValueSpans,
  type FilterCtx,
} from "./filter";
import { keepSet } from "../../util";
import type { Detection } from "../../types";

const ctx = (over: Partial<FilterCtx> = {}): FilterCtx => ({
  keep: new Set<string>(),
  isExistingFake: () => false,
  disabled: new Set<string>(),
  urlSpans: null,
  emailSpans: null,
  input: "",
  ...over,
});
const vals = (r: Detection[]) => r.map((c) => c.value);
/** The two halves of a zone scan, as the orchestrator passes them. */
const zonesCtx = (c: Detection[], input: string, disabled: Set<string>) => {
  const z = disabledValueSpans(c, input, disabled);
  return { disabledSpans: z.spans, releasedValues: z.values };
};

describe("filterCandidates — fail-closed gates (isolated, per audit)", () => {
  it("keep wins over everything (even a forced candidate)", () => {
    const kept = filterCandidates(
      [{ value: "Stripe", category: "ORG", forced: true }],
      ctx({ keep: keepSet(["stripe"]), input: "call Stripe" }),
    );
    expect(vals(kept)).not.toContain("Stripe");
  });

  it("echo of an existing fake: DROPPED for a tool result, KEPT for an authored message", () => {
    // The security-critical branch: dropping the user's REAL value = a leak; not dropping a
    // tool echo = compounding identities. reFakeExisting distinguishes the two contexts.
    const isExistingFake = (v: string) => v === "Voxa";
    const c: Detection[] = [{ value: "Voxa", category: "ORG" }];
    expect(vals(filterCandidates(c, ctx({ isExistingFake, input: "Voxa" })))).not.toContain("Voxa");
    expect(
      vals(filterCandidates(c, ctx({ isExistingFake, reFakeExisting: true, input: "Voxa" }))),
    ).toContain("Voxa");
  });

  it("a disabled category is left in clear", () => {
    const kept = filterCandidates(
      [{ value: "a@b.com", category: "EMAIL" }],
      ctx({ disabled: new Set(["email"]), input: "mail a@b.com" }),
    );
    expect(vals(kept)).not.toContain("a@b.com");
  });

  it("a generic institutional word is dropped (never an identity)", () => {
    const kept = filterCandidates(
      [{ value: "assemblée générale", category: "ORG" }],
      ctx({ input: "l'assemblée générale des copropriétaires" }),
    );
    expect(vals(kept)).not.toContain("assemblée générale");
  });

  it("a forced candidate bypasses the FP gates (a bare number still redacted)", () => {
    const kept = filterCandidates(
      [{ value: "12345", category: "ID", forced: true }],
      ctx({ input: "ref 12345" }),
    );
    expect(vals(kept)).toContain("12345");
  });

  it("a bare meaningless number is left in clear", () => {
    const kept = filterCandidates(
      [{ value: "42", category: "NUMBER" }],
      ctx({ input: "quantité 42" }),
    );
    expect(vals(kept)).not.toContain("42");
  });
});

describe("deNest — occurrence-safe subsumption", () => {
  it("keeps a fragment that ALSO occurs standalone (a real name not in the email)", () => {
    const input = "julien.sabourdin@gmail.com et julien tout seul";
    const kept = deNest(
      [
        { value: "julien.sabourdin@gmail.com", category: "EMAIL" },
        { value: "julien", category: "NAME" },
      ],
      input,
    );
    expect(vals(kept)).toContain("julien");
  });

  it("drops a fragment confined inside a longer candidate", () => {
    const input = "julien.sabourdin@gmail.com";
    const kept = deNest(
      [
        { value: "julien.sabourdin@gmail.com", category: "EMAIL" },
        { value: "sabourdin", category: "NAME" },
      ],
      input,
    );
    expect(vals(kept)).not.toContain("sabourdin");
  });
});

describe("filterCandidates — generic compounds (the PostHog overredaction)", () => {
  it("drops a compound whose EVERY word is generic, whatever the separator", () => {
    // Observed in prod: tool ids flagged as NAMEs, whose per-word aliases then
    // redact every "data"/"query"/"trends" in the conversation.
    const kept = filterCandidates(
      [
        { value: "read-data-schema", category: "NAME" },
        { value: "Read data schema", category: "NAME" },
        { value: "query-trends", category: "NAME" },
        { value: "query-session-recordings-list", category: "NAME" },
        { value: "UTC", category: "ORG" }, // the local NER's org mis-tag → "HAL"
      ],
      ctx({ input: "name: read-data-schema — Timezone: UTC" }),
    );
    expect(vals(kept)).toEqual([]);
  });

  it("ONE non-covered word keeps the candidate (allow-list stance)", () => {
    const kept = filterCandidates(
      [
        { value: "Jean-Rebour", category: "NAME" },
        { value: "Cabinet Berlioz", category: "ORG" }, // "cabinet" generic, "Berlioz" not
      ],
      ctx({ input: "Jean-Rebour du Cabinet Berlioz" }),
    );
    expect(vals(kept)).toEqual(["Jean-Rebour", "Cabinet Berlioz"]);
  });
});

describe("dropUnanchoredProseGeo — le géo de prose exige un ancrage personnel", () => {
  const region: Detection = { value: "Normandie", category: "REGION" };
  const dept: Detection = { value: "Calvados", category: "DEPARTMENT" };
  const name: Detection = { value: "Jean Vannec", category: "NAME" };

  it("une région/un département SEULS, vault vierge → non redacted (culture générale)", () => {
    expect(dropUnanchoredProseGeo([region, dept], true)).toEqual([]);
  });
  it("un AUTRE candidat survivant ancre le géo (adresse/formulaire)", () => {
    expect(dropUnanchoredProseGeo([region, name], true)).toEqual([region, name]);
  });
  it("un vault déjà amorcé ancre le géo (la conversation est déjà personnelle)", () => {
    expect(dropUnanchoredProseGeo([region], false)).toEqual([region]);
  });
  it("un géo FORCÉ (Redact manuel) n'est jamais droppé", () => {
    const forced: Detection = { value: "Normandie", category: "REGION", forced: true };
    expect(dropUnanchoredProseGeo([forced], true)).toEqual([forced]);
  });
});

describe("a disabled category releases its value WHOLE (fragment gate)", () => {
  // The reported bug: with « adresse postale » off, the address detector goes quiet but the
  // NER's LOC spans inside that same address keep firing — the document came back as
  // « 12 [LOCATION1], 75011 [LOCATION2] », under a banner promising addresses in clear.
  const input = "Entre Karl Studio, 12 rue de Verdun, 75011 Paris, représentée par Léa.";
  const candidates: Detection[] = [
    { value: "12 rue de Verdun, 75011 Paris", category: "ADDRESS" },
    { value: "rue de Verdun", category: "LOCATION" },
    { value: "Paris", category: "LOCATION" },
    { value: "Léa", category: "NAME" },
  ];

  it("drops the fragments sitting inside the released address", () => {
    const disabled = new Set(["address"]);
    const kept = filterCandidates(
      candidates,
      ctx({ disabled, ...zonesCtx(candidates, input, disabled), input }),
    );
    expect(vals(kept)).toEqual(["Léa"]); // the address AND its parts stay in clear
  });

  it("keeps a value that ALSO occurs outside the released span", () => {
    // "Paris" in prose elsewhere is not part of the released address — it stays redacted.
    const text = `${input} Nos bureaux sont à Paris.`;
    const disabled = new Set(["address"]);
    const kept = filterCandidates(
      candidates,
      ctx({ disabled, ...zonesCtx(candidates, text, disabled), input: text }),
    );
    expect(vals(kept)).toContain("Paris");
  });

  it("drops a place caught inside a released COMPANY name", () => {
    const text = "Et Torbel Provence, représenté par Léa.";
    const cands: Detection[] = [
      { value: "Torbel Provence", category: "ORG" },
      { value: "Provence", category: "LOCATION" },
      { value: "Léa", category: "NAME" },
    ];
    const disabled = new Set(["company"]);
    const kept = filterCandidates(
      cands,
      ctx({ disabled, ...zonesCtx(cands, text, disabled), input: text }),
    );
    expect(vals(kept)).toEqual(["Léa"]);
  });

  it("an org-MANDATED category is NOT released by disabling a neighbouring one", () => {
    // Otherwise turning « adresse » off would smuggle a policy-forced value into the clear.
    const disabled = new Set(["address"]);
    const kept = filterCandidates(
      candidates,
      ctx({
        disabled,
        unrevealable: new Set(["location"]),
        ...zonesCtx(candidates, input, disabled),
        input,
      }),
    );
    expect(vals(kept)).toContain("rue de Verdun");
  });

  it("a FORCED value is neither a clear zone nor droppable", () => {
    const text = "Adresse : 12 rue de Verdun, 75011 Paris.";
    const cands: Detection[] = [
      { value: "12 rue de Verdun, 75011 Paris", category: "ADDRESS", forced: true },
      { value: "Paris", category: "LOCATION" },
    ];
    const disabled = new Set(["address"]);
    const z = disabledValueSpans(cands, text, disabled);
    expect(z.spans).toEqual([]); // the user asked for this one → not a released zone
    const kept = filterCandidates(cands, ctx({ disabled, disabledSpans: null, input: text }));
    expect(vals(kept)).toContain("12 rue de Verdun, 75011 Paris");
  });

  it("NEVER releases anything but a place — an over-long released span is not a hole", () => {
    // The regression this pins was measured in the app: a NER span that swallowed a whole
    // line as ORG turned into a « clear zone » and took the name, the e-mail and the phone
    // inside it with it. Only `location` fragments may ever be released.
    const text = "Karl Studio, représentée par Julien Sabourdin (julien@karl.fr, 06 12 34 56 78)";
    const cands: Detection[] = [
      { value: text, category: "ORG" }, // the over-long span
      { value: "Julien Sabourdin", category: "NAME" },
      { value: "julien@karl.fr", category: "EMAIL" },
      { value: "06 12 34 56 78", category: "PHONE" },
      { value: "Karl", category: "LOCATION" },
    ];
    const disabled = new Set(["company"]);
    const kept = filterCandidates(
      cands,
      ctx({ disabled, ...zonesCtx(cands, text, disabled), input: text }),
    );
    expect(vals(kept)).toEqual(["Julien Sabourdin", "julien@karl.fr", "06 12 34 56 78"]);
  });

  it("a disabled category that composes nothing releases no fragment", () => {
    const text = "Contact : julien@karl.fr — Julien Sabourdin";
    const cands: Detection[] = [
      { value: "julien@karl.fr", category: "EMAIL" },
      { value: "Julien Sabourdin", category: "NAME" },
    ];
    const disabled = new Set(["email"]);
    expect(disabledValueSpans(cands, text, disabled).spans).toEqual([]);
  });

  it("no disabled category ⇒ the gate is inert", () => {
    const kept = filterCandidates(candidates, ctx({ input }));
    expect(vals(kept)).toEqual(candidates.map((c) => c.value));
  });
});

describe("un span qui HABILLE une valeur forcée cède le pas (fiche Mémoire, 14/08)", () => {
  // « Employeur de Camille Verlant » réclamé en ORG par le gate contextuel, alors que
  // « Camille Verlant » est déjà FORCÉ par la fiche personne : le span plus long frappait
  // un second faux, de type organisation — le modèle lisait deux entités pour une.
  it("« Employeur de X » cède quand X est forcé — X garde son propre faux", () => {
    const r = filterCandidates(
      [
        { value: "Camille Verlant", category: "NAME", forced: true },
        { value: "Employeur de Camille Verlant", category: "ORG" },
      ],
      ctx({ input: "Fiche : Employeur de Camille Verlant." }),
    );
    expect(vals(r)).toEqual(["Camille Verlant"]);
  });

  it("un reste NON générique garde le span — le céder l'enverrait en clair", () => {
    const r = filterCandidates(
      [
        { value: "Camille Verlant", category: "NAME", forced: true },
        { value: "Rebour & Fils, employeur de Camille Verlant", category: "ORG" },
      ],
      ctx({ input: "Rebour & Fils, employeur de Camille Verlant." }),
    );
    expect(vals(r)).toContain("Rebour & Fils, employeur de Camille Verlant");
  });

  it("frontière de mots : « Camille Verlandet » n'habille pas « Camille Verlant »", () => {
    const r = filterCandidates(
      [
        { value: "Camille Verlant", category: "NAME", forced: true },
        { value: "Société de Camille Verlandet", category: "ORG" },
      ],
      ctx({ input: "Société de Camille Verlandet." }),
    );
    expect(vals(r)).toContain("Société de Camille Verlandet");
  });

  it("sans valeur forcée, rien ne change", () => {
    const r = filterCandidates(
      [{ value: "Employeur de Camille Verlant", category: "ORG" }],
      ctx({ input: "Employeur de Camille Verlant." }),
    );
    expect(vals(r)).toContain("Employeur de Camille Verlant");
  });
});

describe("machine-token geo gate (enum CARD_PAYMENT → METZ_PAYMENT, relevé réel 15/08)", () => {
  const cardCsv =
    "Type: CARD_PAYMENT | State: COMPLETED\nType: CARD_REFUND | State: COMPLETED\nType: FEE";

  it("drops a LOCATION whose every occurrence is a SNAKE_CAPS segment", () => {
    const kept = filterCandidates(
      [{ value: "CARD", category: "LOCATION" }],
      ctx({ input: cardCsv }),
    );
    expect(vals(kept)).not.toContain("CARD");
  });

  it("keeps it when ONE occurrence stands free (a real mention elsewhere)", () => {
    const kept = filterCandidates(
      [{ value: "METZ", category: "LOCATION" }],
      ctx({ input: "Type: METZ_PAYMENT — livraison à METZ le 3 juin" }),
    );
    expect(vals(kept)).toContain("METZ");
  });

  it("never releases another category (a NAME in a transfer reference stays redacted)", () => {
    const kept = filterCandidates(
      [{ value: "REBOUR", category: "NAME" }],
      ctx({ input: "Référence: SALAIRE_REBOUR_08" }),
    );
    expect(vals(kept)).toContain("REBOUR");
  });

  it("ambiguous glue without underscore keeps the candidate (CARDIO…)", () => {
    const kept = filterCandidates(
      [{ value: "CARD", category: "LOCATION" }],
      ctx({ input: "Type: CARDIO_CENTER" }),
    );
    expect(vals(kept)).toContain("CARD");
  });

  it("an org-MANDATED location category still wins over the gate", () => {
    const kept = filterCandidates(
      [{ value: "CARD", category: "LOCATION" }],
      ctx({ input: cardCsv, unrevealable: new Set(["location"]) }),
    );
    expect(vals(kept)).toContain("CARD");
  });
});

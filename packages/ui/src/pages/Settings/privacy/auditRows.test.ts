import { describe, expect, it } from "vitest";
import type { Conversation } from "../../../types";
import {
  auditKindCounts,
  buildAuditGroups,
  countAuditRows,
  filterAuditGroups,
  takeAuditRows,
  type AuditGroup,
} from "./auditRows";

const conv = (p: Partial<Conversation> & { id: string }): Conversation =>
  ({
    title: "",
    messages: [],
    createdAt: 0,
    updatedAt: 0,
    modelId: "m",
    ...p,
  }) as Conversation;

describe("buildAuditGroups", () => {
  it("un groupe par conversation, la plus récente en tête", () => {
    const groups = buildAuditGroups([
      conv({
        id: "a",
        title: "Ancienne",
        updatedAt: 10,
        redactionVault: { "Marc Rebour": "Julien Sabourdin" },
        redactionKinds: { "Julien Sabourdin": "name" },
      }),
      conv({
        id: "b",
        title: "Récente",
        updatedAt: 99,
        redactionVault: { "Luc Morvan": "Julien Sabourdin" },
        redactionKinds: { "Julien Sabourdin": "name" },
      }),
    ]);
    expect(groups.map((g) => g.convTitle)).toEqual(["Récente", "Ancienne"]);
    expect(groups.map((g) => g.at)).toEqual([99, 10]);
  });

  // The fact the view must make visible: the salt is per conversation, so the SAME
  // real value carries a different replacement from one thread to another. Flattened, this read
  // like an inconsistency; grouped, it's the guarantee made visible.
  it("la même valeur réelle garde SON faux dans chaque conversation", () => {
    const groups = buildAuditGroups([
      conv({ id: "a", updatedAt: 2, redactionVault: { "Marc Rebour": "Julien Sabourdin" } }),
      conv({ id: "b", updatedAt: 1, redactionVault: { "Luc Morvan": "Julien Sabourdin" } }),
    ]);
    expect(groups.map((g) => g.rows[0].fake)).toEqual(["Marc Rebour", "Luc Morvan"]);
    expect(new Set(groups.flatMap((g) => g.rows.map((r) => r.original)))).toEqual(
      new Set(["Julien Sabourdin"]),
    );
  });

  it("une conversation sans rien de redacted n'a PAS d'en-tête", () => {
    const groups = buildAuditGroups([
      conv({ id: "vide", updatedAt: 5 }),
      conv({ id: "a", updatedAt: 4, redactionVault: { X: "réel" } }),
    ]);
    expect(groups.map((g) => g.convId)).toEqual(["a"]);
  });

  it("une conversation sans titre reste nommable", () => {
    const [g] = buildAuditGroups([conv({ id: "a", updatedAt: 1, redactionVault: { X: "réel" } })]);
    expect(g.convTitle).toBe("Nouvelle conversation");
  });

  it("ancre le saut sur le message qui porte la valeur réelle", () => {
    const [g] = buildAuditGroups([
      conv({
        id: "a",
        updatedAt: 1,
        redactionVault: { X: "réel" },
        messages: [
          { id: "m1", role: "user", content: "bonjour", at: 0 },
          { id: "m2", role: "user", content: "voici réel", at: 1 },
        ],
      } as Partial<Conversation> & { id: string }),
    ]);
    expect(g.rows[0].msgId).toBe("m2");
  });
});

const groups: AuditGroup[] = [
  {
    convId: "a",
    convTitle: "Facture Orange",
    at: 2,
    rows: [
      { id: "a1", convId: "a", original: "Julien", fake: "Marc", kind: "name" },
      { id: "a2", convId: "a", original: "t@k.dev", fake: "m@x.dev", kind: "email" },
    ],
  },
  {
    convId: "b",
    convTitle: "Devis",
    at: 1,
    rows: [{ id: "b1", convId: "b", original: "Julien", fake: "Luc", kind: "name" }],
  },
];

describe("filterAuditGroups", () => {
  it("un groupe dont plus rien ne correspond disparaît", () => {
    const out = filterAuditGroups(groups, { kind: "email" });
    expect(out.map((g) => g.convId)).toEqual(["a"]);
    expect(out[0].rows).toHaveLength(1);
  });

  it("chercher une CONVERSATION garde tout son redaction", () => {
    const out = filterAuditGroups(groups, { query: "facture" });
    expect(out).toHaveLength(1);
    expect(out[0].rows).toHaveLength(2);
  });

  it("chercher une VALEUR la retrouve dans chaque conversation", () => {
    const out = filterAuditGroups(groups, { query: "julien" });
    expect(out.map((g) => g.convId)).toEqual(["a", "b"]);
    expect(out.every((g) => g.rows.length === 1)).toBe(true);
  });

  it("catégorie ET texte se cumulent", () => {
    expect(filterAuditGroups(groups, { query: "julien", kind: "email" })).toEqual([]);
  });

  it("sans critère, rien n'est retiré", () => {
    expect(countAuditRows(filterAuditGroups(groups, {}))).toBe(3);
  });
});

describe("takeAuditRows", () => {
  // The trap this avoids: paginating by GROUP would bring in a 500-entry
  // conversation as a single block, because it sits under one header.
  it("compte les LIGNES, pas les groupes", () => {
    const out = takeAuditRows(groups, 1);
    expect(out).toHaveLength(1);
    expect(out[0].rows).toHaveLength(1);
  });

  it("passe au groupe suivant une fois le premier épuisé", () => {
    expect(countAuditRows(takeAuditRows(groups, 3))).toBe(3);
    expect(takeAuditRows(groups, 3)).toHaveLength(2);
  });

  it("une limite plus large que le journal ne perd rien", () => {
    expect(countAuditRows(takeAuditRows(groups, 99))).toBe(3);
  });
});

describe("auditKindCounts", () => {
  it("compte par catégorie, la plus fournie en tête", () => {
    expect(auditKindCounts(groups)).toEqual([
      { key: "name", n: 2 },
      { key: "email", n: 1 },
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { MCP_CATEGORIES, MCP_CONNECTORS, mcpAuthTag } from "@openmasq/catalog/mcp";
import { REDACTION_CATEGORIES, REDACTION_CATEGORY_GROUPS } from "@openmasq/catalog/redaction";
import { CATEGORY_HUE } from "@openmasq/redact";
import { MODEL_META } from "@openmasq/llm";
import { mcpAuthTagCopy, mcpCategoryLabel, modelCopy, redactionCopy } from "./catalogCopy";

/* Aucun compilateur ne relie un id de catalogue à sa clé de copie : ce test est ce lien.
   Un connecteur, une catégorie ou un modèle ajouté sans ses mots dans CHAQUE langue
   échoue ici, pas devant l'utilisateur anglophone qui verrait du français. */

describe("la copie des catalogues existe dans chaque langue", () => {
  for (const locale of LOCALES) {
    const t = getMessages(locale);

    it(`${locale} — chaque connecteur MCP a sa description`, () => {
      const missing = MCP_CONNECTORS.filter((c) => !t.connectorCatalog.connectors[c.id]?.desc).map(
        (c) => c.id,
      );
      expect(missing).toEqual([]);
    });

    it(`${locale} — chaque catégorie de connecteur a son libellé`, () => {
      for (const c of MCP_CATEGORIES)
        expect(mcpCategoryLabel(c.id, t), c.id).not.toBe(t.connectorCatalog.categories.other);
      expect(mcpCategoryLabel(undefined, t)).toBe(t.connectorCatalog.categories.other);
    });

    it(`${locale} — chaque catégorie de redaction a libellé + détail, chaque section son titre`, () => {
      for (const c of REDACTION_CATEGORIES) {
        const copy = t.redactionCatalog.categories[c.key];
        expect(copy?.label, c.key).toBeTruthy();
        if (c.detail) expect(copy?.detail, `${c.key}.detail`).toBeTruthy();
        if (c.impact) expect(copy?.impact, `${c.key}.impact`).toBeTruthy();
      }
      for (const g of REDACTION_CATEGORY_GROUPS)
        expect(t.redactionCatalog.sections[g], g).toBeTruthy();
      for (const k of Object.keys(CATEGORY_HUE))
        expect(t.redactionCatalog.kinds[k], k).toBeTruthy();
    });

    it(`${locale} — chaque modèle du catalogue a ses points forts et son usage`, () => {
      const missing = Object.keys(MODEL_META).filter((id) => !t.modelCatalog.models[id]?.bestFor);
      expect(missing).toEqual([]);
    });
  }
});

describe("l'étiquette d'authentification garde la même FORME que le catalogue", () => {
  const fr = getMessages("fr");
  it("même kind et même label que `mcpAuthTag` pour chaque connecteur, en français", () => {
    for (const c of MCP_CONNECTORS) {
      const ours = mcpAuthTagCopy(c, fr);
      const theirs = mcpAuthTag(c);
      expect(ours.kind, c.id).toBe(theirs.kind);
      expect(ours.label, c.id).toBe(theirs.label);
    }
  });
  it("le repli d'une catégorie inconnue rend le catalogue, jamais une puce vide", () => {
    expect(redactionCopy("nope", { label: "X" }, fr).label).toBe("X");
    expect(modelCopy("some-legacy-alias", { fallback: "light" } as never, fr).bestFor).toBe(
      fr.modelCatalog.fallback.light.bestFor,
    );
  });
});

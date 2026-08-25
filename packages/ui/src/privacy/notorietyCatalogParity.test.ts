import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS } from "@openmasq/catalog/mcp";
import { isNotoriousEntity } from "@openmasq/redact";

/**
 * PARITÉ catalogue MCP ⇄ liste de notoriété (demande produit du 30/07/2026) :
 * CHAQUE entreprise derrière un connecteur de l'app doit être dans la dispense
 * COMMERCIALE — dispensée hors Strict, redacted en Strict.
 *
 * C'est un test parce que les deux maisons ne peuvent pas s'importer (règle 9 :
 * `@openmasq/catalog` dépend de `@openmasq/redact`, la liste ne peut donc pas lire
 * le catalogue) : ce fichier, dans le package qui importe LES DEUX, est ce qui
 * empêche un nouveau connecteur d'arriver sans sa marque — et une marque-connecteur
 * de rejoindre la liste INCONDITIONNELLE (ORGS), ce qui l'épargnerait en Strict.
 */

// Connecteurs SANS marque : des capacités de l'app, pas des entreprises.
const NOT_A_BRAND = new Set(["browser", "demo", "filesystem"]);

// Le nom affiché porte parfois un qualificatif d'écran (« Google Drive (lecture) »).
const brandOf = (name: string): string => name.replace(/\s*\(.*\)\s*$/, "").trim();

const brands = MCP_CONNECTORS.filter((c) => !NOT_A_BRAND.has(c.id)).map((c) => brandOf(c.name));

describe("notoriété ⇄ catalogue MCP — chaque marque de connecteur, absolument", () => {
  it("le catalogue n'est pas vide (sinon la parité ne prouve rien)", () => {
    expect(brands.length).toBeGreaterThan(30);
  });

  it("dispensée hors Strict : `commercial: true` épargne chaque marque du catalogue", () => {
    for (const b of brands) {
      expect(isNotoriousEntity(b, "company", { commercial: true }), b).toBe(true);
    }
  });

  it("redacted en Strict : sans le flag, AUCUNE marque de connecteur n'est épargnée", () => {
    // Si celle-ci échoue, la marque est (re)tombée dans la liste inconditionnelle
    // (ORGS) — Strict l'épargnerait. Elle doit vivre dans le bloc COMMERCIAL.
    for (const b of brands) {
      expect(isNotoriousEntity(b, "company"), b).toBe(false);
    }
  });
});

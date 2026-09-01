import { describe, expect, it } from "vitest";
import { MCP_CONNECTORS } from "@openmasq/catalog/mcp";
import { isNotoriousEntity } from "@openmasq/redact";

/**
 * PARITY between the MCP catalogue ⇄ the notoriety list (product request from 30/07/2026):
 * EVERY company behind an app connector must be in the COMMERCIAL
 * exemption — exempted outside Strict, redacted under Strict.
 *
 * This is a test because the two homes cannot import each other (rule 9:
 * `@openmasq/catalog` depends on `@openmasq/redact`, so the list cannot read
 * the catalogue): this file, in the package that imports BOTH, is what
 * stops a new connector from arriving without its brand — and a connector brand
 * from joining the UNCONDITIONAL list (ORGS), which would exempt it under Strict.
 */

// Connectors WITHOUT a brand: app capabilities, not companies.
const NOT_A_BRAND = new Set(["browser", "demo", "filesystem"]);

// The displayed name sometimes carries a screen qualifier (« Google Drive (lecture) »).
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
    // If this fails, the brand has (re-)fallen into the unconditional list
    // (ORGS) — Strict would exempt it. It must live in the COMMERCIAL block.
    for (const b of brands) {
      expect(isNotoriousEntity(b, "company"), b).toBe(false);
    }
  });
});

import { describe, it, expect } from "vitest";
import { DIRECT } from "./direct";
import {
  googleCalendarConnector,
  googleDriveConnector,
  gmailConnector,
  googleDocsConnector,
  googleSheetsConnector,
  googleTasksConnector,
  googleAnalyticsConnector,
} from "@openmasq/connectors";

/**
 * LA parité qui a manqué le 12/08 : les scopes Google vivent dans DEUX paquets qui ne
 * peuvent pas s'importer en production — le catalogue (l'affichage, les cartes) et
 * `@openmasq/connectors` (celui que l'OAuth demande réellement,
 * `apps/desktop/src/main/mcp/connectors/index.ts`). Un « resserrage » fait d'un seul
 * côté est alors COSMÉTIQUE : c'est arrivé — Agenda ramené à `calendar.events` dans le
 * catalogue pendant que l'OAuth continuait de demander `auth/calendar` complet.
 * Un test peut importer les deux (alias workspace) ; un commentaire ne peut pas échouer.
 */
const HOMES = [
  ["google-calendar", googleCalendarConnector],
  ["google-drive", googleDriveConnector],
  ["gmail", gmailConnector],
  ["google-docs", googleDocsConnector],
  ["google-sheets", googleSheetsConnector],
  ["google-tasks", googleTasksConnector],
  ["google-analytics", googleAnalyticsConnector],
] as const;

describe("scopes Google — le catalogue (affichage) ⇄ @openmasq/connectors (l'OAuth)", () => {
  for (const [id, connector] of HOMES) {
    it(`${id} : les deux maisons demandent EXACTEMENT les mêmes scopes`, () => {
      const inCatalog = DIRECT.find((c) => c.id === id);
      expect(inCatalog, `${id} absent du catalogue`).toBeTruthy();
      expect(inCatalog?.scopes?.managed).toEqual(connector.scopes.managed);
      expect(inCatalog?.scopes?.byo).toEqual(connector.scopes.byo);
    });
  }

  it("⛔ Agenda reste sur `calendar.events` — jamais le scope complet pour deux outils d'événements", () => {
    expect(googleCalendarConnector.scopes.managed).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
    ]);
  });

  it("⛔ l'écriture Drive reste `drive.file` — jamais `auth/drive` complet", () => {
    expect(googleDriveConnector.scopes.managed).toContain(
      "https://www.googleapis.com/auth/drive.file",
    );
    expect(googleDriveConnector.scopes.managed.join(" ")).not.toMatch(/auth\/drive(?![.a-z])/);
  });
});

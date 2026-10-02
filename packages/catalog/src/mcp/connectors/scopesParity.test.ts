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
  microsoftOneDriveConnector,
} from "@openmasq/connectors";

/**
 * THE parity that broke on 12/08: Google scopes live in TWO packages that
 * cannot import each other in production — the catalog (display, cards) and
 * `@openmasq/connectors` (the one OAuth actually requests,
 * `apps/desktop/src/main/mcp/connectors/index.ts`). A "tightening" done on only one
 * side is then COSMETIC: it happened — Calendar rolled back to `calendar.events` in the
 * catalog while OAuth kept requesting the full `auth/calendar`.
 * A test can import both (workspace alias); a comment cannot fail.
 */
const HOMES = [
  ["google-calendar", googleCalendarConnector],
  ["google-drive", googleDriveConnector],
  ["gmail", gmailConnector],
  ["google-docs", googleDocsConnector],
  ["google-sheets", googleSheetsConnector],
  ["google-tasks", googleTasksConnector],
  ["google-analytics", googleAnalyticsConnector],
  // Not Google, same trap: the catalogue shows the scopes, `@openmasq/connectors` requests them.
  ["microsoft-onedrive", microsoftOneDriveConnector],
] as const;

describe("scopes Google — le catalogue (affichage) ⇄ @openmasq/connectors (l'OAuth)", () => {
  for (const [id, connector] of HOMES) {
    it(`${id} : les deux maisons demandent EXACTEMENT les mêmes scopes`, () => {
      const inCatalog = DIRECT.find((c) => c.id === id);
      expect(inCatalog, `${id} absent du catalogue`).toBeTruthy();
      expect(inCatalog?.scopes?.managed).toEqual(connector.scopes.managed);
      expect(inCatalog?.scopes?.byo).toEqual(connector.scopes.byo);
      // The chip (catalog) and main's refusal (`connector.byoOnly`) must agree: a
      // « Bientôt disponible » the main process would still serve in one click is a lie.
      expect(!!inCatalog?.byoOnly, `${id} byoOnly`).toBe(!!connector.byoOnly);
    });
  }

  it("⛔ Agenda reste sur `calendar.events` — jamais le scope complet pour deux outils d'événements", () => {
    expect(googleCalendarConnector.scopes.byo).toEqual([
      "https://www.googleapis.com/auth/calendar.events",
    ]);
  });

  it("⛔ l'écriture Drive reste `drive.file` — jamais `auth/drive` complet", () => {
    expect(googleDriveConnector.scopes.byo).toContain(
      "https://www.googleapis.com/auth/drive.file",
    );
    expect(googleDriveConnector.scopes.byo.join(" ")).not.toMatch(/auth\/drive(?![.a-z])/);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getLocale: () => "fr" } }));
vi.mock("../mcp/persist", () => ({ listServers: () => [] }));
vi.mock("../mcp/server/registry", () => ({ connected: new Map(), routes: new Map() }));
vi.mock("../mcp/connectors", () => ({ directFetchJson: async () => ({}) }));

import { cloudListError } from "./index";

describe("cloudListError — le 404 de la racine OneDrive dit quoi faire", () => {
  const notFound = Object.assign(new Error("Upstream request failed (404): itemNotFound"), { status: 404 });

  it("racine OneDrive en 404 : le compte n'a pas d'espace OneDrive — message actionnable", () => {
    const out = cloudListError(notFound, "microsoft-onedrive", null) as Error;
    expect(out.message).toMatch(/espace OneDrive/);
    expect(out.message).not.toMatch(/Upstream/);
  });

  it("un sous-dossier, un autre stockage ou un autre statut passent tels quels", () => {
    expect(cloudListError(notFound, "microsoft-onedrive", "01ABC")).toBe(notFound);
    expect(cloudListError(notFound, "google-drive", null)).toBe(notFound);
    const e500 = Object.assign(new Error("x"), { status: 500 });
    expect(cloudListError(e500, "microsoft-onedrive", null)).toBe(e500);
  });
});

import { describe, it, expect } from "vitest";
import { pseudonymize, redact } from "@openmasq/redact";
import { categoriesForLevel, disabledKindsOf } from "@openmasq/catalog";
import { connectorIdKeep, integrationProductNames } from "./integrationKeep";
import { sendKeepList } from "./redactionOptions";

const STRICT = disabledKindsOf(categoriesForLevel("strict")); // [] — everything on

describe("integrationProductNames — un nom de PRODUIT n'est jamais masqué", () => {
  const names = integrationProductNames().map((n) => n.toLowerCase());

  it("Slack, Notion, Dropbox, OneDrive (et « One Drive »), Google Drive — dans les deux langues", () => {
    for (const n of ["slack", "notion", "dropbox", "onedrive", "one drive", "google drive", "sharepoint", "microsoft teams"])
      expect(names, n).toContain(n);
  });

  it("une ENTREPRISE seule reste masquable", () => {
    for (const n of ["microsoft", "google"]) expect(names, n).not.toContain(n);
  });

  it("en STRICT, le détecteur voit « One Drive » comme une organisation — il reste en clair", async () => {
    const res = await pseudonymize("Cherche le devis sur One Drive, pas chez Microsoft.", {
      vault: {},
      disabledKinds: STRICT,
      keep: sendKeepList([], {}, undefined),
      detectLocal: async () => [
        { value: "One Drive", category: "ORG" },
        { value: "Microsoft", category: "ORG" },
      ],
    });
    expect(res.text).toContain("One Drive");
    expect(res.text).not.toContain("Microsoft");
    // Control: without the list, the same detection DOES mask it — the keep is what holds.
    const bare = await pseudonymize("Cherche le devis sur One Drive.", {
      vault: {},
      disabledKinds: STRICT,
      detectLocal: async () => [{ value: "One Drive", category: "ORG" }],
    });
    expect(bare.text).not.toContain("One Drive");
  });

  it("le Coffre gagne : un nom de produit forcé par l'utilisateur sort de la liste", () => {
    const keep = sendKeepList([], {}, undefined, [{ value: "Notion", category: "org" } as never]);
    expect(keep.map((k) => k.toLowerCase())).not.toContain("notion");
  });
});

describe("connectorIdKeep — les ids d'un connecteur direct ne deviennent pas de faux jetons", () => {
  const listing = [
    "Devis.docx — application/pdf (2026-09-30) · id:01BYE5RZ6QN3ZWBTUFOFD3GSPGOHDJD36K",
    "[dossier] Factures · id:A1B2C3D4E5F6G7H8!1234",
  ].join("\n");

  it("OneDrive : l'id listé reste tel quel, même en strict (le 404 venait d'un id faussé)", () => {
    // Control: without the keep, the engine fakes it as an API token.
    expect(redact(listing, { disabledKinds: STRICT }).text).not.toContain("01BYE5RZ6QN3ZWBTUFOFD3GSPGOHDJD36K");
    const keep = connectorIdKeep("microsoft-onedrive__search_files", listing, []);
    const out = redact(listing, { disabledKinds: STRICT, keep }).text;
    expect(out).toContain("01BYE5RZ6QN3ZWBTUFOFD3GSPGOHDJD36K");
    expect(out).toContain("A1B2C3D4E5F6G7H8!1234");
  });

  it("seulement pour un connecteur DIRECT, et seulement en position `· id:`", () => {
    expect(connectorIdKeep("notion__search", listing, [])).toEqual([]); // remote: its text isn't ours
    expect(connectorIdKeep("run_python", listing, [])).toEqual([]);
    expect(connectorIdKeep("microsoft-onedrive__read_document", "token sk_live_ABCDEFGH123456 ici", [])).toEqual([]);
  });

  it("jamais une valeur PROTÉGÉE (coffre, vrai du vault) — fail-closed", () => {
    const keep = connectorIdKeep("microsoft-onedrive__search_files", listing, ["01BYE5RZ6QN3ZWBTUFOFD3GSPGOHDJD36K"]);
    expect(keep).not.toContain("01BYE5RZ6QN3ZWBTUFOFD3GSPGOHDJD36K");
  });
});

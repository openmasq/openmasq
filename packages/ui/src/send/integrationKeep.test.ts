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

  it("la position `· id:` ne vaut que pour un connecteur DIRECT (notre propre rendu)", () => {
    expect(connectorIdKeep("notion__search", listing, [])).toEqual([]); // remote: its text isn't ours
    expect(connectorIdKeep("run_python", listing, [])).toEqual([]);
    expect(connectorIdKeep("microsoft-onedrive__read_document", "token sk_live_ABCDEFGH123456 ici", [])).toEqual([]);
  });

  it("jamais une valeur PROTÉGÉE (coffre, vrai du vault) — fail-closed", () => {
    const keep = connectorIdKeep("microsoft-onedrive__search_files", listing, ["01BYE5RZ6QN3ZWBTUFOFD3GSPGOHDJD36K"]);
    expect(keep).not.toContain("01BYE5RZ6QN3ZWBTUFOFD3GSPGOHDJD36K");
  });
});

describe("connectorIdKeep — les ids JSON d'un connecteur du catalogue (Notion)", () => {
  const notion = JSON.stringify({
    results: [
      { id: "3a8b8e7d-4266-8152-b4b3-ce67308b22de", title: "Compte-rendu", parent_id: "36db8e7d426681e79f43d3395ddc1f87" },
    ],
    api_key_id: "99c9136a-638c-48f8-b52b-793ee9df8b90",
    valid: "94302778-9b67-4fa3-9709-0434c26e6f7c",
  });

  it("l'id d'une page Notion reste réel, même en strict — le modèle le rend tel quel à notion-fetch", () => {
    const keep = connectorIdKeep("notion__notion-search", notion, []);
    expect(keep).toEqual(["3a8b8e7d-4266-8152-b4b3-ce67308b22de", "36db8e7d426681e79f43d3395ddc1f87"]);
    // Control: without the keep, the engine fakes the UUID as an API key.
    expect(redact(notion, { disabledKinds: STRICT }).text).not.toContain("3a8b8e7d-4266-8152-b4b3-ce67308b22de");
    expect(redact(notion, { disabledKinds: STRICT, keep }).text).toContain("3a8b8e7d-4266-8152-b4b3-ce67308b22de");
  });

  it("jamais sous une clé de secret, ni sous une clé qui n'est pas un id", () => {
    const keep = connectorIdKeep("notion__notion-search", notion, []);
    expect(keep).not.toContain("99c9136a-638c-48f8-b52b-793ee9df8b90"); // api_key_id
    expect(keep).not.toContain("94302778-9b67-4fa3-9709-0434c26e6f7c"); // "valid" is not an id key
  });

  it("un serveur AJOUTÉ par l'utilisateur (hors catalogue) n'a rien d'épargné", () => {
    expect(connectorIdKeep("custom-crm__search", notion, [])).toEqual([]);
  });

  it("jamais une valeur PROTÉGÉE", () => {
    expect(connectorIdKeep("notion__notion-search", notion, ["3a8b8e7d-4266-8152-b4b3-ce67308b22de"])).not.toContain(
      "3a8b8e7d-4266-8152-b4b3-ce67308b22de",
    );
  });
});

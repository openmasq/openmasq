import { describe, it, expect } from "vitest";
import { validateCustomStack, customEnvUrls, customCspOrigins, patchCspConnectSrc } from "./customStack";

const GOOD = {
  backend: "https://api.example.org",
  gateway: "https://gw.example.org",
  supabaseUrl: "https://xyz.supabase.co",
  supabaseAnonKey: "sb_publishable_abc",
};

describe("validateCustomStack — ce qu'une pile saisie a le droit d'être", () => {
  it("accepte une pile complète et NORMALISE (slash final retiré)", () => {
    const v = validateCustomStack({ ...GOOD, backend: "https://api.example.org/", gateway: " https://gw.example.org/v1/ " });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.stack.backend).toBe("https://api.example.org");
      expect(v.stack.gateway).toBe("https://gw.example.org/v1");
    }
  });

  it("⛔ le backend est obligatoire — c'est l'objet de la pile", () => {
    expect(validateCustomStack({ ...GOOD, backend: "" })).toEqual({ ok: false, reason: "backend_required", field: "backend" });
  });

  it("⛔ https obligatoire — http seulement vers la boucle locale", () => {
    expect(validateCustomStack({ ...GOOD, backend: "http://api.example.org" })).toMatchObject({ ok: false, reason: "not_https", field: "backend" });
    expect(validateCustomStack({ ...GOOD, gateway: "http://192.168.1.10:8080" })).toMatchObject({ ok: false, reason: "not_https", field: "gateway" });
    expect(validateCustomStack({ ...GOOD, backend: "http://localhost:3003" }).ok).toBe(true);
    expect(validateCustomStack({ ...GOOD, backend: "http://127.0.0.1:3003" }).ok).toBe(true);
    expect(validateCustomStack({ ...GOOD, backend: "ftp://api.example.org" }).ok).toBe(false);
  });

  it("⛔ ni identifiants dans l'URL, ni requête, ni fragment, ni adresse relative", () => {
    expect(validateCustomStack({ ...GOOD, backend: "https://u:p@api.example.org" })).toMatchObject({ reason: "userinfo" });
    expect(validateCustomStack({ ...GOOD, backend: "https://api.example.org/?x=1" })).toMatchObject({ reason: "query_or_hash" });
    expect(validateCustomStack({ ...GOOD, backend: "https://api.example.org/#f" })).toMatchObject({ reason: "query_or_hash" });
    expect(validateCustomStack({ ...GOOD, backend: "/api" })).toMatchObject({ reason: "not_absolute" });
    expect(validateCustomStack({ ...GOOD, backend: "api.example.org" })).toMatchObject({ reason: "not_absolute" });
  });

  it("⛔ le couple Supabase va ensemble", () => {
    expect(validateCustomStack({ ...GOOD, supabaseAnonKey: "" })).toMatchObject({ reason: "supabase_pair", field: "supabaseAnonKey" });
    expect(validateCustomStack({ ...GOOD, supabaseUrl: "" })).toMatchObject({ reason: "supabase_pair", field: "supabaseUrl" });
    expect(validateCustomStack({ ...GOOD, supabaseUrl: "", supabaseAnonKey: "" }).ok).toBe(true);
  });

  it("la passerelle est optionnelle", () => {
    expect(validateCustomStack({ ...GOOD, gateway: "" }).ok).toBe(true);
  });

  it("⛔ tout ce qui n'est pas un objet est refusé", () => {
    for (const hostile of [null, undefined, "https://api.example.org", 42, []]) {
      expect(validateCustomStack(hostile).ok).toBe(false);
    }
  });
});

describe("customEnvUrls — la même forme que la table cuite", () => {
  it("dérive l'admin du backend et ne renomme rien", () => {
    expect(customEnvUrls(GOOD)).toEqual({
      backend: GOOD.backend,
      admin: `${GOOD.backend}/admin`,
      supabaseUrl: GOOD.supabaseUrl,
      supabaseAnonKey: GOOD.supabaseAnonKey,
      redactFn: GOOD.gateway,
    });
  });
});

describe("customCspOrigins + patchCspConnectSrc — la CSP ne s'élargit qu'aux origines déclarées", () => {
  it("liste les origines (pas les chemins) + le wss du Supabase, sans doublon", () => {
    expect(customCspOrigins({ ...GOOD, gateway: "https://api.example.org/gw" })).toEqual([
      "https://api.example.org",
      "https://xyz.supabase.co",
      "wss://xyz.supabase.co",
    ]);
    expect(customCspOrigins({ ...GOOD, gateway: "", supabaseUrl: "", supabaseAnonKey: "" })).toEqual(["https://api.example.org"]);
  });

  it("ne touche que `connect-src`, et rien sans origine", () => {
    const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; connect-src 'self' https://a.b; img-src 'self' data:; object-src 'none'">`;
    const out = patchCspConnectSrc(html, ["https://api.example.org", "wss://x.y"]);
    expect(out).toContain(`connect-src 'self' https://a.b https://api.example.org wss://x.y;`);
    expect(out).toContain("img-src 'self' data:;");
    expect(out).toContain("default-src 'self';");
    expect(patchCspConnectSrc(html, [])).toBe(html);
    expect(patchCspConnectSrc("<p>no csp</p>", ["https://x"])).toBe("<p>no csp</p>");
  });
});

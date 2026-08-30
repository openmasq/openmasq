import { describe, it, expect } from "vitest";
import { classifyEnvChange, resolvedEnvPayload } from "./envSwitch";
import { ENVIRONMENTS } from "../../environments";

describe("classifyEnvChange — la porte de la bascule d'environnement", () => {
  it("⛔ refuse tout ce qui n'est pas un NOM connu — une adresse la première", () => {
    for (const hostile of [
      "https://evil.example",
      "http://127.0.0.1:8080",
      "prod",
      "",
      null,
      undefined,
      42,
      { env: "staging" },
    ]) {
      expect(classifyEnvChange({ wanted: hostile, current: "production", allowed: true })).toEqual({
        kind: "refuse",
        reason: "unknown_env",
      });
    }
  });

  it("⛔ sans la permission serveur, une bascule est refusée — même vers un nom valide", () => {
    expect(classifyEnvChange({ wanted: "staging", current: "production", allowed: false })).toEqual({
      kind: "needs-permission",
      env: "staging",
    });
  });

  it("avec la permission, la bascule passe", () => {
    expect(classifyEnvChange({ wanted: "staging", current: "production", allowed: true })).toEqual({
      kind: "allow",
      env: "staging",
    });
  });

  it("revenir à l'environnement COURANT ne demande rien — ça ne bascule rien", () => {
    expect(classifyEnvChange({ wanted: "production", current: "production", allowed: false })).toEqual({
      kind: "allow",
      env: "production",
    });
    expect(classifyEnvChange({ wanted: "staging", current: "staging", allowed: false })).toEqual({
      kind: "allow",
      env: "staging",
    });
  });

  it("la permission ne rachète JAMAIS un nom invalide — l'allow-list passe en premier", () => {
    expect(
      classifyEnvChange({ wanted: "https://evil.example", current: "production", allowed: true }).kind,
    ).toBe("refuse");
  });
});

describe("resolvedEnvPayload — ce que le renderer reçoit", () => {
  it("ne porte QUE des adresses publiques et un nom : aucun secret ne traverse le pont", () => {
    for (const name of ["production", "staging"] as const) {
      const p = resolvedEnvPayload(name);
      expect(p.name).toBe(name);
      expect(p.backend).toBe(ENVIRONMENTS[name].backend);
      // La clé Supabase est PUBLIABLE (c'est son nom) ; rien d'autre ne doit apparaître —
      // en particulier aucun jeton de bypass, aucune clé fournisseur, aucun secret d'app.
      expect(Object.keys(p).sort()).toEqual(
        ["admin", "backend", "name", "redactFn", "supabaseAnonKey", "supabaseUrl", "customStackAllowed", "customStack"].sort(),
      );
      expect(JSON.stringify(p)).not.toMatch(/bypass|secret|token|password/i);
    }
  });

  const STACK = { backend: "https://api.example.org", gateway: "", supabaseUrl: "https://x.supabase.co", supabaseAnonKey: "sb_publishable_x" };

  it("⛔ un build qui n'honore pas la pile saisie ne la remet JAMAIS au renderer — ni les adresses, ni le drapeau", () => {
    const p = resolvedEnvPayload("custom", STACK, false);
    expect(p.customStackAllowed).toBe(false);
    expect(p.customStack).toBeNull();
    // Et `custom` sans pile honorée est VIDE : jamais un repli sur la production.
    expect(p.backend).toBe("");
    expect(p.supabaseUrl).toBe("");
  });

  it("un build qui l'honore sert les adresses saisies en `custom`, et la pile connue même ailleurs", () => {
    const c = resolvedEnvPayload("custom", STACK, true);
    expect(c.backend).toBe(STACK.backend);
    expect(c.admin).toBe(`${STACK.backend}/admin`);
    expect(c.supabaseUrl).toBe(STACK.supabaseUrl);
    expect(c.customStack).toEqual(STACK);
    const prod = resolvedEnvPayload("production", STACK, true);
    expect(prod.backend).toBe(ENVIRONMENTS.production.backend);
    expect(prod.customStack).toEqual(STACK); // pour pré-remplir l'écran et y revenir
  });
});

describe("classifyEnvChange — la pile AUTO-HÉBERGÉE", () => {
  it("⛔ vers `custom` : refusé dans un build qui ne l'honore pas, même avec une pile écrite", () => {
    expect(
      classifyEnvChange({ wanted: "custom", current: "production", allowed: true, customAllowed: false, customConfigured: true }),
    ).toEqual({ kind: "refuse", reason: "custom_not_allowed" });
  });

  it("⛔ vers `custom` : refusé sans pile écrite — la porte d'écriture est `env:set-custom-stack`", () => {
    expect(
      classifyEnvChange({ wanted: "custom", current: "production", allowed: true, customAllowed: true, customConfigured: false }),
    ).toEqual({ kind: "refuse", reason: "custom_not_configured" });
  });

  it("vers `custom` : permis sans permission serveur quand le build l'honore ET qu'une pile existe", () => {
    expect(
      classifyEnvChange({ wanted: "custom", current: "production", allowed: false, customAllowed: true, customConfigured: true }),
    ).toEqual({ kind: "allow", env: "custom" });
  });

  it("depuis `custom`, le RETOUR en production est toujours permis ; staging demande la permission", () => {
    expect(classifyEnvChange({ wanted: "production", current: "custom", allowed: false })).toEqual({ kind: "allow", env: "production" });
    expect(classifyEnvChange({ wanted: "staging", current: "custom", allowed: false })).toEqual({ kind: "needs-permission", env: "staging" });
  });

  it("deux environnements CONFIGURÉS portent des adresses distinctes — sinon basculer ne changerait rien", () => {
    // Un build sans backend (le défaut du dépôt : aucune adresse cuite, voir
    // `src/environments/index.ts`) n'a rien à distinguer — et la bascule ne lui sert de
    // toute façon à rien. La propriété ne porte donc que sur ce qui EST fourni.
    const prod = resolvedEnvPayload("production").backend;
    const staging = resolvedEnvPayload("staging").backend;
    if (prod && staging) expect(prod).not.toBe(staging);
  });
});

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
        ["admin", "backend", "name", "redactFn", "supabaseAnonKey", "supabaseUrl"].sort(),
      );
      expect(JSON.stringify(p)).not.toMatch(/bypass|secret|token|password/i);
    }
  });

  it("les deux charges sont bien distinctes — sinon basculer ne changerait rien", () => {
    expect(resolvedEnvPayload("production").backend).not.toBe(resolvedEnvPayload("staging").backend);
  });
});

import { describe, it, expect } from "vitest";
import { ENVIRONMENTS, DEFAULT_ENV, isEnvName } from "./index";

describe("la table des environnements", () => {
  it("⛔ n'expose que des noms connus — c'est l'allow-list qui interdit une URL libre", () => {
    expect(isEnvName("production")).toBe(true);
    expect(isEnvName("staging")).toBe(true);
    for (const hostile of ["https://evil.example", "", null, undefined, 0, {}, "PRODUCTION"]) {
      expect(isEnvName(hostile)).toBe(false);
    }
  });

  it("le défaut est la production — l'environnement ne se déduit plus JAMAIS du canal", () => {
    expect(DEFAULT_ENV).toBe("production");
  });

  it("les deux environnements sont complets — une entrée trouée enverrait l'app sur `undefined`", () => {
    for (const [name, urls] of Object.entries(ENVIRONMENTS)) {
      for (const [field, value] of Object.entries(urls)) {
        // Chaque champ est une CHAÎNE, jamais `undefined`. Le couple Supabase a le droit
        // d'être VIDE — c'est l'état d'un build sans projet fourni (env), où l'app tourne
        // sans comptes (`auth.ts` AUTH_CONFIGURED) — mais vide ENSEMBLE : une URL sans
        // clé (ou l'inverse) est un vrai trou, l'auth échouerait à mi-chemin.
        expect(typeof value, `${name}.${field}`).toBe("string");
      }
      expect(!!urls.supabaseUrl, `${name} : URL et clé Supabase vont ensemble`).toBe(
        !!urls.supabaseAnonKey,
      );
      if (urls.supabaseUrl) {
        expect(urls.supabaseUrl.startsWith("https://"), `${name}.supabaseUrl`).toBe(true);
      }
      expect(urls.backend.startsWith("https://"), `${name}.backend`).toBe(true);
      expect(urls.admin.startsWith("https://"), `${name}.admin`).toBe(true);
      expect(urls.redactFn.startsWith("https://"), `${name}.redactFn`).toBe(true);
    }
  });

  it("les deux environnements ne partagent NI l'API ni la gateway — sinon la bascule ne bascule rien", () => {
    expect(ENVIRONMENTS.production.backend).not.toBe(ENVIRONMENTS.staging.backend);
    expect(ENVIRONMENTS.production.redactFn).not.toBe(ENVIRONMENTS.staging.redactFn);
  });
});

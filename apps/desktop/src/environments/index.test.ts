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

  it("aucune adresse n'a de défaut committé — un build sans variables n'a AUCUN service", () => {
    // The open-source contract (`index.ts`): what the table carries is what the BUILD
    // supplied, and nothing else. A fallback default would make every fork talk to the
    // brand's servers — and would offer its users a SaaS that isn't
    // theirs. This test therefore compares against the variable, not an URL written here.
    expect(ENVIRONMENTS.production.backend).toBe(process.env.OPENMASQ_BACKEND_URL ?? "");
    expect(ENVIRONMENTS.staging.backend).toBe(process.env.OPENMASQ_BACKEND_URL_STAGING ?? "");
    expect(ENVIRONMENTS.production.redactFn).toBe(process.env.OPENMASQ_GATEWAY_URL ?? "");
    expect(ENVIRONMENTS.staging.redactFn).toBe(process.env.OPENMASQ_GATEWAY_URL_STAGING ?? "");
  });

  it("chaque champ est une CHAÎNE, vide ou absolue — jamais `undefined`, jamais relative", () => {
    for (const [name, urls] of Object.entries(ENVIRONMENTS)) {
      for (const [field, value] of Object.entries(urls)) {
        // Empty = the capability doesn't exist in this build (NORMAL state). Non-empty = an
        // absolute address: a relative value would stick to the renderer's origin.
        expect(typeof value, `${name}.${field}`).toBe("string");
        if (value && field !== "supabaseAnonKey") {
          expect(value.startsWith("https://"), `${name}.${field}`).toBe(true);
        }
      }
      // The Supabase pair is empty TOGETHER: a URL without a key (or the reverse) is a
      // hole — auth would fail halfway instead of simply not existing.
      expect(!!urls.supabaseUrl, `${name} : URL et clé Supabase vont ensemble`).toBe(
        !!urls.supabaseAnonKey,
      );
      // The admin console is SERVED by the backend: it derives from it, or doesn't exist.
      expect(urls.admin, `${name}.admin`).toBe(urls.backend ? `${urls.backend}/admin` : "");
    }
  });

  it("deux environnements CONFIGURÉS ne partagent NI l'API ni la gateway — sinon la bascule ne bascule rien", () => {
    const { production: p, staging: st } = ENVIRONMENTS;
    if (p.backend && st.backend) expect(p.backend).not.toBe(st.backend);
    if (p.redactFn && st.redactFn) expect(p.redactFn).not.toBe(st.redactFn);
  });
});

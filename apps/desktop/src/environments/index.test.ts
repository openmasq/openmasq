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
    // Le contrat open source (`index.ts`) : ce que la table porte, c'est ce que le BUILD
    // a fourni, et rien d'autre. Un défaut de repli ferait parler chaque fork aux
    // serveurs de la marque — et proposerait à ses utilisateurs un SaaS qui n'est pas
    // le leur. Ce test compare donc à la variable, pas à une URL écrite ici.
    expect(ENVIRONMENTS.production.backend).toBe(process.env.OPENMASQ_BACKEND_URL ?? "");
    expect(ENVIRONMENTS.staging.backend).toBe(process.env.OPENMASQ_BACKEND_URL_STAGING ?? "");
    expect(ENVIRONMENTS.production.redactFn).toBe(process.env.OPENMASQ_GATEWAY_URL ?? "");
    expect(ENVIRONMENTS.staging.redactFn).toBe(process.env.OPENMASQ_GATEWAY_URL_STAGING ?? "");
  });

  it("chaque champ est une CHAÎNE, vide ou absolue — jamais `undefined`, jamais relative", () => {
    for (const [name, urls] of Object.entries(ENVIRONMENTS)) {
      for (const [field, value] of Object.entries(urls)) {
        // Vide = la capacité n'existe pas dans ce build (état NORMAL). Non vide = une
        // adresse absolue : une valeur relative se collerait à l'origine du renderer.
        expect(typeof value, `${name}.${field}`).toBe("string");
        if (value && field !== "supabaseAnonKey") {
          expect(value.startsWith("https://"), `${name}.${field}`).toBe(true);
        }
      }
      // Le couple Supabase est vide ENSEMBLE : une URL sans clé (ou l'inverse) est un
      // trou — l'auth échouerait à mi-chemin au lieu de ne pas exister.
      expect(!!urls.supabaseUrl, `${name} : URL et clé Supabase vont ensemble`).toBe(
        !!urls.supabaseAnonKey,
      );
      // La console d'admin est SERVIE par le backend : elle en dérive, ou n'existe pas.
      expect(urls.admin, `${name}.admin`).toBe(urls.backend ? `${urls.backend}/admin` : "");
    }
  });

  it("deux environnements CONFIGURÉS ne partagent NI l'API ni la gateway — sinon la bascule ne bascule rien", () => {
    const { production: p, staging: st } = ENVIRONMENTS;
    if (p.backend && st.backend) expect(p.backend).not.toBe(st.backend);
    if (p.redactFn && st.redactFn) expect(p.redactFn).not.toBe(st.redactFn);
  });
});

import { describe, it, expect } from "vitest";
import { pseudonymize } from "./index";
import { scoreCorpus, pct, type BenchCase } from "../bench/metric";
import corpus from "../bench/corpora/technique.json";

/* Recall + PRECISION bench for TECHNICAL documents — post-mortem d'incident, audit de
   sécurité, ADR, runbook, CV d'ingénieur, ticket support, annexe DPA, rapport de bug avec
   stack trace.

   Ce corpus existe pour la raison inverse des autres : ce qu'il faut vérifier ici n'est pas
   seulement que les VRAIES données sont attrapées, mais que le vocabulaire technique qui les
   entoure ne l'est PAS. Un post-mortem cite Kubernetes, PostgreSQL et Datadog à chaque ligne ;
   pseudonymisés, le modèle répond sur un système qui n'existe pas — « migrer [Voxa Group]
   vers [Oslen SAS] » — et le document devient inexploitable sans qu'aucune donnée n'ait été
   protégée pour autant.

   Score le pipeline déterministe COMPLET tel qu'il est livré (`pseudonymize`, sans modèle),
   comme `juridique` / `layouts` / `administratif`. */

const cases = corpus as BenchCase[];

// `commercialNotoriety: true` = le banc modélise un niveau NON-Strict (le réglage de
// l'app hors Strict) : depuis le 30/07/2026, GitHub/Stripe/Cloudflare — des marques qui
// sont aussi des connecteurs MCP — sont dans la dispense CONDITIONNELLE, plus dans la
// liste inconditionnelle. En Strict elles sont redacted, et c'est voulu
// (`model/notorious.test.ts` + `notorietyCatalogParity.test.ts` côté app).
const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault, commercialNotoriety: true });
  return Object.values(vault);
};

/** Le vocabulaire que ces documents contiennent et qui ne doit JAMAIS entrer au coffre —
 *  un mélange des quatre familles ajoutées (outillage, infra, conformité, fournisseurs). */
const MUST_STAY_CLEAR = [
  "Kubernetes", "PostgreSQL", "Redis", "Nginx", "TypeScript", "Docker", "Terraform",
  "Elasticsearch", "OpenSearch", "Node.js", "React", "Playwright", "Vitest", "Helm",
  "Datadog", "Grafana", "Prometheus", "PagerDuty", "Cloudflare", "Splunk", "GitHub",
  "GitLab", "Amazon S3", "AWS", "Google Cloud", "Vault", "Stripe", "Dependabot", "Snyk",
  "ISO 27001", "SOC 2", "RGPD", "CVSS", "MFA", "SSO", "SAML", "TLS", "WAF", "SIEM",
  "SLO", "post-mortem", "monolithe", "microservices", "pipeline", "rollback", "canary",
];

describe("technical-document recall + precision (full deterministic pipeline)", () => {
  it("holds the recall floor on the technique corpus", async () => {
    const s = await scoreCorpus(cases, detect);
    // eslint-disable-next-line no-console
    console.log(
      `[technique] overall ${s.found}/${s.total} (${pct(s.found, s.total)}%) FP ${s.fp}` +
        (s.misses.length ? `\n  misses: ${s.misses.join(" · ")}` : ""),
    );
    // Le plancher : ces documents portent des identités, des e-mails, des téléphones, un
    // IBAN et une IP au milieu du bruit technique — le bruit ne doit pas les noyer.
    expect(s.found / s.total).toBeGreaterThanOrEqual(0.8);
  });

  it("ne redacted PAS le vocabulaire technique, même quand un détecteur le PROPOSE", async () => {
    // ⚠️ La mesure ne vaut que si elle exerce ce qu'elle prétend mesurer. Le pipeline
    // DÉTERMINISTE ne propose jamais « Kubernetes » comme organisation — c'est le NER (ou
    // le modèle) qui le fait, et c'est là que la liste agit. Un premier harnais sans
    // détecteur passait donc à l'identique avec ou sans le volume : il ne prouvait rien.
    // On simule donc le détecteur, exactement comme un NER sur-étiquette un post-mortem.
    const proposing = (text: string) => async () =>
      JSON.stringify(
        MUST_STAY_CLEAR.filter((t) => text.toLowerCase().includes(t.toLowerCase())).map((value) => ({
          value,
          category: "ORG",
        })),
      );
    const vaulted = new Set<string>();
    for (const c of cases) {
      const vault: Record<string, string> = {};
      await pseudonymize(c.text, { vault, complete: proposing(c.text), commercialNotoriety: true });
      for (const v of Object.values(vault)) vaulted.add(v.toLowerCase());
    }
    const caught = MUST_STAY_CLEAR.filter((t) => vaulted.has(t.toLowerCase()));
    expect(caught, `vocabulaire technique redacted : ${caught.join(", ")}`).toEqual([]);
  });

  it("garde un taux de faux positifs BAS — le over-redaction est mesuré, pas supposé", async () => {
    const s = await scoreCorpus(cases, detect);
    // Un FP ici est une valeur mise au coffre qui ne recoupe aucune vérité : du bruit
    // technique pris pour une identité. Le plafond est la contrepartie du plancher de
    // rappel — sans lui, tout redact passerait le premier test.
    expect(s.fp / s.total).toBeLessThanOrEqual(0.6);
  });
});

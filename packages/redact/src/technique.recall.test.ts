import { describe, it, expect } from "vitest";
import { pseudonymize } from "./index";
import { scoreCorpus, pct, type BenchCase } from "../bench/metric";
import corpus from "../bench/corpora/technique.json";

/* Recall + PRECISION bench for TECHNICAL documents — incident post-mortem, security
   audit, ADR, runbook, engineer's résumé, support ticket, DPA annex, bug report with
   stack trace.

   This corpus exists for the opposite reason from the others: what needs verifying here is
   not just that the REAL data is caught, but that the technical vocabulary surrounding it is
   NOT. A post-mortem cites Kubernetes, PostgreSQL and Datadog on every line;
   pseudonymized, the model then answers about a system that doesn't exist — « migrer [Voxa
   Group] vers [Oslen SAS] » — and the document becomes unusable without any data actually
   having been protected.

   Scores the WHOLE deterministic pipeline exactly as it ships (`pseudonymize`, no model),
   like `juridique` / `layouts` / `administratif`. */

const cases = corpus as BenchCase[];

// `commercialNotoriety: true` = the bench models a NON-Strict level (the app's setting
// outside Strict): since 30/07/2026, GitHub/Stripe/Cloudflare — brands that are
// also MCP connectors — are in the CONDITIONAL exemption, no longer in the
// unconditional list. In Strict they are redacted, and this is deliberate
// (`model/notorious.test.ts` + `notorietyCatalogParity.test.ts` on the app side).
const detect = async (text: string): Promise<string[]> => {
  const vault: Record<string, string> = {};
  await pseudonymize(text, { vault, commercialNotoriety: true });
  return Object.values(vault);
};

/** The vocabulary these documents contain that must NEVER enter the vault —
 *  a mix of the four added families (tooling, infra, compliance, vendors). */
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
    // The floor: these documents carry identities, emails, phone numbers, an
    // IBAN and an IP in the middle of technical noise — the noise must not drown them out.
    expect(s.found / s.total).toBeGreaterThanOrEqual(0.8);
  });

  it("ne redacted PAS le vocabulaire technique, même quand un détecteur le PROPOSE", async () => {
    // ⚠️ The measure is only valid if it exercises what it claims to measure. The
    // DETERMINISTIC pipeline never proposes « Kubernetes » as an organization — that's the
    // NER (or the model) that does it, and that's where the list acts. A first harness with
    // no detector therefore passed identically with or without the volume: it proved nothing.
    // So we simulate the detector, exactly as a NER over-tags a post-mortem.
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
    // An FP here is a value put in the vault that overlaps no truth: technical
    // noise mistaken for an identity. The ceiling is the counterpart of the recall
    // floor — without it, redacting everything would pass the first test.
    expect(s.fp / s.total).toBeLessThanOrEqual(0.6);
  });
});

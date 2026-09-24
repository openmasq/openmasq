import { describe, expect, it } from "vitest";
import { redact } from "../redact";

/**
 * What the model would see — with the GENERIC key-shaped heuristic switched off.
 *
 * ⚠️ That `disabledKinds` is the whole point of the file, not a detail. The heuristic
 * (`apikey`) masks nearly every long mixed-case run, so with it on these tests pass whether
 * or not a single vendor rule exists — they would measure the heuristic and report it as
 * coverage. Off, what remains is exactly what a DEDICATED rule catches, which is what the
 * user keeps when they turn the loose category off. The vendor rules resolve to `secret`,
 * so none of them is affected by this.
 */
const wire = (s: string) =>
  redact(`Le service renvoie ${s} pour la requete.`, { disabledKinds: ["apikey"] }).text;
const masked = (s: string) => !wire(s).includes(s);

const hex = (n: number) => "a3f9c7d21b8e04562f7a91cd38be04751a6f2c9d".repeat(8).slice(0, n);
const word = (n: number) =>
  "K7pQm2XzR4tLb9VnW1sYh6JdG3fCe8Ua5oI0rTyPxMwZqNvBjHkSgLdFaEcRuTiO".repeat(6).slice(0, n);

describe("vendor-prefix rules", () => {
  // One realistic vector per FAMILY. The prefix is what carries the precision, so a family
  // shares a tail and it is the prefix list that needs the coverage.
  it.each([
    ["GitLab deploy", `gldt-${word(20)}`],
    ["GitLab runner", `glrt-${word(20)}`],
    ["GitLab SCIM", `glsoat-${word(20)}`],
    ["GitLab feature flag", `glffct-${word(20)}`],
    ["GitLab agent", `glagent-${word(50)}`],
    ["GitLab pipeline trigger", `glptt-${hex(40)}`],
    ["GitLab runner registration", `GR1348941${word(20)}`],
    ["GitLab session cookie", `_gitlab_session=${hex(32)}`],
    ["1Password secret key", "A3-ZBK4M9-QW7RT2XLP4C-K8MQZ-R3VTY-N6DWA"],
    ["1Password service account", `ops_eyJ${word(60)}`],
    ["age", `AGE-SECRET-KEY-1${word(58).toUpperCase()}`],
    ["Airtable PAT", `pat${word(14)}.${hex(64)}`],
    ["Alibaba", `LTAI${word(20).toLowerCase()}`],
    ["Artifactory", `AKCp${word(69)}`],
    ["Clojars", `CLOJARS_${word(60).toLowerCase()}`],
    ["Dynatrace", `dt0c01.${word(24)}.${word(64)}`],
    ["EasyPost", `EZAK${word(54).toLowerCase()}`],
    ["Fly.io", `fo1_${word(43)}`],
    ["Grafana cloud", `glc_${word(40)}`],
    ["Grafana service account", `glsa_${word(32)}_${hex(8)}`],
    ["Grafana api key", `eyJrIjoi${word(80)}`],
    ["Harness", `pat.${word(22)}.${word(24)}.${word(20)}`],
    ["Heroku v2", `HRKU-AA${word(58)}`],
    ["Hugging Face org", `api_org_${word(34)}`],
    ["Perplexity", `pplx-${word(48)}`],
    ["PlanetScale password", `pscale_pw_${word(40)}`],
    ["PyPI upload", `pypi-AgEIcHlwaS5vcmc${word(60)}`],
    ["OpenShift", `sha256~${word(43)}`],
    ["RubyGems", `rubygems_${hex(48)}`],
    ["Sentry user", `sntryu_${hex(64)}`],
    ["SettleMint", `sm_pat_${word(16)}`],
    ["Shippo", `shippo_live_${hex(40)}`],
    ["Sourcegraph", `sgp_${hex(16)}_${hex(40)}`],
    ["Square", `EAAA${word(40)}`],
    ["Vault service", `hvs.${word(95)}`],
    ["Brevo/Sendinblue", `xkeysib-${hex(64)}-${word(16).toLowerCase()}`],
    ["Slack webhook url", `hooks.slack.com/services/${word(45)}`],
    ["Slack legacy workspace", `xoxo-2-${word(20)}`],
    ["Slack config access", `xoxe.xoxp-1-${word(163).toUpperCase()}`],
    [
      "Slack app-level",
      `xapp-1-A05${word(8).toUpperCase()}-123456789012-${word(64).toLowerCase()}`,
    ],
    ["AWS bearer key id", `ABIA${word(16).toUpperCase()}`],
    ["AWS context key id", `ACCA${word(16).toUpperCase()}`],
  ])("masks a %s credential", (_name, value) => {
    expect(masked(value)).toBe(true);
  });

  // The other half of the precision bar. Each of these is key-SHAPED and harmless, and
  // each has been mistaken for a secret by some scanner or other.
  it.each([
    ["a git commit SHA", hex(40)],
    ["a docker image digest", `sha256:${hex(64)}`],
    ["a lockfile integrity hash", `sha512-${word(86)}==`],
    ["an uppercase prose word after API-", "API-GATEWAY-TIMEOUT"],
    ["the word pat in prose", "le pat du plateau reste"],
    ["a benign config value", "LOG_LEVEL=debug"],
    ["a short base64 run", "EAAAcm9vdA=="],
  ])("leaves %s alone", (_name, value) => {
    const out = wire(value);
    expect(out).toContain(value);
  });

  it("does not take a bare 40-hex run for a Sourcegraph token", () => {
    // gitleaks' rule has a third branch matching 40 hex characters with no prefix at all.
    // That is a git SHA, an object id and half the hashes in a lockfile, so it is
    // deliberately absent here: the prefix IS the evidence.
    expect(masked(`sgp_${hex(40)}`)).toBe(true);
    expect(wire(hex(40))).toContain(hex(40));
  });

  it("leaves ClickHouse's 4b1d key to the generic heuristic, on purpose", () => {
    // Four hex characters is not a distinctive literal — it is a substring every long hash
    // contains. Promoting it to `secret` would fire on ordinary digests, so no dedicated
    // rule claims it; the heuristic still does, which is the right trade for this one.
    expect(masked(`4b1d${word(38)}`)).toBe(false);
    expect(redact(`token 4b1d${word(38)} fin`).text).not.toContain(`4b1d${word(38)}`);
  });
});

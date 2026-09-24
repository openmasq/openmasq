import type { RedactionRule } from "../../types";

// Vendor-issued credentials whose PREFIX is unmistakable — the second clause of the
// precision bar (`../CLAUDE.md`): a rule may fire on shape alone when it is
// literal-distinctive. `glsoat-`, `CLOJARS_`, `pscale_pw_` occur in ordinary text exactly
// never, so these cost nothing in false positives and each one is a credential that used
// to leave in clear.
//
// WHY THIS FILE EXISTS. Audited against gitleaks' 222 rules: of the 104 vendor-prefix
// patterns it carries, this engine had a dedicated rule for 30. Sixty-six more were caught
// ONLY by the generic key-shaped heuristic — which is the `apikey` category, the one the
// catalogue itself describes as also catching "des références produit inoffensives", and
// the one a user can switch off. Eight matched nothing at all. A vendor secret riding on a
// loose heuristic is a vendor secret one setting away from shipping in clear, so the ones
// below are promoted to `secret`, which is on at every protection level.
//
// ⚠️ Grouped by TAIL SHAPE rather than one rule per vendor. Sixty near-identical regexes
// would be sixty chances to mistype a length, and sixty more patterns for every redaction
// pass to run; the prefix is what carries the precision, so the prefix is what varies.
//
// ⚠️ Lengths come from the vendor's own published format (via gitleaks). Do not relax one
// to "be safe" — the length is half of what keeps a short prefix from firing on prose.
//
// Deliberately NOT here: ClickHouse's `4b1d` key. Four hex characters is not a distinctive
// literal, it is a substring every long hash contains, and the bar is explicit that shape
// alone is not enough. It stays with the generic heuristic.
const VENDORS: readonly (readonly [string, string])[] = [
  // ---- GitLab issues a DIFFERENT prefix per token type, and there are a dozen ----------
  [
    "glcbt-[0-9A-Za-z]{1,5}_|gldt-|glffct-|glft-|glimt-|glagent-|gloas-|glrt-t[0-9]_|glrt-|glsoat-|GR1348941",
    "[0-9A-Za-z_-]{20,}",
  ],
  ["glptt-", "[0-9a-f]{40}"],
  ["_gitlab_session=", "[0-9a-z]{32}"],
  // ---- one prefix, a long word-ish tail -----------------------------------------------
  [
    "AGE-SECRET-KEY-1|AKCp|ABSK|CLOJARS_|EZAK|EZTK|HRKU-AA|LTAI|cmVmd|fio-u-|fo1_|" +
      "hvb\\.|hvs\\.|ico-|ops_eyJ|pnu_|pplx-|pscale_(?:tkn|oauth|pw)_|pypi-AgEIcHlwaS5vcmc|" +
      "rdme_|sha256~|sntrys_eyJ|tk-us-|duffel_(?:test|live)_|glc_|p8e-",
    "[0-9A-Za-z_.=/+-]{16,}",
  ],
  // ---- hexadecimal tails ---------------------------------------------------------------
  ["pul-|sntryu_|rubygems_|shippo_(?:live|test)_|s-s4t2(?:ud|af)-", "[0-9a-fA-F]{40,}"],
  ["xkeysib-", "[0-9a-f]{64}-[0-9a-z]{16}"],
  ["FLW(?:SECK|PUBK)(?:_TEST)?-", "[0-9a-h]{12,}(?:-X)?"],
  ["api_org_", "[0-9A-Za-z]{30,}"], // Hugging Face ORGANISATION token — `hf_`'s sibling
  ["sm_(?:aat|pat|sat)_", "[0-9A-Za-z]{16,}"], // SettleMint
  ["glsa_", "[0-9A-Za-z]{32}_[0-9A-Fa-f]{8}"], // Grafana service account
  ["API-", "[A-Z0-9]{26}"], // Octopus Deploy
  ["1Password:A3-", "x"], // placeholder replaced below — see A3_RULE
];

export const VENDOR_RULES: RedactionRule[] = VENDORS.filter(
  ([p]) => !p.startsWith("1Password:"),
).map(([prefixes, tail]) => ({
  type: "api_key",
  pattern: new RegExp(`\\b(?:${prefixes})${tail}`, "g"),
}));

VENDOR_RULES.push(
  // 1Password's secret key — grouped, all-caps, and its own shape entirely.
  {
    type: "api_key",
    pattern:
      /\bA3-[A-Z0-9]{6}-(?:[A-Z0-9]{11}|[A-Z0-9]{6}-[A-Z0-9]{5})-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}\b/g,
  },
  // Dynatrace — three dot-separated parts, the first a fixed literal.
  { type: "api_key", pattern: /\bdt0c01\.[a-zA-Z0-9]{24}\.[a-zA-Z0-9]{64}\b/g },
  // Airtable personal access token.
  { type: "api_key", pattern: /\bpat[0-9A-Za-z]{14}\.[0-9a-f]{64}\b/g },
  // Harness — four parts, `pat.`/`sat.` alone would be far too weak a prefix; the SHAPE is
  // what qualifies it, so the three following lengths are all required.
  {
    type: "api_key",
    pattern: /\b(?:pat|sat)\.[0-9A-Za-z_-]{22}\.[0-9A-Za-z]{24}\.[0-9A-Za-z]{20}\b/g,
  },
  // Facebook page / Square access tokens. `EAA` is base64-plausible on its own, which is
  // why neither branch is allowed a short tail.
  { type: "api_key", pattern: /\bEAA[MC][0-9A-Za-z]{100,}/g },
  { type: "api_key", pattern: /\b(?:EAAA|sq0atp-)[0-9A-Za-z_-]{22,60}/g },
  // AWS Bedrock's short-lived key: the tail is base64 of the service host, so the whole
  // head is literal.
  { type: "api_key", pattern: /\bbedrock-api-key-YmVkcm9jay5hbWF6b25hd3MuY29t[0-9A-Za-z+/=]*/g },
  // Grafana's own key format is a base64 JSON object — `{"k":"…` — so it starts `eyJrIjoi`
  // but carries no dots, which is why the JWT rule does not see it.
  { type: "api_key", pattern: /\beyJrIjoi[0-9A-Za-z]{70,}={0,3}/g },
  // A JWT that has been base64-encoded a SECOND time — `ZXlK` is base64("eyJ"), so the
  // string is by construction a base64 JSON header. The plain JWT rule needs the two dots
  // and cannot see this one.
  { type: "api_key", pattern: /\bZXlK[0-9A-Za-z+/]{40,}={0,2}/g },
  // Sourcegraph.
  {
    type: "api_key",
    pattern: /\bsgp_(?:[0-9a-fA-F]{16}|local)_[0-9a-fA-F]{40}\b|\bsgp_[0-9a-fA-F]{40}\b/g,
  },
  // Slack's INCOMING WEBHOOK url is itself the credential — anyone holding it can post.
  {
    type: "api_key",
    pattern: /\bhooks\.slack\.com\/(?:services|workflows|triggers)\/[A-Za-z0-9+/]{43,}/g,
  },
);

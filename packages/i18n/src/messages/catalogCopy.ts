/**
 * The COPY of the technical catalogues — what the interface READS on a connector, a
 * redaction category, a model — separated from the FACTS those catalogues carry.
 *
 * `@openmasq/catalog`, `@openmasq/redact` and `@openmasq/llm` have no React and do not
 * depend on a language catalogue: they keep the ids, the tokens, the
 * transports, the scopes, the prices. The connector also keeps its French `desc`, because
 * the MODEL reads it (`suggest_integrations` looks for « envoyer » in it) — that is
 * model-facing prose, out of scope. Here, the version the user reads.
 *
 * ⚠️ No compiler ties these keys to the packages' ids: the parity tests
 * (`ui/src/privacy/catalogCopy.test.ts`) read both lists and refuse to let them
 * diverge — an id with no copy would otherwise fall back to French in the middle of an
 * English interface, without breaking anything.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 */
export interface ConnectorCopy {
  /** The name, only when it translates (« Google Agenda » / « Google Calendar »). */
  name?: string;
  desc: string;
}

export interface ConnectorCatalogMessages {
  connectors: Record<string, ConnectorCopy>;
  categories: {
    search: string;
    dev: string;
    data: string;
    productivity: string;
    crm: string;
    finance: string;
    design: string;
    automation: string;
    ai: string;
    other: string;
  };
  /** The authentication chip: what the user will have to supply. */
  auth: {
    builtin: { label: string; title: string };
    directFull: string;
    byoOnly: { label: string; title: (what: string, reason: string) => string };
    byoLimited: { label: string; title: (what: string, reason: string) => string };
    device: { label: string; title: string };
    oneClick: string;
    local: { label: string; title: string };
    broker: { label: (brand: string) => string; title: (brand: string) => string };
    apikey: { label: string; title: string };
    oneClickRemote: { label: string; title: string };
    byoSafe: (brand: string) => string;
    reasonAdminConsent: string;
    reasonGoogleReview: (brand: string) => string;
    thisAccess: string;
  };
}

export interface RedactionCategoryCopy {
  label: string;
  detail?: string;
  impact?: string;
}

export interface RedactionCatalogMessages {
  categories: Record<string, RedactionCategoryCopy>;
  /** The engine's SECTIONS are French keys (`REDACTION_SECTIONS`): their read name. */
  sections: Record<string, string>;
  /** The SHORT labels of the privacy report (one card per type). */
  kinds: Record<string, string>;
  /** The rules modal: what surrounds the chips. */
  lockedByOrg: string;
  modified: string;
  detailAria: (label: string) => string;
  detailTip: string;
  /** The word we use when we do NOT know what a value is. */
  neutralKind: string;
  allOn: string;
  allOff: string;
  reset: string;
}

export interface ModelCopy {
  strengths: readonly string[];
  weaknesses: readonly string[];
  bestFor: string;
}

export interface ModelCatalogMessages {
  /** The capability chips, by id (`@openmasq/llm` `MODEL_TAGS`). */
  tags: {
    reasoning: string;
    code: string;
    vision: string;
    fast: string;
    cheap: string;
    oss: string;
    long: string;
    agent: string;
  };
  models: Record<string, ModelCopy>;
  /** An id unknown to the catalogue falls back to a family (`@openmasq/llm` `fallbackMeta`). */
  fallback: { premium: ModelCopy; light: ModelCopy; generic: ModelCopy };
}

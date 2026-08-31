/**
 * La COPIE des catalogues techniques — ce que l'interface LIT sur un connecteur, une
 * catégorie de redaction, un modèle — séparée des FAITS que ces catalogues portent.
 *
 * `@openmasq/catalog`, `@openmasq/redact` et `@openmasq/llm` n'ont pas React et ne
 * dépendent pas d'un catalogue de langue : ils gardent les ids, les tokens, les
 * transports, les scopes, les prix. Le connecteur garde aussi sa `desc` française, parce
 * qu'elle est lue par le MODÈLE (`suggest_integrations` y cherche « envoyer ») — c'est de
 * la prose model-facing, hors périmètre. Ici, la version que l'utilisateur lit.
 *
 * ⚠️ Aucun compilateur ne relie ces clés aux ids des paquets : les tests de parité
 * (`ui/src/privacy/catalogCopy.test.ts`) lisent les deux listes et refusent qu'elles
 * divergent — un id sans copie tomberait sinon en français au milieu d'une interface
 * anglaise, sans rien casser.
 *
 * Une TRANCHE du contrat (`../messages.ts`), qui reste la seule liste des namespaces.
 */
export interface ConnectorCopy {
  /** Le nom, seulement quand il se traduit (« Google Agenda » / « Google Calendar »). */
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
  /** La pastille d'authentification : ce que l'utilisateur devra fournir. */
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
  /** Les SECTIONS du moteur sont des clés françaises (`REDACTION_SECTIONS`) : leur nom lu. */
  sections: Record<string, string>;
  /** Les libellés COURTS du rapport de confidentialité (une carte par type). */
  kinds: Record<string, string>;
  /** Le modal des règles : ce qui entoure les puces. */
  lockedByOrg: string;
  modified: string;
  detailAria: (label: string) => string;
  detailTip: string;
  /** Le mot qu'on emploie quand on ne SAIT pas ce qu'une valeur est. */
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
  /** Les pastilles de capacité, par id (`@openmasq/llm` `MODEL_TAGS`). */
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
  /** Un id inconnu du catalogue tombe sur une famille (`@openmasq/llm` `fallbackMeta`). */
  fallback: { premium: ModelCopy; light: ModelCopy; generic: ModelCopy };
}

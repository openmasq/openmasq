/**
 * Le contrat des dernières surfaces : la connexion, les PARTAGES d'organisation, le
 * sélecteur de modèles (le menu du chat et la grille des Réglages, qui disent les mêmes
 * choses), et les feuilles partagées qui portaient encore leurs mots en dur.
 *
 * Une tranche « le reste » n'est pas un fourre-tout de principe : c'est ce qui restait
 * quand chaque écran a eu la sienne, et chacun de ces blocs est trop petit pour un
 * namespace à lui — les regrouper ici les rend RELISIBLES d'un coup d'œil.
 */

export interface LoginMessages {
  passwordlessStrip: string;
  offline: string;
  email: string;
  emailPlaceholder: string;
  sending: string;
  sendLink: string;
  or: string;
  continueWithGoogle: string;
  noPassword: string;
  code: string;
  verifying: string;
  signInWithCode: string;
  linkNotOpening: string;
  useAnotherAddress: string;
  resend: string;
  resendLink: string;
}

export interface OrgSharesMessages {
  /** La cloche du rail droit, et ce qu'elle ouvre. */
  requests: string;
  requestsCount: (count: number) => string;
  requestsShort: string;
  empty: string;
  vaultTerm: string;
  competence: string;
  proposedBy: (author: string) => string;
  someMember: string;
  accept: string;
  refuse: string;
  myShares: string;
  revoke: string;
  status: { pending: string; approved: string; refused: string; revoked: string };
  /** La demande de partage. */
  promote: {
    eyebrow: string;
    title: string;
    sub: string;
    search: string;
    member: string;
    nobody: string;
    picked: string;
    previewTerm: string;
    previewOther: string;
    termNote: string;
    redactedNote: (count: number) => string;
    redactedTail: string;
    clean: string;
    send: string;
  };
  /** Les PORTÉES : ce que « personnel / équipe / organisation » veut dire. */
  scopes: {
    org: { label: string; short: string; note: string };
    team: { label: string; short: string; note: string };
    personal: { label: string; short: string; note: string };
  };
  /** Les CIBLES d'un partage, et comment chacune s'approuve. */
  targets: {
    person: { label: string; desc: string; approval: string };
    team: { label: string; desc: string; approval: string };
    org: { label: string; desc: string; approval: string };
  };
}

export interface ModelPickerMessages {
  search: string;
  priceFilter: string;
  price: string;
  simpleView: string;
  simpleViewTip: string;
  manage: string;
  none: string;
  models: string;
  allModels: string;
  freeTip: string;
  howToUse: string;
  isDefault: string;
  setDefault: string;
  addFavorite: string;
  removeFavorite: string;
  /** La grille des Réglages. */
  defaultSummaryTip: string;
  defaultSummaryLabel: string;
  keySaved: string;
  included: string;
  addKey: string;
  /** Le modèle qui tourne sur votre machine. */
  local: { eyebrow: string; note: string; label: string };
  /** Les deux CLI d'abonnement — même forme, deux fournisseurs. */
  cli: {
    claude: { title: string; note: string; rowTitle: string; onDesc: string; missingDesc: string };
    codex: { title: string; note: string; rowTitle: string; onDesc: string; missingDesc: string };
  };
}

/** Les feuilles partagées : ce qu'elles disent et que personne d'autre ne dit. */
export interface LeavesMessages {
  analytics: { privacyTitle: string; local: string; alwaysOn: string; usageStats: string };
  privacyLevels: { custom: string; customNote: string };
  demo: { youWrite: string; modelReceives: string };
  toolTrace: string;
  errorBoundary: { title: string; body: string; reload: string; retry: string };
  code: { csvTable: string; rowsCols: (rows: number, cols: number) => string; lines: (count: number) => string };
  document: { saveFailed: string; shortcuts: string; seeAll: string; editorAria: string; seePrompt: string };
  openInPanel: (name: string) => string;
  loadingImage: (name: string) => string;
  openImage: (name: string) => string;
}

/**
 * **THE one place a raw tool name becomes French.** A tool name (`browser_navigate`,
 * `stripe_api_search`) is developer vocabulary; every surface that shows the user what
 * the agent is doing goes through here — the trace row (`components/ToolTrace/`) and the
 * live loader (`toolActionLabel`, which composes this). The raw name survives only where
 * it is the POINT: the row's `title` tooltip, the write-confirm card's authorisation
 * target, and the connector's tool catalogue in Réglages.
 *
 * ⚠️ **The verb is not always the prefix.** `stripe_api_search` / `stripe_api_read`
 * put the vendor and its API boilerplate FIRST, so a prefix-anchored match found no
 * verb and the label fell through to the raw name with its underscores swapped for
 * spaces — the developer name with extra steps. The name is therefore TOKENISED and
 * the verb looked up among the WORDS, wherever the server chose to put it.
 *
 * It lives in `agent/` beside `toolActionLabel` rather than in the trace folder: both
 * speak the same vocabulary, and the leaf importing the brain is the direction the
 * tiers allow (the reverse would be an up-tree import — and a cycle, since the live
 * label composes this one).
 */

/** Strip a multi-account instance suffix (`gmail--a1b2` → `gmail`). ONE definition,
 *  consumed by every label: the row drops the connector's own name with it, and
 *  `toolActionLabel` keys its per-connector sentences on it. */
export function baseConnector(prefix: string): string {
  return prefix.replace(/--[0-9a-f]{3,}$/i, "");
}

/**
 * The app's OWN intercepted tools — never proxied to a server, so their names are ours to
 * translate and there is nothing to guess.
 *
 * ⚠️ They must be matched BEFORE the generic word walk, which mangles every one of them:
 * `web_fetch_many` came out « Lecture · many » (the batch marker read as the object),
 * `load_tools` came out « load » ("tools" is boilerplate everywhere else, so it was
 * stripped and left a bare verb), `memory_search` « Recherche · memory ». A generic rule
 * has no business guessing at a vocabulary we define.
 */
export const INTERCEPTED: Record<string, string> = {
  // ⚠️ « Analyse » seule sous-décrivait l'outil : il CALCULE, mais il TRACE aussi des
  // graphiques et surtout il GÉNÈRE des fichiers (PDF/Excel/Word) qui sont remis à
  // l'utilisateur — c'est la sortie qu'on voit, et aucun des trois anciens noms ne la
  // nommait. Le libellé dit donc les deux bouts : ce qu'il fait, ce qui en sort.
  run_python: "Analyse et génération de fichiers",
  web_fetch_many: "Lecture de pages web",
  load_tools: "Choix des outils",
  suggest_integrations: "Recherche d'une intégration",
  memory_search: "Recherche dans la mémoire",
};

/** Word → FR action noun, looked up per WORD (never as a prefix). */
const VERBS: Record<string, string> = {
  search: "Recherche", find: "Recherche", query: "Recherche", lookup: "Recherche",
  list: "Lecture", get: "Lecture", read: "Lecture", fetch: "Lecture", show: "Lecture",
  retrieve: "Lecture", describe: "Lecture", view: "Lecture",
  create: "Création", add: "Création", insert: "Création", new: "Création",
  update: "Mise à jour", edit: "Mise à jour", modify: "Mise à jour", patch: "Mise à jour",
  set: "Mise à jour", move: "Mise à jour", rename: "Mise à jour", write: "Mise à jour",
  send: "Envoi", post: "Envoi", reply: "Envoi", publish: "Envoi", share: "Envoi",
  delete: "Suppression", remove: "Suppression", archive: "Suppression", purge: "Suppression",
  cancel: "Annulation",
  run: "Exécution", execute: "Exécution", exec: "Exécution",
  download: "Export", export: "Export",
  upload: "Import", import: "Import",
  duplicate: "Duplication", copy: "Duplication",
};

/** A verb that DESTROYS outranks a read verb sitting earlier in the name: labelling
 *  `get_and_purge` « Lecture » understates what the row did. (The security
 *  classification is `agent/mcpAgentClassify.ts`' job — this is only the label.) */
const DESTRUCTIVE = new Set(["delete", "remove", "purge", "archive", "cancel"]);

/** A name with NO verb at all is usually one of these — say what it looks at rather
 *  than echo the bare noun. */
const NOUN_ACTIONS: Record<string, string> = {
  detail: "Détails", details: "Détails", info: "Détails", about: "Détails",
  status: "État", health: "État", state: "État",
  me: "Compte", whoami: "Compte", profile: "Compte", account: "Compte",
  auth: "Connexion", authenticate: "Connexion", login: "Connexion", connect: "Connexion",
};

/** The OBJECT half, in the product's own French. Only unambiguous single-word
 *  translations belong here — an unmapped word stays as it is, which already reads far
 *  better than the snake_case it came from. */
const NOUNS: Record<string, string> = {
  issue: "ticket", issues: "tickets",
  email: "e-mail", emails: "e-mails",
  thread: "fil", threads: "fils",
  channel: "canal", channels: "canaux",
  file: "fichier", files: "fichiers",
  folder: "dossier", folders: "dossiers",
  event: "événement", events: "événements",
  calendar: "agenda", calendars: "agendas",
  task: "tâche", tasks: "tâches",
  customer: "client", customers: "clients",
  invoice: "facture", invoices: "factures",
  payment: "paiement", payments: "paiements", charge: "paiement", charges: "paiements",
  refund: "remboursement", refunds: "remboursements",
  subscription: "abonnement", subscriptions: "abonnements",
  balance: "solde", balances: "soldes",
  repository: "dépôt", repositories: "dépôts", repo: "dépôt", repos: "dépôts",
  comment: "commentaire", comments: "commentaires",
  user: "utilisateur", users: "utilisateurs",
  member: "membre", members: "membres",
  resource: "ressource", resources: "ressources",
  row: "ligne", rows: "lignes",
  sheet: "feuille", sheets: "feuilles",
  attachment: "pièce jointe", attachments: "pièces jointes",
};

/** Boilerplate every server sprinkles over its tool names, meaning nothing to the
 *  user. The CONNECTOR's own name goes with it: the card above the row already says
 *  « Stripe », so repeating it on every row is noise, not information. */
const NOISE = new Set(["api", "mcp", "tool", "tools", "v1", "v2", "and", "by", "for"]);

/** The browser's gestures, by family — mirrors `toolActionLabel`'s browserLabel but
 *  as short row NOUNS, not live sentences. */
function browserRowLabel(tool: string): string {
  if (/search/.test(tool)) return "Recherche web";
  if (/navigate|goto|open/.test(tool)) return "Ouverture d'une page";
  if (/click|type|fill|press|select|drag|upload|submit/.test(tool)) return "Action sur la page";
  if (/snapshot|screenshot|read|content|text|accessib/.test(tool)) return "Lecture de la page";
  if (/tab/.test(tool)) return "Gestion des onglets";
  if (/close/.test(tool)) return "Fermeture";
  return "Navigation";
}

/** Split a tool name into lowercase words across EVERY convention a server may use:
 *  `snake_case`, `kebab-case`, `dotted.paths` and `camelCase`. */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

export function humanToolLabel(server: string, tool: string): string {
  const own = INTERCEPTED[tool];
  if (own) return own;
  if (server === "browser" || /^browser/.test(tool)) {
    return browserRowLabel(tool.replace(/^browser_/, ""));
  }

  const all = words(tool);
  const connectorWords = new Set(words(baseConnector(server)));
  const kept = all.filter((w) => !NOISE.has(w) && !connectorWords.has(w));

  const verb = kept.find((w) => DESTRUCTIVE.has(w)) ?? kept.find((w) => w in VERBS);
  if (verb) {
    const object = kept
      .filter((w) => w !== verb && !(w in VERBS))
      .map((w) => NOUNS[w] ?? w)
      .join(" ");
    return object ? `${VERBS[verb]} · ${object}` : VERBS[verb];
  }

  for (const w of kept) if (w in NOUN_ACTIONS) return NOUN_ACTIONS[w];

  // Unknown shape — the cleaned words beat the raw snake_case. Fall back to the FULL
  // name when stripping left nothing (a tool named only after its own connector).
  return (kept.length ? kept : all).map((w) => NOUNS[w] ?? w).join(" ");
}

import type { ProviderId } from "@openmasq/llm";
import type { Message as SchemaMessage, RedactCategoryKey } from "@openmasq/schema";

// The canonical persisted chat schema (Role / Message / Conversation / the
// RedactCategoryKey vocabulary) now lives in the shared, zero-runtime
// `@openmasq/schema` package — the SAME types the browser extension persists, so
// the two surfaces can't drift on stored data. Re-exported here so every
// `@openmasq/ui` importer keeps importing them from `../types` unchanged.
export type { Role, Conversation } from "@openmasq/schema";

/** The chat message, exactly as persisted. The model's `reasoning` is part of that
 *  contract now (it survives the turn and the reload) — see `@openmasq/schema` for the
 *  at-rest rule it carries, and `state/reasoningRelay.ts` for how it is filled. */
export type Message = SchemaMessage;
export type { RedactCategoryKey };
/** The folder/file a question is about (« Demander » in the right rail) — see schema. */
export type { AskTarget } from "@openmasq/schema";

/**
 * One entry of the Coffre — a value the user has chosen to ALWAYS redact.
 * `token` is the canonical pseudonymize category token (from `REDACT_TYPES`, e.g.
 * `NAME`/`ORG`/`IBAN`), so the value gets a same-kind fake + the right highlight hue.
 */
export interface CoffreTerm {
  id: string;
  /** The real value to always redact. */
  value: string;
  /** Canonical pseudonymize category token (uppercase). */
  token: string;
  /** Optional user note (e.g. "Compte société"). */
  note?: string;
  /** Creation time (ms epoch), for stable ordering. */
  createdAt: number;
}

/**
 * A top-level screen the user navigates to. Lives HERE, not in `state/redux.ts`,
 * because two layers need it and neither may own it (rule 9 — it used to be
 * re-declared inline in the `section_change` analytics event, which is exactly how
 * a new section silently goes untracked):
 *   • `state/redux.ts` — the `section` slice + the `SECTIONS` runtime array
 *     (`readInitialSection` validates the persisted value against it, so a member
 *     missing THERE silently falls back to chats on reload);
 *   • `analytics/events.ts` — the `section_change` event.
 * This file is type-only, so both import it with no runtime cycle.
 */
// prettier-ignore
export type Section = "chats" | "library" | "vault" | "competences" | "memory" | "settings";

// Les types des COMPÉTENCES vivent avec la fonctionnalité — `competences/
// competenceTypes.ts` (cap de 300 lignes, règle 1), même règle que la Mémoire.
import type { Competence } from "./competences/competenceTypes";
export type { Competence, CompetenceCategoryId } from "./competences/competenceTypes";

// Les types de la MÉMOIRE (MemoryCard, MemoryData, MemoryCategory) vivent avec la
// fonctionnalité — `memory/memoryTypes.ts` (cap de 300 lignes, règle 1). Ré-exportés
// ici pour que `types.ts` reste l'unique surface d'import.
import type { MemoryData } from "./memory/memoryTypes";
export type { MemoryCard, MemoryCategory, MemoryData } from "./memory/memoryTypes";

export interface Settings {
  // NOTE: provider API keys are NOT here — they live encrypted in the main
  // process (Host.keys / safeStorage) and are injected at call time, never
  // persisted in this settings blob. The UI sets/clears them via `host.keys`.
  //
  // ⚠️ Redaction is UNCONDITIONAL and has no off switch: there is no
  // `redactSensitive` flag to consult, so no code path may send un-redacted text.
  // `redactCategories` (WHAT is redacted) and `redactEngine` (HOW it's detected) are
  // the only knobs. Re-introducing a boolean that gates the send would be a
  // fail-OPEN branch a stale persisted `false` could silently revive (rule 7) —
  // `storePersistence.ts` strips the legacy key for exactly that reason.
  /** Base URL for the OpenAI-compatible / local provider. */
  openaiCompatBaseUrl: string;
  systemPrompt: string;
  /**
   * How sensitive data is detected. **The product exposes NO engine picker** — new
   * users get "local" and it can't be changed; the off-device engines were removed
   * and `normalizeSettings` coerces a legacy "remote"/"model" blob back to "local".
   * The union keeps all values because the pipeline + eval suite still exercise
   * them and old blobs may carry any of them before normalisation:
   * - "local": in-process BERT NER (`host.detectLocalPii`, via transformers.js) —
   *   catches free-form PII (names/orgs/places) 100% OFFLINE, no LLM, no network.
   *   The ONLY engine a real user runs; fail-closes where the host can't run it.
   * - "patterns": built-in regex rules only (fast, offline, structured secrets).
   *   UI-unreachable now, but a valid fully-local mode — the automatic fallback and
   *   what the eval harness uses to test the regex path.
   * - "model" / "remote": REMOVED off-device engines (a BYO-key local model, and
   *   the app's server-side GPT-OSS pass). Coerced to "local" on load; the send-path
   *   branches remain as dead code, no UI reaches them.
   */
  redactEngine: "patterns" | "model" | "remote" | "local";
  /**
   * Override URL for the remote redaction function ("remote" engine). Empty =
   * use the build-time `host.redactFnUrl`. The reply is still un-redacted locally
   * from the returned vault, so no round-trip on the way back.
   */
  redactFnUrl?: string;
  /**
   * Detection model for the "remote" (Cloud/Scaleway) engine — one of
   * `REDACT_FN_MODELS` (`@openmasq/redact/remote`). Empty/undefined ⇒ the server
   * default (gpt-oss-120b). The server re-validates it against the allow-list.
   */
  redactRemoteModel?: string;
  /**
   * Which provider runs the redaction model. Any non-session provider works:
   * an open-source local model ("openai-compat" → Ollama / LM Studio), the
   * Mistral API or any other OpenAI-compatible endpoint (also "openai-compat",
   * with a base URL + key), or a hosted API — "openai", "anthropic", "google".
   */
  redactProvider: ProviderId;
  /** Base URL for the redaction model (openai-compat only). Empty = reuse the local base URL. */
  redactModelBaseUrl: string;
  /** Model id used for redaction (e.g. "mistral", "llama3.1", "gpt-4o-mini"). */
  redactModelName: string;
  /** @deprecated RETIRED — forced OFF at every read (`redactNumbersOn`); the KEY stays so
   *  an older persisted blob still parses. */
  redactNumbers: boolean;
  /** Display the FAKES as neutral TOKENS (`[PERSON1]`) — documents' redacted views only,
   *  never the conversation marks (they show the REAL values). DISPLAY-only. */
  redactTokenDisplay?: boolean;
  /** Le sélecteur de modèles s'ouvre en vue SIMPLIFIÉE : une courte liste de favoris
   *  (`@openmasq/catalog` `SIMPLE_MODEL_IDS`), sans colonnes, sans recherche, sans prix
   *  ni drapeau. Absent = vue complète (tous les fournisseurs). Un utilisateur qui a
   *  choisi son modèle dans la vue complète n'est pas ramené de force à la liste courte :
   *  le réglage n'agit que sur ce que le menu MONTRE, jamais sur ce qui est sélectionné. */
  modelPickerSimple?: boolean;
  favoriteModels?: string[]; // liste courte du sélecteur : vide=défaut, sinon REMPLACE ; local (`ModelSelector/simpleList.ts`)
  /** LE MODÈLE ne reçoit que des marqueurs au lieu de faux vraisemblables. Son voisin
   *  ci-dessus change ce que VOUS voyez ; celui-ci change ce qui PART — d'où deux réglages
   *  et non une case. Se paie en qualité de réponse (`redact/bench/tokensVsFakes.md`). Vaut
   *  pour les conversations commencées ENSUITE : le mode est épinglé sur chacune
   *  (`Conversation.redactionMode`) à son premier redaction. Absent = faux. */
  redactWireTokens?: boolean;
  // NOTE: the redaction-model API key (if different from the provider's) also
  // lives in the encrypted main-process store under the id "redactModel".
  /**
   * Per-category redaction rules (global defaults). When a category is off, that
   * kind of data is left in clear (sent to the model, not highlighted). A
   * conversation can override any of these via `Conversation.redactCategories`.
   */
  redactCategories: Record<RedactCategoryKey, boolean>;
  /**
   * How model inference is billed for a platform-eligible provider (OpenAI/Anthropic/
   * Google/Mistral/DeepSeek + Scaleway/OpenRouter) :
   * - `"subscription"`: ALWAYS route through the app's gateway + subscription credits,
   *   even when a personal API key is configured (your keys are ignored).
   * - `"byo"` (or undefined = default): use your OWN API key when one is set (direct,
   *   no credits consumed); fall back to the subscription when no key exists.
   * Non-platform providers (local openai-compat) are unaffected.
   */
  billingMode?: "subscription" | "byo";
  /** Model id used for new conversations. Empty = first available model. */
  defaultModelId: string;
  /** UI colour theme. Two grounds (light / dark) × two accents (green default / blue):
   *  `light` = light+green, `dark` = dark+green, `blue` = light+blue, `blue-dark` = dark+blue. */
  theme?: "light" | "dark" | "blue" | "blue-dark";
  /** True once the first-run onboarding has been completed/skipped. */
  onboarded?: boolean;
  /** « Ne plus proposer » : l'écran d'accueil n'affiche plus les cartes d'exemples.
   *  Réversible depuis le même écran (« Voir des exemples ») — un réglage qu'on ne peut
   *  pas défaire est un cul-de-sac, et celui-ci se prend en un clic. */
  startersOff?: boolean;
  /** Journal technique détaillé (Réglages → Confidentialité → Transparence). Depuis le
   *  13/08 la COLLECTE est permanente (`setDebugCapture(true)` — un retour « Votre
   *  avis » doit pouvoir joindre le journal sans réglage préalable) ; ce champ ne gate
   *  plus que la VISIBILITÉ : l'entrée « Journal de débogage » du menu ⋯ et la trace
   *  console du wire. Le comparatif « ce que le modèle a vu » n'en dépend PAS. */
  debugLog?: boolean;
  /**
   * Opt-in link previews: render an OpenGraph card (thumbnail + title) under a
   * message for each http(s) link. OFF by default because fetching a link reveals
   * your IP + the link to that third-party site. The fetch runs in the platform's
   * safe context (SSRF guard) and the image is inlined as a `data:` URL.
   */
  linkPreviews?: boolean;
  /** Opt-in : le modèle `claude-cli` (abonnement Claude via la CLI Claude Code de
   *  l'utilisateur). OFF par défaut — on ne spawne pas son abonnement personnel sans
   *  geste explicite ; offert seulement si le host confirme la CLI (`probeClaudeCli`,
   *  voir `send/modelAvailability.ts`). */
  claudeCliEnabled?: boolean;
  /** Même opt-in pour la CLI Codex (fournisseur `codex-cli`) — mêmes règles. */
  codexCliEnabled?: boolean;
  /**
   * Une NOTIFICATION système quand une réponse arrive alors qu'on regarde ailleurs
   * (autre fenêtre, ou un autre onglet de conversation). ON par défaut : elle ne se
   * déclenche que hors du champ de vision, et un tour long sans retour est précisément
   * ce qui fait rester devant l'écran pour rien. `false` = jamais de bannière.
   * La logique du QUAND et du QUOI vit dans `state/replyNotice.ts` ; la plateforme qui
   * n'a pas le créneau `host.notify` ne montre pas ce réglage du tout.
   */
  notifyOnReply?: boolean;
  /**
   * Opt-in to anonymous usage analytics (privacy-safe: counts/enums only, never
   * prompt text, PII, vault values or tool data). OFF by default; only sends when
   * a PostHog project is configured AND this is on. See src/analytics.
   */
  analyticsConsent?: boolean;
  /**
   * Agent-browser hardening (prompt-injection damage limiters, desktop only).
   * `browserReadOnly`: the controllable browser may only NAVIGATE + READ — its
   * interaction/mutation tools (click/type/submit…) are withheld from the model, so
   * an injected page can't make it act in an authenticated SaaS ("recherche =
   * lecture seule"). OFF by default (the browser is opt-in and meant for acting).
   * `browserAllowedDomains`: if non-empty, the model may only navigate to these
   * domains (subdomains included); empty = unrestricted. The human URL bar is
   * never restricted.
   */
  browserReadOnly?: boolean;
  browserAllowedDomains?: string[];
  /**
   * The COFFRE: custom values the user always wants redacted — code names, accounts,
   * identifiers — masked before EVERY send, whatever the model (highest-priority
   * `forced`). REAL sensitive values, so treated like the reversible vault at rest:
   * STRIPPED from the plaintext localStorage snapshot when a Host DB exists; kept in
   * localStorage where there is no DB (browser preview / mobile — their only store).
   */
  coffre?: CoffreTerm[];
  /** The ORGANIZATION's Coffre — org-mandated always-redacted terms, SEPARATE from
   *  the personal `coffre` (org-owned, E2E org-scope sync, admin-write/member-read;
   *  the backend enforces the role). Forced into every send via `combinedCoffre`;
   *  same at-rest regime as `coffre` (stripped from plaintext localStorage). */
  orgCoffre?: CoffreTerm[];
  /**
   * The COMPÉTENCES: reusable prompts the user authors and inserts into a chat. They
   * ride `Settings` (a small, user-owned list) and inherit its persistence path
   * (localStorage + the debounced encrypted Host DB, "DB wins" on load). At rest they
   * are treated LIKE the coffre — a prompt routinely carries the real example pasted
   * in while drafting it — so the encrypted DB owns them wherever there is one;
   * no-DB platforms keep them in localStorage, the coffre's trade-off.
   */
  competences?: Competence[];
  /** The ORGANIZATION's compétences library — SEPARATE from the personal list
   *  (org-owned, E2E org-scope sync, admin-write/member-use; same at-rest regime). */
  orgCompetences?: Competence[];
  /** ⚠️ LEGACY — l'ancienne liste « workflows », jamais réécrite mais encore sur le
   *  disque d'un appareil qui n'a pas repris l'app. `normalizeSettings` la verse dans
   *  `competences` puis l'efface ; la retirer du TYPE ferait taire le compilateur là où
   *  il faut lire l'ancienne forme. Reprise + tests : `competences/migrate.ts`. */
  workflows?: Competence[];
  /** The MÉMOIRE — cross-conversation durable facts (global profile + entity cards).
   *  Rides `Settings` like the coffre/compétences and is treated EXACTLY like the
   *  coffre at rest: real PII, stripped from the plaintext localStorage snapshot
   *  whenever the encrypted Host DB owns settings. */
  memoire?: MemoryData;
  /** Opt-IN automatic memory extraction (default OFF): after an idle pause, a model
   *  call over the conversation's WIRE form (already-egressed fakes — zero new PII out)
   *  distills durable facts, un-redacted locally into `memoire`. Gates the SILENT
   *  extraction only — an explicit « retiens que… » runs regardless (its own consent). */
  memoryAuto?: boolean;
  /** The in-chat « activer la mémoire auto ? » proposal card was answered (either way)
   *  — it offers itself once, ever. */
  /** Encart « voyez ce que le modèle a vu » déjà montré (`privacy/transparency.ts`). */
  transparencySeen?: boolean;
  memoryProposalSeen?: boolean;
  /** « Comprendre mon redaction » fermé pour toujours (`privacy/redactionIntro.ts`).
   *  Le savoir reste atteignable : le même chapitre vit dans Aide → guide. */
  redactionIntroSeen?: boolean;
  /**
   * Which search engine the integrated browser uses when the user types free-text
   * keywords into its URL bar (one of `SEARCH_ENGINES` ids: `duckduckgo` (default) /
   * `brave` / `google` / `ecosia` / `startpage` / `qwant`). Undefined ⇒ DuckDuckGo,
   * the app's anti-CAPTCHA default. Purely the URL-bar choice; the model/agent
   * navigation path keeps its own Google→DDG rewrite.
   */
  browserSearchEngine?: string;
  /** The integrated browser's BOOKMARKS row (kit `om-vb-marks`) — user-pinned
   *  pages, starred from the URL bar. Device-local, like the search engine. */
  browserBookmarks?: { label: string; url: string }[];
}

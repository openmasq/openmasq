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
export interface VaultTerm {
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

// The COMPÉTENCES types live with the feature — `competences/
// competenceTypes.ts` (300-line cap, rule 1), same rule as the Mémoire.
import type { Skill } from "./skills/skillTypes";
export type { Skill, SkillCategoryId } from "./skills/skillTypes";

// The MÉMOIRE types (MemoryCard, MemoryData, MemoryCategory) live with the
// feature — `memory/memoryTypes.ts` (300-line cap, rule 1). Re-exported
// here so `types.ts` stays the single import surface.
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
  /** The model selector opens in SIMPLIFIED view: a short favourites list
   *  (`@openmasq/catalog` `SIMPLE_MODEL_IDS`), no columns, no search, no price
   *  or flag. Absent = full view (every provider). A user who picked their
   *  model from the full view is not forced back to the short list:
   *  the setting only affects what the menu SHOWS, never what is selected. */
  modelPickerSimple?: boolean;
  favoriteModels?: string[]; // short selector list: empty=default, otherwise REPLACES; local (`ModelSelector/simpleList.ts`)
  /** THE MODEL only receives markers instead of plausible fakes. Its neighbour
   *  above changes what YOU see; this one changes what GOES OUT — hence two settings
   *  instead of one checkbox. Costs reply quality (`redact/bench/tokensVsFakes.md`). Applies
   *  to conversations started AFTERWARD: the mode is pinned on each one
   *  (`Conversation.redactionMode`) at its first redaction. Absent = false. */
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
  /** Interface language. Like `theme`, this is a DEVICE preference backed by an
   *  unscoped localStorage key (`state/locale.ts`), read BEFORE the first paint. Absent ⇒
   *  the host's language, else French (source language). The type stays a loose
   *  string on purpose: the union lives in `@openmasq/i18n` (`Locale`), and `resolveLocale`
   *  brings any value back — legacy, regional, unknown — to a shipped language or the default. */
  language?: string;
  /** True once the first-run onboarding has been completed/skipped. */
  onboarded?: boolean;
  /** « Ne plus proposer »: the home screen no longer shows the example cards.
   *  Reversible from the same screen (« Voir des exemples ») — a setting that can't
   *  be undone is a dead end, and this one takes one click. */
  startersOff?: boolean;
  /** Detailed technical log (Réglages → Confidentialité → Transparence). Since
   *  13/08 CAPTURE is permanent (`setDebugCapture(true)` — a « Votre
   *  avis » feedback report must be able to attach the log with no prior setting); this field only
   *  gates VISIBILITY now: the ⋯ menu's « Journal de débogage » entry and the wire's
   *  console trace — ON by default since 02/09/2026 (transparency is the product).
   *  The "what the model saw" comparison does NOT depend on it. */
  debugLog?: boolean;
  /**
   * Opt-in link previews: render an OpenGraph card (thumbnail + title) under a
   * message for each http(s) link. OFF by default because fetching a link reveals
   * your IP + the link to that third-party site. The fetch runs in the platform's
   * safe context (SSRF guard) and the image is inlined as a `data:` URL.
   */
  linkPreviews?: boolean;
  /** Opt-in: the `claude-cli` model (Claude abonnement via the user's own Claude
   *  Code CLI). OFF by default — we do not spawn their personal abonnement without
   *  an explicit gesture; offered only if the host confirms the CLI (`probeClaudeCli`,
   *  see `send/modelAvailability.ts`). */
  claudeCliEnabled?: boolean;
  /** Same opt-in for the Codex CLI (provider `codex-cli`) — same rules. */
  codexCliEnabled?: boolean;
  /** Same opt-in for the Antigravity `agy` CLI (provider `antigravity-cli`) — same rules,
   *  connectors included (engine `subscription/antigravityToolsTurn.ts`). */
  antigravityCliEnabled?: boolean;
  /**
   * A system NOTIFICATION when a reply arrives while looking elsewhere
   * (another window, or another conversation tab). ON by default: it only
   * fires out of view, and a long turn with no return is precisely
   * what keeps someone staring at the screen for nothing. `false` = never a banner.
   * The WHEN and WHAT logic lives in `state/replyNotice.ts`; a platform that
   * lacks the `host.notify` slot does not show this setting at all.
   */
  notifyOnReply?: boolean;
  /**
   * Anonymous usage analytics (privacy-safe: counts/enums only, never prompt text,
   * PII, vault values or tool data). Tri-state: `undefined` = ON — the default, dev
   * included (02/09/2026) — until the user explicitly toggles it off; only sends when
   * a relay is configured. See src/analytics.
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
  coffre?: VaultTerm[];
  /** The ORGANIZATION's Coffre — org-mandated always-redacted terms, SEPARATE from
   *  the personal `coffre` (org-owned, E2E org-scope sync, admin-write/member-read;
   *  the backend enforces the role). Forced into every send via `combinedCoffre`;
   *  same at-rest regime as `coffre` (stripped from plaintext localStorage). */
  orgCoffre?: VaultTerm[];
  /**
   * The COMPÉTENCES: reusable prompts the user authors and inserts into a chat. They
   * ride `Settings` (a small, user-owned list) and inherit its persistence path
   * (localStorage + the debounced encrypted Host DB, "DB wins" on load). At rest they
   * are treated LIKE the coffre — a prompt routinely carries the real example pasted
   * in while drafting it — so the encrypted DB owns them wherever there is one;
   * no-DB platforms keep them in localStorage, the coffre's trade-off.
   */
  competences?: Skill[];
  /** The ORGANIZATION's compétences library — SEPARATE from the personal list
   *  (org-owned, E2E org-scope sync, admin-write/member-use; same at-rest regime). */
  orgCompetences?: Skill[];
  /** ⚠️ LEGACY — the old « workflows » list, never rewritten but still on the
   *  disk of a device that hasn't relaunched the app. `normalizeSettings` pours it into
   *  `competences` then clears it; removing it from the TYPE would silence the compiler
   *  exactly where it needs to read the old shape. Migration + tests: `competences/migrate.ts`. */
  workflows?: Skill[];
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
  /** « voyez ce que le modèle a vu » card already shown (`privacy/transparency.ts`). */
  transparencySeen?: boolean;
  memoryProposalSeen?: boolean;
  /** « Comprendre mon masquage » closed for good (`privacy/redactionIntro.ts`).
   *  The knowledge stays reachable: the same chapter lives in Aide → guide. */
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

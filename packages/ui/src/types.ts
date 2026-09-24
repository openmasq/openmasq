import type { ConnectorMasking } from "@openmasq/catalog";
import type { ProviderId } from "@openmasq/llm";
import type { Message as SchemaMessage, RedactCategoryKey } from "@openmasq/schema";

// The persisted chat schema (Role / Message / Conversation / RedactCategoryKey) lives in
// the zero-runtime `@openmasq/schema`; re-exported so importers keep `../types`.
export type { Role, Conversation } from "@openmasq/schema";

/** The chat message, exactly as persisted (`@openmasq/schema` carries the at-rest rule of
 *  `reasoning`; `state/reasoningRelay.ts` fills it). */
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
 * A top-level screen. Lives HERE because two layers need it and neither may own it
 * (rule 9): `state/redux.ts` (the `section` slice + the `SECTIONS` runtime array that
 * `readInitialSection` validates against) and `analytics/events.ts` (`section_change`).
 */
// prettier-ignore
export type Section = "chats" | "library" | "vault" | "competences" | "memory" | "settings";

// The COMPÉTENCES types live with the feature (`competences/competenceTypes.ts`).
import type { Skill } from "./skills/skillTypes";
export type { Skill, SkillCategoryId } from "./skills/skillTypes";

// The MÉMOIRE types live with the feature (`memory/memoryTypes.ts`); re-exported so
// `types.ts` stays the single import surface.
import type { MemoryData } from "./memory/memoryTypes";
export type { MemoryCard, MemoryCategory, MemoryData } from "./memory/memoryTypes";

export interface Settings {
  // Provider API keys are NOT here — they live encrypted in the main process (Host.keys /
  // safeStorage) and are injected at call time.
  //
  // ⚠️ Redaction is UNCONDITIONAL: no `redactSensitive` flag exists, so no code path may
  // send un-redacted text. `redactCategories` (WHAT) and `redactEngine` (HOW) are the only
  // knobs. A boolean gating the send would be a fail-OPEN branch a stale persisted `false`
  // could revive (rule 7) — `storePersistence.ts` strips the legacy key for that reason.
  /** Base URL for the OpenAI-compatible / local provider. */
  openaiCompatBaseUrl: string;
  /** Model ids offered for that endpoint ON TOP of its `/models` list — free text, comma or
   *  newline separated (`hooks/useLocalModels.ts` `parseLocalModelIds`). */
  openaiCompatModelIds: string;
  systemPrompt: string;
  /**
   * How sensitive data is detected. The product exposes NO engine picker: users get
   * "local" (in-process BERT NER, 100 % offline; fail-closes where the host can't run it).
   * "patterns" = regex rules only, the automatic fallback and the eval harness' regex path.
   * "model" / "remote" are RETIRED off-device engines: `normalizeSettings` coerces them to
   * "local" on load; the union keeps them so an old blob still parses.
   */
  redactEngine: "patterns" | "model" | "remote" | "local";
  /** Override URL for the retired "remote" engine. Empty = the build-time `host.redactFnUrl`. */
  redactFnUrl?: string;
  /** Detection model for the retired "remote" engine — one of `REDACT_FN_MODELS`
   *  (`@openmasq/redact/remote`); the server re-validates it against its allow-list. */
  redactRemoteModel?: string;
  /** Which provider runs the redaction model: any non-session provider (a local
   *  "openai-compat" endpoint, or a hosted API). */
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
  /** The model selector opens in SIMPLIFIED view (`@openmasq/catalog` `SIMPLE_MODEL_IDS`).
   *  Affects only what the menu SHOWS, never what is selected. */
  modelPickerSimple?: boolean;
  favoriteModels?: string[]; // short selector list: empty=default, otherwise REPLACES; local (`ModelSelector/simpleList.ts`)
  /** THE MODEL receives markers instead of plausible fakes (the setting above changes what
   *  YOU see; this one changes what GOES OUT). Costs reply quality. Pinned on each
   *  conversation at its first redaction (`Conversation.redactionMode`). Absent = false. */
  redactWireTokens?: boolean;
  // NOTE: the redaction-model API key (if different from the provider's) also
  // lives in the encrypted main-process store under the id "redactModel".
  /** Per-category redaction rules (global defaults); a conversation can override them via
   *  `Conversation.redactCategories`. */
  redactCategories: Record<RedactCategoryKey, boolean>;
  /** Per-CONNECTOR masking for the few that must not follow the global rules (own files vs
   *  a stranger's web page). Absent ⇒ global rules ("Default"). Shape and resolution are
   *  `@openmasq/catalog`'s `ConnectorMasking`, shared with the local proxy. */
  connectorMasking?: Record<string, ConnectorMasking>;
  /** How inference is billed for a platform-eligible provider: `"subscription"` ALWAYS
   *  routes through the metered credits (personal keys ignored); `"byo"` (default) uses your
   *  own key when set and falls back to the subscription otherwise. */
  billingMode?: "subscription" | "byo";
  /** Model id used for new conversations. Empty = first available model. */
  defaultModelId: string;
  /** UI colour theme — the GROUND only. `state/settings/theme.ts` `readTheme` maps the
   *  retired `blue` / `blue-dark` values to the ground they meant. */
  theme?: "light" | "dark";
  /** Interface language: a DEVICE preference in an unscoped localStorage key
   *  (`state/locale.ts`), read BEFORE the first paint. Absent ⇒ host language, else French.
   *  Loose string on purpose: `@openmasq/i18n` `resolveLocale` maps any value to a shipped language. */
  language?: string;
  /** True once the first-run onboarding has been completed/skipped. */
  onboarded?: boolean;
  /** « Ne plus proposer »: the home screen hides the example cards. Reversible from the same screen. */
  startersOff?: boolean;
  /** Detailed technical log (Réglages → Confidentialité → Transparence). CAPTURE is
   *  permanent (a feedback report must be able to attach the log); this field gates
   *  VISIBILITY only (the ⋯ menu entry and the wire's console trace). ON by default. */
  debugLog?: boolean;
  /** Opt-in link previews (OpenGraph card under a message). OFF by default: fetching a link
   *  reveals your IP to that site. The fetch runs behind the SSRF guard, the image is inlined. */
  linkPreviews?: boolean;
  /** Opt-in: the `claude-cli` model (the user's own Claude Code CLI). OFF by default; offered
   *  only if the host confirms the CLI (`send/modelAvailability.ts`). */
  claudeCliEnabled?: boolean;
  /** Same opt-in for the Codex CLI (provider `codex-cli`) — same rules. */
  codexCliEnabled?: boolean;
  /** Same opt-in for the Antigravity `agy` CLI (provider `antigravity-cli`) — same rules,
   *  connectors included (engine `subscription/antigravityToolsTurn.ts`). */
  antigravityCliEnabled?: boolean;
  /** A system NOTIFICATION when a reply arrives out of view. ON by default; `false` = never.
   *  Logic in `state/replyNotice.ts`; hidden when the host lacks `host.notify`. */
  notifyOnReply?: boolean;
  /** Anonymous usage analytics (counts/enums only, never prompt text, PII, vault values or
   *  tool data). Tri-state: `undefined` = ON until the user toggles it off; only sends when
   *  a relay is configured. See src/analytics. */
  analyticsConsent?: boolean;
  /** Agent-browser hardening (desktop only). `browserReadOnly`: the browser may only
   *  NAVIGATE + READ, its mutation tools are withheld from the model (OFF by default: the
   *  browser is opt-in and meant for acting). `browserAllowedDomains`: if non-empty, the
   *  model may only navigate to these domains (subdomains included); the human URL bar is
   *  never restricted. */
  browserReadOnly?: boolean;
  browserAllowedDomains?: string[];
  /** The COFFRE: values the user always wants redacted, masked before EVERY send (highest
   *  priority `forced`). REAL values: STRIPPED from the plaintext localStorage snapshot when
   *  a Host DB exists; kept there where no DB exists (their only store). */
  coffre?: VaultTerm[];
  /** The ORGANIZATION's Coffre — org-owned, E2E org-scope sync, admin-write/member-read
   *  (the server enforces the role). Forced into every send via `combinedCoffre`; same
   *  at-rest regime as `coffre`. */
  orgCoffre?: VaultTerm[];
  /** The COMPÉTENCES: reusable prompts. At rest treated LIKE the coffre (a prompt routinely
   *  carries a real example): the encrypted DB owns them wherever there is one. */
  competences?: Skill[];
  /** The ORGANIZATION's compétences library — SEPARATE from the personal list
   *  (org-owned, E2E org-scope sync, admin-write/member-use; same at-rest regime). */
  orgCompetences?: Skill[];
  /** LEGACY « workflows » list: `normalizeSettings` pours it into `competences` then clears
   *  it. Kept in the TYPE so the compiler still reads the old shape (`competences/migrate.ts`). */
  workflows?: Skill[];
  /** The MÉMOIRE — cross-conversation durable facts. Same at-rest regime as the coffre. */
  memoire?: MemoryData;
  /** Opt-IN automatic memory extraction (default OFF): after an idle pause, a model call over
   *  the WIRE form (already-egressed fakes) distills durable facts. Gates the SILENT
   *  extraction only — an explicit « retiens que… » runs regardless. */
  memoryAuto?: boolean;
  /** The « activer la mémoire auto ? » card was answered — it offers itself once, ever. */
  /** « voyez ce que le modèle a vu » card already shown (`privacy/transparency.ts`). */
  transparencySeen?: boolean;
  memoryProposalSeen?: boolean;
  /** « Comprendre mon masquage » closed for good (`privacy/redactionIntro.ts`).
   *  The knowledge stays reachable: the same chapter lives in Aide → guide. */
  redactionIntroSeen?: boolean;
  /** Search engine of the integrated browser's URL bar (one of `SEARCH_ENGINES` ids).
   *  Undefined ⇒ DuckDuckGo. The agent navigation path keeps its own rewrite. */
  browserSearchEngine?: string;
  /** The integrated browser's BOOKMARKS row — device-local, like the search engine. */
  browserBookmarks?: { label: string; url: string }[];
}

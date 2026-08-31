// Store persistence + settings defaults/normalization — the PURE, stateless helpers
// the `useChatStore` hook uses to read/write the localStorage snapshot and seed/repair
// settings. Extracted from `store.ts` (module-private there; nothing else imports them)
// to shrink the hook file. Session-MUTABLE state (nerWarmed) stays in store.ts — this
// module holds only pure functions + constants.
import { PROVIDERS } from "@openmasq/llm";
import { resolveLocale } from "@openmasq/i18n";
import { CATEGORY_DEFAULTS } from "@openmasq/catalog/redaction";
import { migrateRedactCategories } from "./settingsMigrations";
import { migrateLegacyLocalStorage } from "./legacyStorage";
import { DEFAULT_MODEL_ID } from "../prompt/models";
import type { Conversation, Settings } from "../types";
import { blueAccent } from "./theme";
import { mergeLegacyWorkflows } from "../competences/migrate";
import { stripVaultForLocal } from "../send/sendGuards";

export const CONV_KEY = "openmasq.conversations";
export const SETTINGS_KEY = "openmasq.settings";
// The last-open conversation, so a reload returns to it instead of jumping to the
// first conversation in the list.
export const ACTIVE_KEY = "openmasq.activeId";

// Conversation storage (localStorage AND the local DB) is SCOPED to the signed-in
// account — a shared machine must NEVER surface one account's chats to another.
// `uid` null (signed out / no auth) ⇒ no local conversation store. The scoped keys
// (`…:<uid>`) never read the legacy UNSCOPED keys, so any pre-fix shared data stays
// quarantined (shown to no account) rather than migrated to whoever signs in.
export const convKeyFor = (uid: string | null): string | null =>
  uid ? `${CONV_KEY}:${uid}` : null;
export const activeKeyFor = (uid: string | null): string | null =>
  uid ? `${ACTIVE_KEY}:${uid}` : null;

// Settings are account-scoped for the SAME reason conversations are: `Settings.coffre`
// (the user's real sensitive values) and `Settings.competences` (their prompts, which
// routinely carry the real example pasted in while drafting) are user-owned content.
// ⚠️ Unlike the conversation keys this one FALLS BACK to the unscoped key when signed
// out: the app renders before auth resolves and must not lose the device's theme/model
// on every cold start. That fallback is why the adopt effect MUST overwrite settings on
// account switch — the pre-auth blob belongs to whoever used the device last, and on a
// platform with no Host DB (browser preview / mobile) `stripUserContentForLocal` is a
// no-op, so it carries their coffre. Pinned by `storeSettingsScope.test.ts`.
export const settingsKeyFor = (uid: string | null): string =>
  uid ? `${SETTINGS_KEY}:${uid}` : SETTINGS_KEY;

// F1 + M3 (data-at-rest): `stripVaultForLocal` (in `sendGuards.ts`, pure + tested)
// drops the reversible VAULT (`redactionVault`/`redactionKinds`) AND each message's
// `modelContent` (up to ~50k chars of REAL PII) from the localStorage snapshot when a
// durable encrypted Host DB owns them — so the unencrypted Chromium LevelDB copy can't
// bypass the DB's at-rest encryption. The DB restores them on reload ("DB wins").
/** Serialise the conversation set for localStorage, stripping the vault when a durable
 *  (encrypted) Host DB owns it. `hasDb` = `!!host.db`. */
export const localConvSnapshot = (convs: Conversation[], hasDb: boolean): string =>
  JSON.stringify(hasDb ? convs.map(stripVaultForLocal) : convs);

// F1 (data-at-rest), same rationale as the vault: the USER-AUTHORED settings fields hold
// real sensitive text, so when a durable Host DB owns the settings (persisted ENCRYPTED at
// rest; the DB-load merge is "DB wins") we must NOT also mirror them into the renderer's
// UNENCRYPTED localStorage. Both are dropped when `!!host.db`; the DB restores them on
// reload. Platforms with no Host DB (browser preview, mobile) keep them in localStorage —
// their only store, the same trade-off already accepted for the vault there.
//   • `coffre`      — a dictionary of REAL sensitive values the user always wants redacted.
//   • `competences` — reusable prompts; free text the user wrote, and a template routinely
//     carries the real example pasted in while drafting it (a client's name, a real e-mail).
//     The connector-routines are part of it (they name real repos, projects,
//     clients): one single list, one single at-rest regime.
//   • `workflows`   — the OLD list, still on the disk of a device that hasn't
//     picked up the app. Always stripped: the local blob must not keep in clear what the
//     migration will pour into `competences` on the next load.
/** Drop the user-authored settings content from the localStorage copy when an encrypted
 *  Host DB owns it. `hasDb` = `!!host.db`. */
export function stripUserContentForLocal(s: Settings, hasDb: boolean): Settings {
  if (!hasDb) return s;
  const hasMemory = !!(s.memoire?.profile?.trim() || s.memoire?.cards?.length);
  const hasOrg = !!(s.orgCoffre?.length || s.orgCompetences?.length);
  if (!s.coffre?.length && !s.competences?.length && !s.workflows?.length && !hasMemory && !hasOrg)
    return s;
  const rest = { ...s };
  if (s.coffre?.length) delete (rest as { coffre?: unknown }).coffre;
  if (s.competences?.length) delete (rest as { competences?: unknown }).competences;
  if (s.workflows?.length) delete (rest as { workflows?: unknown }).workflows;
  // The ORG mirrors hold the same classes of content as their personal
  // counterparts (real terms, real prompt examples) — same at-rest regime.
  if (s.orgCoffre?.length) delete (rest as { orgCoffre?: unknown }).orgCoffre;
  if (s.orgCompetences?.length) delete (rest as { orgCompetences?: unknown }).orgCompetences;
  // The mémoire is REAL cross-conversation PII (names, orgs, facts) — same at-rest
  // regime as the coffre: the encrypted Host DB owns it, plaintext localStorage never.
  if (hasMemory) delete (rest as { memoire?: unknown }).memoire;
  return rest;
}

export const DEFAULT_SETTINGS: Settings = {
  openaiCompatBaseUrl: PROVIDERS["openai-compat"].defaultBaseUrl ?? "",
  // Deliberately in FRENCH: this default is concatenated into the SAME system message as
  // LANGUAGE_GUIDANCE (`send/buildWire.ts`), and an English sentence there pulls the reply — and
  // especially the displayed REASONING — toward English. The old English default is migrated by
  // `normalizeSettings`, without which it would count as a CUSTOM prompt and pay a
  // detection pass on every send (`shouldRedactSystemPrompt`).
  systemPrompt: "Tu es un assistant utile.",
  // On-device "local" (BERT NER) engine — the ONLY engine. Free-form PII (names,
  // orgs, places) is detected fully offline — no LLM round-trip, no network — so
  // redaction is ~instant (~tens of ms once warm). Pre-warmed on mount (see the
  // effect below) so even the first message is fast. It is NOT user-switchable: the
  // hosted "model"/"remote" engines were removed and `normalizeSettings` coerces any
  // legacy value back to "local". Where the on-device model is unavailable (browser
  // preview) the send fail-closes rather than downgrading.
  redactEngine: "local",
  // Legacy redaction-backend fields, unused now that the engine is fixed to "local"
  // (kept optional in the type; not surfaced anywhere).
  redactProvider: "mistral",
  redactModelBaseUrl: "",
  redactModelName: "mistral-small-latest",
  redactNumbers: false,
  // Jetons ON by default: in the redacted views AND the mark hover card, a pseudonym
  // renders as its category token ([PERSON1], [IBAN]) — a fake that LOOKS like a real
  // value invites the "did it leak?" double-take, the token says "protected, category X"
  // at a glance. Display-only (the wire always carries the true pseudonyms); the exact
  // pseudonyms stay readable in the audit journal (Réglages → Journal). An explicit OFF persisted by
  // the user wins over this seed (normalizeSettings spreads user settings over it).
  redactTokenDisplay: true,
  // Its neighbor, and its inverse by default: what the MODEL receives stays a plausible
  // fake. The on-screen token is a reading comfort, free; the token ON THE
  // WIRE costs in reply quality (`redact/bench/tokensVsFakes.md`), so it's opt-in.
  redactWireTokens: false,
  // SIMPLIFIED view by default: opening on a three-column hierarchy requires
  // picking a provider before having picked a model — a tradeoff most
  // don't need to make. The 300+ models stay one click away (« Tous les modèles »), and the
  // choice persists once it's been made once.
  modelPickerSimple: true,
  // Category on/off defaults come from the single-source catalog (@openmasq/catalog)
  // so the desktop and the org admin console agree. All PII on; the noisy generic
  // `apikey` heuristic and bare `number` are off by default (the latter also gated
  // by `redactNumbers`).
  redactCategories: { ...CATEGORY_DEFAULTS },
  // The default has ONE single home (`prompt/models.ts`): onboarding no longer asks for a
  // chat model, so this seed governs — and a second write of the id
  // would drift from the constant the rest of the code consults (rule 9).
  defaultModelId: DEFAULT_MODEL_ID,
  theme: "blue",
  // Language: absent by default, which lets `state/locale.ts` pick the HOST's
  // (an English-speaking user starts in English without configuring anything) before the
  // French fallback. Setting « fr » here would impose French on everyone — the opposite of the goal.
  language: undefined,
  onboarded: false,
  debugLog: false,
  linkPreviews: false, // opt-in: fetching a link leaks your IP + the link to that site
  // Opt-in: the app NEVER spawns the user's Claude Code CLI (their
  // personal subscription) without an explicit action in Réglages → Modèles.
  claudeCliEnabled: false,
  codexCliEnabled: false,
  browserSearchEngine: "brave", // integrated-browser URL-bar search engine (user-switchable)
  // The COFFRE: values the user always wants redacted (code names, accounts, ids).
  // Empty by default; holds REAL sensitive values, so it is stripped from the plaintext
  // localStorage settings copy whenever a durable encrypted Host DB exists (see below).
  coffre: [],
  // The COMPÉTENCES: reusable prompts the user authors + inserts into a chat. Empty by
  // default — we ship NO seed templates: a pre-filled list reads as "the app wrote these
  // for you" and the page's empty state ("Créez votre première compétence") is the
  // clearer invitation. Stripped from localStorage alongside the coffre (see above).
  competences: [],
  // analyticsConsent intentionally absent (tri-state): undefined = use the env
  // default — ON in a packaged production build, OFF in dev — until the user
  // explicitly toggles it. See the consent effect below.
};

export function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function load<T>(key: string, fallback: T): T {
  migrateLegacyLocalStorage(); // the keys from before the rename — one pass, then a no-op
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}


/** A message left `pending` from a PREVIOUS session = its stream was cut off
 *  (reload/quit mid-answer). Clear the flag + mark it `incomplete` so the UI
 *  shows an "interrupted" indicator + Réessayer instead of a frozen loader.
 *  Same fate for `memoryNotedPending` (« Mise en mémoire… »): an extraction that
 *  didn't survive the session is dead — the frozen caption would lie forever. */
export function clearStuckPending(convs: Conversation[]): Conversation[] {
  return convs.map((c) =>
    c.messages.some((m) => m.pending || m.memoryNotedPending)
      ? {
          ...c,
          messages: c.messages.map((m) => {
            const out = m.pending ? { ...m, pending: false, incomplete: true } : m;
            return out.memoryNotedPending ? { ...out, memoryNotedPending: undefined } : out;
          }),
        }
      : c,
  );
}

/**
 * Fix up settings persisted by older versions. Notably: the redaction model
 * default used to be the bare "mistral" tag (valid on Ollama), which 404s on the
 * hosted Mistral API — migrate it to a real hosted model id there.
 */
export function normalizeSettings(s: Settings): Settings {
  // Backfill redaction categories added after a user's settings were saved
  // (shallow-merged settings would otherwise drop the new ip/apikey keys).
  const out: Settings = {
    ...s,
    redactCategories: migrateRedactCategories(
      s.redactCategories,
      DEFAULT_SETTINGS.redactCategories,
    ),
  };
  // Strip legacy plaintext keys so the persisted settings never carry them again
  // (they're migrated into the encrypted main store; see the migration effect).
  delete (out as unknown as Record<string, unknown>).apiKeys;
  delete (out as unknown as Record<string, unknown>).redactModelApiKey;
  if (
    out.redactProvider === "mistral" &&
    (!out.redactModelName?.trim() || out.redactModelName.trim() === "mistral")
  ) {
    out.redactModelName = "mistral-small-latest";
  }
  // The green accent is no longer offered: a theme persisted by an earlier version is
  // translated to its indigo twin, otherwise the account that had it would stay green with
  // no switch to get out of it (the light/dark ground, though, stays a choice).
  out.theme = blueAccent(out.theme);
  // The language is brought back to a SHIPPED locale, or cleared (⇒ host language at boot).
  // A legacy/regional/unknown value (« en-US », « de », an old blob) must not
  // stay as-is: `state/locale.ts` rereads it and `resolveLocale` would normalize it
  // anyway, but clearing it here keeps the persisted blob clean (rule 7: only one
  // form reaches disk). An already-valid value (« fr »/« en ») is kept.
  out.language = resolveLocale(out.language) ?? undefined;
  // The offline local NER model is no longer user-selectable (one BERT model per
  // platform), so a legacy `redactLocalModel` setting is simply dropped on load.
  delete (out as { redactLocalModel?: unknown }).redactLocalModel;
  // WORKFLOWS were a second list of the same object; only one remains. The
  // old one is poured into compétences (ids kept — chips, deep links and message
  // tags point at them) then the field is cleared, otherwise the migration would replay
  // on every load. The merge rule is pure and tested separately
  // (`competences/migrate.ts`); here we only apply it and clear.
  const merged = mergeLegacyWorkflows(out.competences, out.workflows);
  if (merged) out.competences = merged;
  delete (out as { workflows?: unknown }).workflows;
  // ⚠️ SECURITY (rule 7): the OFF-DEVICE detection engines were removed from the
  // product — "remote" (the app's cloud service) and "model" (a BYO-key model). Their
  // pickers are deleted, so a settings blob written by an older build (or a user who
  // had switched to one) is coerced back to the on-device NER — otherwise detection
  // would keep leaving the machine with no UI to turn it off. "patterns" (the purely
  // local, deterministic regex engine) is LEFT as-is: it's fully offline, it's the
  // automatic fallback where the NER model can't run, and coercing it to "local" would
  // fail-close on a host without the NER model (browser preview). Pinned by
  // `storePersistence.test.ts`.
  if (out.redactEngine === "remote" || out.redactEngine === "model") {
    out.redactEngine = "local";
  }
  // The old-time default was English; it follows the current default (French). Without this
  // migration, a blob persisted by an earlier version would pass for a
  // custom prompt: PII detection paid on every send, and an English sentence heading the
  // system message that pulls the models' reasoning toward English.
  if (out.systemPrompt === "You are a helpful assistant.") {
    out.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
  }
  // ⚠️ SECURITY (rule 7): these five are no longer user-switchable, and a blob
  // written by an older build can still carry them. `redactSensitive: false` is the
  // dangerous one — dropping the toggle without dropping the KEY would leave a user
  // who had turned redaction off sending in clear forever, with no UI to turn it
  // back on. Nothing reads them any more, but they're deleted so the persisted blob
  // can't re-seed a gate if one is ever mistakenly re-added. Pinned by
  // `storePersistence.test.ts`.
  for (const k of [
    "redactSensitive",
    "restoreInReply",
    "sendPreview",
    "pythonEnabled",
    "toolProgressSummaries",
  ]) {
    delete (out as unknown as Record<string, unknown>)[k];
  }
  return out;
}

export function newConversation(modelId: string): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    title: "Nouvelle conversation",
    modelId,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

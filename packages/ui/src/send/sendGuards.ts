/**
 * Pure decision cores for the send pipeline's PII-leak guards, extracted from
 * `store.ts` so each closed hole has a unit-testable invariant (hard rule 7 — a
 * security fix ships with a regression test). React-free, no host/DOM. The store
 * imports these; the behaviour is identical to the inline checks it replaced.
 */
import type { Conversation } from "../types";

/**
 * F1 + M3 (data-at-rest) — strip the most sensitive fields from the conversation
 * copy that goes to the renderer's UNENCRYPTED localStorage when a durable Host DB
 * owns them:
 *  - `redactionVault` (placeholder→REAL value) + `redactionKinds` (F1): the vault
 *    is the crown jewel; the desktop DB persists it ENCRYPTED at rest and the load
 *    merge is "DB wins", so a plaintext localStorage mirror would bypass that
 *    encryption (Chromium's LevelDB is not encrypted).
 *  - each `Message.modelContent` (M3): the FULL ORIGINAL text of a message + folded
 *    documents (up to ~50k chars of REAL PII), kept only to rebuild the wire on a
 *    follow-up/retry — never for display. Leaving it in localStorage defeats the DB
 *    encryption exactly like the vault; the DB restores it on reload.
 *  - each `Message.redactedSpans` + the conversation-level `forcedRedactions` and
 *    `fileRedactions` (audit F1 second pass): these each carry `{value: <REAL>}` — the
 *    detected span values, the manual/Coffre forced redactions, and every attached
 *    file's redaction spans. Leaving them re-opens the exact F1 hole the vault-strip
 *    closes: an attacker reading Chromium's unencrypted LevelDB recovers the real PII
 *    from `redactedSpans` even though the vault is gone. The DB owns them; `redactedSpans`
 *    re-derives from the vault/kinds for display, and `forcedRedactions`/`fileRedactions`
 *    are re-hydrated on the "DB wins" load merge.
 *  - each `Message.competence.prompt` AND `Message.workflow.prompt`: the instruction as
 *    it was actually sent — user-authored free text that routinely carries the real
 *    example pasted in while drafting it. The tag's `id`/`name` (+ the workflow's
 *    connector-id `servers`) are kept (they must render before the DB load); the prompt
 *    the accordion reveals comes back on the "DB wins" merge.
 * `Message.content` (the DISPLAYED text) is intentionally KEPT — it must render
 * before/without the async DB load. Callers pass this only when `!!host.db`; a
 * platform with no DB keeps everything in localStorage (its only persistence).
 */
export function stripVaultForLocal(c: Conversation): Conversation {
  const hasModelContent = c.messages?.some((m) => m.modelContent !== undefined);
  const hasSpans = c.messages?.some((m) => (m.redactedSpans?.length ?? 0) > 0);
  // A compétence's `prompt` is REAL user-authored text (a template routinely keeps the
  // example pasted in while drafting it), so it belongs to the encrypted DB exactly like
  // `modelContent`. `id`/`name` stay — they ARE the tag, which must render before the
  // async DB load, and neither is user content.
  const hasSkillPrompt = c.messages?.some((m) => m.competence?.prompt !== undefined);
  // Same contract for a workflow's prompt — the compétences' sibling.
  const hasWorkflowPrompt = c.messages?.some((m) => m.workflow?.prompt !== undefined);
  // The model's kept REFLECTION: un-redacted (it reasons about the fakes, we restore
  // them for display) and unbounded — a thinking model spends thousands of tokens per
  // turn on the user's real names, amounts and documents. `modelContent`'s class, not
  // `content`'s: nothing needs it before the async DB load, since the bubble shows it
  // collapsed. Encrypted DB only.
  const hasReasoning = c.messages?.some((m) => m.reasoning !== undefined);
  if (
    !c.redactionVault &&
    !c.redactionKinds &&
    c.redactionSalt === undefined &&
    !hasModelContent &&
    !hasSpans &&
    !hasSkillPrompt &&
    !hasWorkflowPrompt &&
    !hasReasoning &&
    !c.forcedRedactions?.length &&
    !c.fileRedactions?.length &&
    !c.turnCheckpoint &&
    !c.contextSummary
  ) {
    return c;
  }
  const rest: Conversation = { ...c };
  delete rest.redactionVault;
  delete rest.redactionKinds;
  // The in-flight turn's WIRE transcript: fakes rather than real values, but still the full
  // text that left the machine plus every page the turn read. Same at-rest class as
  // `modelContent` — the encrypted DB owns it, the plaintext mirror never sees it.
  delete rest.turnCheckpoint;
  // The compaction recap: wire text again, and a condensation of the whole opening of the
  // conversation. Encrypted DB only, for the same reason.
  delete rest.contextSummary;
  // The salt is reversibility material (the KEY that maps a value→its fake): with the
  // fakes, it inverts the mapping by dictionary. It lives in the encrypted DB with the
  // vault, never in the plaintext localStorage mirror.
  delete rest.redactionSalt;
  // The key is the same material, and more of it: it IS the mapping.
  delete rest.redactionKey;
  delete rest.forcedRedactions;
  delete rest.fileRedactions;
  if (hasModelContent || hasSpans || hasSkillPrompt || hasWorkflowPrompt || hasReasoning) {
    rest.messages = c.messages.map((m) => {
      if (
        m.modelContent === undefined &&
        m.redactedSpans === undefined &&
        m.reasoning === undefined &&
        m.competence?.prompt === undefined &&
        m.workflow?.prompt === undefined
      ) {
        return m;
      }
      const copy = { ...m };
      delete copy.modelContent;
      delete copy.redactedSpans;
      delete copy.reasoning;
      if (copy.competence?.prompt !== undefined) {
        copy.competence = { id: copy.competence.id, name: copy.competence.name };
      }
      if (copy.workflow?.prompt !== undefined) {
        copy.workflow = {
          id: copy.workflow.id,
          name: copy.workflow.name,
          servers: copy.workflow.servers,
        };
      }
      return copy;
    });
  }
  return rest;
}

/** Case-insensitive match of a stored file NAME against the model's requested
 *  attachment names — the matcher M1 uses. STRICT on purpose (audit 2026-08-10):
 *  exact name (extension optional), or a requested STEM of ≥ 6 chars contained in
 *  the stored name (« budget » → « budget 2024.xlsx »). Never the other direction —
 *  `w.includes(n)` let a one-letter request (« e ») match nearly every stored file,
 *  which re-opened "attach everything" through a generic name; the only rampart left
 *  was the user re-reading the confirm card. */
export function matchesAttachmentName(fileName: string, wanted: string[]): boolean {
  const n = fileName.toLowerCase();
  const stem = n.replace(/\.[a-z0-9]{1,5}$/, "");
  return wanted.some((w) => n === w || stem === w || (w.length >= 6 && n.includes(w)));
}

/**
 * M1 — resolve the model's requested attachment names to the conversation's stored
 * files by NAME MATCH ONLY. A name that matches nothing resolves to `[]` — there is
 * **no "attach every stored file" fallback** (that let a prompt-injected model
 * exfiltrate every document, in the user's REAL bytes, just by naming a non-existent
 * file — past the string-only arg-exfil gate). Fails closed on a miss.
 */
export function pickAttachmentMetas<T extends { name: string }>(
  metas: T[],
  names: string[],
): T[] {
  const wanted = names.map((n) => n.toLowerCase().trim()).filter(Boolean);
  if (!wanted.length) return [];
  return metas.filter((m) => matchesAttachmentName(m.name, wanted));
}

/** The redaction detectors a host can expose (only presence matters here). */
export interface RedactCapabilities {
  detectLocalPii?: unknown;
  complete?: unknown;
}

/**
 * M2 — the user picked an AI redaction engine but its detector is NOT available on
 * this host. Returns which one is missing so the caller can FAIL CLOSED instead of
 * silently degrading to regex-only (a `local`/`model` engine with no detector makes
 * `pseudonymize` run patterns-only and skips the `useAiDetect` fail-closed guard —
 * exactly the "regex downgrade" hard rule 7 forbids). `null` = the engine is fine
 * (patterns/remote need no local capability, or the AI detector is present).
 */
export function redactEngineUnavailable(
  engine: string,
  caps: RedactCapabilities,
): "local" | "model" | null {
  if (engine === "local" && !caps.detectLocalPii) return "local";
  if (engine === "model" && !caps.complete) return "model";
  return null;
}

/**
 * M11 — the legacy plaintext-localStorage API keys must migrate into the FIRST
 * signed-in account and NEVER a second one (else account A's keys land in account
 * B's encrypted store on a shared machine). True only when: a real account is signed
 * in, the once-per-session import hasn't run, and there are legacy keys to move.
 */
export function shouldImportLegacyKeysOnce(
  alreadyImported: boolean,
  userId: string | null,
  legacyKeyCount: number,
): boolean {
  return !!userId && !alreadyImported && legacyKeyCount > 0;
}

/**
 * H2 — fail-closed invariant for the "send a PDF as REDACTED images" path
 * (`renderDocImages.ts`): a PER-VALUE proof, not a whole-document floor. The
 * implementation lives in `@openmasq/redact/pdf-redact` (`pdfMatch.ts`) because the
 * extension's native-upload path (`scrubFile.ts`) applies the SAME gate (rule 9);
 * re-exported here so the send pipeline's gates stay enumerable in one place.
 * Caller contract + failure modes: see the source. `buildFileImages` passes the
 * DOCUMENT's own drop-time map — never the whole-conversation vault.
 * The FILE send is dormant today (submit() forces the text path); this is the gate
 * that must hold before re-enabling it. Pinned in `sendGuards.test.ts`.
 */
export { paintCoversReplacements } from "@openmasq/redact/pdf-redact";

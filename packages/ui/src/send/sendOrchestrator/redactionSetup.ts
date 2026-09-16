import {
  applyVault,
  computeTokenFormulas,
  disabledVaultTokens,
  type RedactionMatch,
  type Vault,
  unredactArgs,
  unredactReply,
} from "@openmasq/redact";
import { levelOf, notorietyForLevel } from "../../privacy/privacyLevel";
import { RedactionUnavailableError } from "../../state/errors";
import { buildFoldedPayload } from "../foldPayload";
import { redactNumbersOn } from "../redactNumbers";
import { mintRedactionKey } from "../redactionKey";
import {
  avoidBlob,
  buildSendEngineContext,
  convKindsFromSpans,
  disabledKindsOf,
  effectiveRedactCategories,
  type SendEngineContext,
  sendForcedList,
  sendKeepList,
} from "../redactionOptions";
import { deriveRedactedSpans } from "../sendAnalytics";
import { combinedVaultTerms } from "../vaultTerms";
import { type CompleteFn, type DetectLocalFn, makeCompleteFn, makeDetectLocalFn } from "./detectors";
import type { TurnContext } from "./turnSetup";

export type Wire = { text: string; matches: unknown[]; modelError?: string };

/** Everything the redaction passes, the history build and the dispatch share for ONE send. */
export interface RedactionSetup {
  /** The conversation vault, mutated in place by every pass and every tool result. */
  vault: Vault;
  redactionSalt: number;
  redactionKey: string;
  redactionMode: "fake" | "token";
  useLocal: boolean;
  /** An AI-grade free-form detector ran: gates the numbers toggle, the fail-closed check, analytics. */
  useAiDetect: boolean;
  extraSecrets: string[];
  completeFn: CompleteFn | undefined;
  detectLocalFn: DetectLocalFn | undefined;
  /** Frozen at send entry and MUTATED in place by the reveal gate; governs the MODEL's view only (rule 11). */
  disabledKinds: string[];
  commercialNotoriety: boolean;
  peopleNotoriety: boolean;
  /** value → kind learned across this conversation before this message. */
  convKinds: Record<string, string>;
  /** Kinds found by the mémoire and document-layer passes: they belong to no message, so they are collected here. */
  extraKinds: Record<string, string>;
  recordKinds: (matches: RedactionMatch[] | undefined) => void;
  wireExclude: Set<string>;
  toWire: (s: string) => { text: string; matches: unknown[] };
  /** Display-side un-redaction, formulas computed back when numbers are tokenised. */
  fromWire: (s: string) => string;
  /** Same, URL/args-aware, for the write-confirmation display. */
  fromWireArgs: (s: string) => string;
  numberMode: () => boolean;
  folded: ReturnType<typeof buildFoldedPayload>;
  forcedList: ReturnType<typeof sendForcedList>;
  keepList: ReturnType<typeof sendKeepList>;
  engineCtx: SendEngineContext;
}

/**
 * Prepares the reversible redaction for this send: the per-conversation seed, the
 * detectors, the effective categories, and the wire helpers. The model only ever sees
 * scrubbed text; the vault restores the reply. Returns null when the turn was refused.
 */
export function setupRedaction(ctx: TurnContext): RedactionSetup {
  const { d, conv, opts, text, attachments, modelPrefix, dbg, failTurn } = ctx;
  const { host, settings } = d;

  // The host's capability decides the engine, never a persisted preference: a stale
  // "patterns" would pin a user to the regex floor for good, unwarned and with no UI.
  const useLocal = !!host.detectLocalPii;
  const useAiDetect = useLocal;
  // API keys are scrubbed in main and the regex rules catch key-shaped strings.
  const extraSecrets: string[] = [];
  const vault: Vault = { ...(conv.redactionVault ?? {}) };

  // FAIL CLOSED on a missing CSPRNG: a constant salt would be a public, invertible
  // mapping. `failTurn` first so the visible bubble resolves; the throw unwinds the send.
  const needsMint = conv.redactionSalt == null || conv.redactionKey == null;
  if (needsMint && typeof globalThis.crypto?.getRandomValues !== "function") {
    const reason = "générateur aléatoire indisponible (clé de redaction)";
    failTurn(new RedactionUnavailableError(reason).message);
    throw new RedactionUnavailableError(reason);
  }
  // Salt, key and mode are pinned on the CONVERSATION at its first redaction: a value keeps
  // its fake here and maps differently elsewhere; switching mode mid-way would replay a
  // history mixing both forms. Values already vaulted keep their old fakes.
  const redactionSalt =
    conv.redactionSalt ?? ((globalThis.crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff) || 1);
  const redactionKey = conv.redactionKey ?? mintRedactionKey();
  const redactionMode: "fake" | "token" = conv.redactionMode ?? (settings.redactWireTokens ? "token" : "fake");
  // A file sent as redacted IMAGES is not folded into the wire, so its pairs join the vault here.
  if (opts.fileVault) Object.assign(vault, opts.fileVault);

  const completeFn = makeCompleteFn(host, settings, dbg);
  const detectLocalFn = makeDetectLocalFn(host, dbg);

  // Global defaults ⊕ the conversation's override ⊕ the org's mandated categories (forced ON).
  const orgForced = d.orgProfileRef.current?.forcedCategories;
  const effectiveCategories = effectiveRedactCategories(settings.redactCategories, conv.redactCategories, orgForced);
  const disabledKinds = disabledKindsOf(effectiveCategories);
  // Every level except Strict leaves famous brands and people in clear (`privacy/privacyLevel.ts`).
  const { commercial: commercialNotoriety, people: peopleNotoriety } = notorietyForLevel(
    levelOf(effectiveCategories, orgForced),
  );

  const convKinds = convKindsFromSpans(conv);
  const extraKinds: Record<string, string> = {};
  const recordKinds = (matches: RedactionMatch[] | undefined): void => {
    for (const sp of deriveRedactedSpans(matches ?? [])) extraKinds[sp.value] = sp.kind;
  };

  // A newly-minted fake must not reuse a real word already present in the conversation.
  const avoidList = avoidBlob(conv);
  // Vault entries NOT re-applied because their category is turned off.
  const wireExclude = disabledVaultTokens(vault, {
    numbers: redactNumbersOn(settings),
    disabledKinds,
    kinds: convKinds,
  });

  const toWire = (s: string) => ({ text: applyVault(s, vault, wireExclude), matches: [] as unknown[] });
  // LAZY: salary amounts mint n-tokens independently of `redactNumbers`, and the first one
  // can be minted by THIS send's redaction, so a boolean snapshot would miss it.
  const numberMode = (): boolean =>
    (useAiDetect && redactNumbersOn(settings)) || Object.keys(vault).some((k) => /^n\d+$/.test(k));
  // `unredactReply` also repairs a fake MUTATED by the model: display only, never the args.
  const fromWire = (s: string) =>
    numberMode() ? unredactReply(computeTokenFormulas(s, vault), vault) : unredactReply(s, vault);
  // A fake in a URL query is `+`/`%20`-encoded; `unredactArgs` restores those forms too.
  const fromWireArgs = (s: string) =>
    numberMode() ? unredactArgs(computeTokenFormulas(s, vault), vault) : unredactArgs(s, vault);

  // Attached files' text goes into the MODEL payload only; the folded text is redacted
  // below like any other text and the reused docs' fake→real pairs are pre-loaded so
  // `applyVault` and the typed-text detector share the same fakes.
  const folded = buildFoldedPayload(text, attachments, opts, modelPrefix);
  Object.assign(vault, folded.vaultPreload);

  // `forcedList` is computed BEFORE `keepList`: the keep list needs it to drop an automatic
  // connector name that collides with a Coffre term (`sendKeepList`).
  const forcedList = sendForcedList(combinedVaultTerms(settings), conv, opts.forcedRedactions, folded.modelText);
  const keepList = sendKeepList(d.keepListRef.current, conv, opts.keepValues, forcedList);
  const engineCtx = buildSendEngineContext({
    disabledKinds,
    keep: keepList,
    connected: d.keepListRef.current,
    unrevealableCategories: orgForced,
    avoid: avoidList,
    kinds: convKinds,
    salt: redactionSalt,
    key: redactionKey,
    mode: redactionMode,
    commercialNotoriety,
    peopleNotoriety,
  });

  return {
    vault,
    redactionSalt,
    redactionKey,
    redactionMode,
    useLocal,
    useAiDetect,
    extraSecrets,
    completeFn,
    detectLocalFn,
    disabledKinds,
    commercialNotoriety,
    peopleNotoriety,
    convKinds,
    extraKinds,
    recordKinds,
    wireExclude,
    toWire,
    fromWire,
    fromWireArgs,
    numberMode,
    folded,
    forcedList,
    keepList,
    engineCtx,
  };
}

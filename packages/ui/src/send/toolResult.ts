import {
  pseudonymize,
  redactionCategory,
  batchRedact,
  type Vault,
  type RedactionMatch,
  type CompleteFn,
  type Detection,
} from "@openmasq/redact";
import { remoteRedact, remoteContractDowngrade, DEFAULT_REDACT_FN_URL } from "@openmasq/redact/remote";
import { redactNumbersOn } from "./redactNumbers";
import { findConnector } from "@openmasq/catalog/mcp";
import { isBrowserTool, isWebBrowseTool } from "../state/browserPolicy";
import { toolClearKinds } from "../agent/toolRedactionPolicy";
import { toolResultKeep } from "./toolResultKeep";
import { clipFileText } from "./foldPayload";
import { makeScreenInbound } from "./screenInbound";
import { summarizeMatches, engineLabel, tracedRedact } from "./redactSummary";
import type { Host } from "../host";
import type { Settings } from "../types";
import type { SendEngineContext } from "./redactionOptions";

/** The component captures the tool-result redactor needs — threaded in so this
 *  security-critical redaction (a MAJOR leak surface: Gmail/CRM/Drive payloads) is
 *  unit-testable outside the sendMessage closure. */
export interface RedactToolResultDeps {
  /** THIS SEND's engine context (`SendEngineContext`) — the same options as the
   *  message, so a value is treated the same across every pass of the turn.
   *  ⚠️ The store REPLACES `kinds` in it with the turn's `turnKinds` (freshly-vaulted
   *  spans included): without them, on a first message, the redactor doesn't know
   *  that a vault value is (say) a company — neither a disabled category,
   *  nor the BROWSER/SEARCH clear policy, nor a reveal mid-send can
   *  then stop its fake being replayed. `evals/navigation.test.ts`. */
  engine: SendEngineContext;
  useRemote: boolean;
  useAiDetect: boolean;
  useModel: boolean;
  useLocal: boolean;
  settings: Settings;
  host: Host;
  extraSecrets: string[];
  /** User-FORCED redactions for TOOL RESULTS: the full Coffre ⊕ the conversation's
   *  persisted set, UNFILTERED (unlike the user-message `forcedList`, which keeps only
   *  values present in `modelText`). The Coffre's contract is "toujours redacted,
   *  quelle que soit la source" — a Coffre value the user never typed that surfaces in
   *  a Gmail/CRM result must still be masked; a value absent from a result is a no-op
   *  at the engine. */
  forced: { value: string; category: string }[];
  /** The MÉMOIRE entities (cards + aliases) — forced ONLY for `memory_search`'s
   *  result: a card is KNOWN PII, its protection must never
   *  depend on detection (the regex engine doesn't see a free-form name). Scoped to this
   *  one tool: a WEB SEARCH result keeps the SEARCH_CLEAR policy (the public name
   *  in clear is the substance of the answer). */
  memorySearchForced?: { value: string; category: string }[];
  /** THIS send's wire's USER turns (post-redaction) — the source of the
   *  "already in clear" harvest (`toolResultKeep.ts` `wireClearKeep`). */
  wireUserTexts?: string[];
  completeFn: CompleteFn | undefined;
  detectLocalFn: ((t: string) => Promise<Detection[]>) | undefined;
  /** value → fine category, MUTATED as tool-result values are redacted (drives the Debug
   *  Log + the audit colours). */
  toolKinds: Record<string, string>;
  /** Conversation this send belongs to — scopes the tool-result Debug-Log entries. */
  convId?: string;
}

const MAX_TOOL_RESULT_CHARS = 16000;
// The agent-browser accessibility snapshot is the pathological case (35k+ chars) AND the
// one that blocks the redaction NER the most; cap a BROWSER result tighter. Others keep 16k.
const MAX_BROWSER_TOOL_RESULT_CHARS = 8000;

/** Cap a tool result BEFORE any redaction/replay. Shared by the full path below AND the
 *  browser clear-mode replay (`agent/navClearRedact.ts`) so the two caps cannot drift
 *  (root rule 9) — the KEPT text is what gets processed, the dropped tail never reaches
 *  the model either way. */
export function capToolResultText(rawText: string, tool?: string): string {
  const cap = tool && isBrowserTool(tool) ? MAX_BROWSER_TOOL_RESULT_CHARS : MAX_TOOL_RESULT_CHARS;
  // Line-boundary clip (`clipFileText`, rule 9): a raw slice halved the boundary line's
  // value, the redactor then failed to recognise the fragment, and it shipped in clear.
  return rawText.length > cap
    ? clipFileText(rawText, cap) + "\n\n[… résultat tronqué pour la performance]"
    : rawText;
}

/** The category-clear policy for a tool's RESULTS, resolved onto a base `disabledKinds`.
 *  Public web-search connectors keep place/org names + URL/asset path & CDN key-noise in
 *  clear; the BROWSER keeps only place/org (it can read an AUTHENTICATED page, so
 *  secret/apikey/path stay REDACTED). Keyed off the tool-name connector prefix. Shared by
 *  the full redaction path below AND the clear-mode replay (`agent/navClearRedact.ts`),
 *  so the two views of "what may stay clear for this tool" cannot drift (root rule 9). */
export function disabledKindsForTool(disabledKinds: string[], tool?: string): string[] {
  if (!tool) return disabledKinds;
  const px = tool.indexOf("__");
  const connectorId = px > 0 ? tool.slice(0, px) : tool;
  const clear = toolClearKinds(
    connectorId,
    findConnector(connectorId)?.category === "search",
    isWebBrowseTool(tool),
  );
  return clear.length ? [...disabledKinds, ...clear] : disabledKinds;
}

/**
 * Build the tool-RESULT redactor (real server reply → fakes for the model) bound to a
 * send's redaction context. FAIL-CLOSED on every path: a remote engine that can't redact
 * (no token / threw) and an AI detector that degraded to regex are BOTH replaced by an
 * opaque placeholder — a tool result is exactly where free-form PII concentrates, so
 * regex-only would leak names/orgs (audit H-4/M-10). A public web-search connector keeps
 * place/org (and URL/asset path + CDN key-noise) in clear; the browser keeps only
 * place/org (an authenticated page's real credentials stay redacted). Returns the wrapped
 * fn (the inner redaction + a Debug-Log entry).
 */
/** Callable per result, plus `many` — N results from the SAME tool in ONE engine pass. */
export interface ToolResultRedactor {
  (text: string, v: Vault, tool?: string): Promise<string>;
  many: (texts: string[], v: Vault, tool?: string) => Promise<string[]>;
}

export function makeRedactToolResult(deps: RedactToolResultDeps): ToolResultRedactor {
  const {
    engine,
    useRemote,
    useAiDetect,
    useModel,
    useLocal,
    settings,
    host,
    extraSecrets,
    forced,
    completeFn,
    detectLocalFn,
    toolKinds,
    convId,
  } = deps;

  // ONE pass's state for the log summary (tier A: counts/enums, never a
  // value). Written by `recordKinds` and the masked paths, read by `tail()` after the
  // pass — safe because engine passes are STRICTLY SERIAL (the
  // `agent/redactCoalesce.ts` coalescer serialises them; it's also the vault's invariant).
  const pass = { matches: [] as RedactionMatch[], masked: false };
  const passTail = () =>
    pass.masked ? "masqué (fail-closed)" : summarizeMatches(pass.matches);
  const engLabel = engineLabel(useRemote, useModel, useLocal);

  const recordKinds = (matches: readonly RedactionMatch[]) => {
    pass.matches.push(...matches);
    for (const m of matches) if (m.value) toolKinds[m.value] = redactionCategory(m.category ?? m.type);
  };

  const disabledForTool = (tool?: string): string[] => disabledKindsForTool(engine.disabledKinds, tool);

  const redactToolResultInner = async (
    rawText: string,
    v: Vault,
    tool?: string,
    // `many` has ALREADY capped text by text — re-capping the joined blob would truncate the rest.
    precapped = false,
  ): Promise<string> => {
    // Cap a huge tool result before redaction (a browser a11y snapshot is 35k+ chars; the
    // KEPT text is still FULLY redacted, the dropped tail never reaches the model).
    const text = precapped ? rawText : capToolResultText(rawText, tool);
    const dk = disabledForTool(tool);
    // `memory_search`: the cards' entities join the forced list — see the dep's doc.
    const effForced = tool === "memory_search" ? [...forced, ...(deps.memorySearchForced ?? [])] : forced;
    // Per-tool SHAPE keep-lists (run_python frameworks / discovery ids) + the wire-clear
    // coherence guard — each layer's rationale and fail-closed guards: `toolResultKeep.ts`.
    const keep = toolResultKeep(tool, text, {
      engineKeep: engine.keep,
      vaultValues: Object.values(v),
      wireUserTexts: deps.wireUserTexts ?? [],
      protectedValues: [...effForced.map((f) => f.value), ...extraSecrets],
    });
    if (useRemote) {
      const rurl = settings.redactFnUrl?.trim() || host.redactFnUrl || DEFAULT_REDACT_FN_URL;
      // Token per-call: a mid-conversation session refresh must not pin us to an expired one.
      const rtok = host.auth?.getAccessToken ? await host.auth.getAccessToken().catch(() => null) : null;
      if (rtok) {
        try {
          const rr = await remoteRedact(
            {
              text,
              vault: v,
              // Fail-safe mirror of the user-message path: the forced VALUES also ride
              // as `secrets` (always honoured) so a Coffre value is never in clear even
              // before a gateway that understands categorised `forced`.
              secrets: [...extraSecrets, ...effForced.map((f) => f.value)],
              forced: effForced,
              ...engine,
              // The per-tool clear + the shape keeps (framework/discovery) replace
              // the context's values — the ONLY divergences intended from the message.
              disabledKinds: dk,
              keep,
              numbers: redactNumbersOn(settings),
              model: settings.redactRemoteModel,
            },
            { url: rurl, token: rtok },
          );
          // Contract HANDSHAKE: if the server ignored an option whose ignorance
          // leaks (Strict → celebrities), mask — never return the under-redacted text.
          const down = remoteContractDowngrade(engine, rr.honored);
          if (down) {
            pass.masked = true;
            return `[Résultat de l'outil masqué — ${down}.]`;
          }
          Object.assign(v, rr.vault); // thread server vault so the reply un-redacts
          recordKinds(rr.matches);
          return rr.redacted;
        } catch {
          /* fail closed below — never regex-downgrade a high-PII tool result */
        }
      }
      // FAIL CLOSED (audit H-4): the REMOTE engine couldn't redact — never fall through to
      // regex-only pseudonymize. One mask, no « changez de moteur » (dead setting) — its test.
      pass.masked = true;
      return "[Résultat de l'outil masqué : le redaction a échoué, rien n'est parti en clair. Réessayez.]";
    }
    const res = await pseudonymize(text, {
      vault: v,
      secrets: extraSecrets,
      forced: effForced,
      numbers: useAiDetect ? redactNumbersOn(settings) : false,
      complete: useModel ? completeFn : undefined,
      detectLocal: useLocal ? detectLocalFn : undefined,
      ...engine,
      // Same two intended divergences as the remote path above. `reFakeExisting`
      // stays ABSENT on purpose: a tool result is an echo, never content
      // the user just wrote (the anti-recomposition guard stays armed).
      disabledKinds: dk,
      keep,
    });
    // FAIL CLOSED (audit H-4/M-10): an AI engine was expected but its detector THREW →
    // pseudonymize degraded to regex-only; mask it rather than leak names/orgs.
    if ((useModel || useLocal) && res.modelError) {
      pass.masked = true;
      return "[Résultat de l'outil masqué : le redaction a échoué, rien n'est parti en clair. Réessayez.]";
    }
    recordKinds(res.matches);
    return res.text;
  };

  // The inbound screener (provenance label + tier-1/tier-2) — its façade moved to
  // `screenInbound.ts`; `inboundScreen.ts` keeps the pure primitives.
  const screenInbound = makeScreenInbound({ completeFn, isWebTool: isWebBrowseTool, convId });

  // The tool-RESULT redaction gets its OWN, unambiguously named Debug-Log entry (it runs
  // AFTER the server returns; the outgoing args are un-redacted by the client, not here).
  // The entry's `result` carries the pass summary (counts by category — tier A).
  const one = (text: string, v: Vault, tool?: string): Promise<string> => {
    pass.matches = [];
    pass.masked = false;
    return tracedRedact(
      {
        name: "redaction · résultat outil → modèle",
        convId,
        args: `${text.length} car. · moteur ${engLabel}`,
        tail: passTail,
      },
      async () => {
        const redacted = await redactToolResultInner(text, v, tool);
        // Inbound screening runs on the REDACTED text — the screener sees exactly what the
        // model will, so it costs no new egress (`inboundScreen.ts`). It LABELS, never
        // blocks: a false positive would silently amputate a legitimate result.
        return screenInbound(redacted, tool);
      },
    );
  };

  /** N results from the SAME tool → ONE engine pass (`batchRedact`): each text is capped
   *  individually, the joined blob is redacted once (the shape keeps harvest
   *  the union — same tool REQUIRED, per-connector policy must not mix), then
   *  each part is screened separately. Sentinel lost ⇒ falls back to per-text in
   *  `batchRedact`; fail-closed unchanged (a mask breaks the sentinel ⇒ each text
   *  goes through alone and comes out masked alone). */
  const many = (texts: string[], v: Vault, tool?: string): Promise<string[]> => {
    pass.matches = [];
    pass.masked = false;
    const capped = texts.map((t) => capToolResultText(t, tool));
    return tracedRedact(
      {
        name: "redaction · résultats outil → modèle (lot)",
        convId,
        args: `${texts.length} résultats · moteur ${engLabel}`,
        tail: passTail,
      },
      async () => {
        const parts = await batchRedact(capped, (blob) => redactToolResultInner(blob, v, tool, true));
        return Promise.all(parts.map((part) => screenInbound(part, tool)));
      },
    );
  };

  return Object.assign(one, { many });
}

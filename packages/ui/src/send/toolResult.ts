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
import { toolClearKinds, pythonFrameworkKeep, toolDiscoveryKeep } from "../agent/toolRedactionPolicy";
import { makeScreenInbound } from "./screenInbound";
import { summarizeMatches, engineLabel, tracedRedact } from "./redactSummary";
import type { Host } from "../host";
import type { Settings } from "../types";
import type { SendEngineContext } from "./redactionOptions";

/** The component captures the tool-result redactor needs — threaded in so this
 *  security-critical redaction (a MAJOR leak surface: Gmail/CRM/Drive payloads) is
 *  unit-testable outside the sendMessage closure. */
export interface RedactToolResultDeps {
  /** Le contexte moteur DE L'ENVOI (`SendEngineContext`) — les mêmes options que le
   *  message, pour qu'une valeur soit traitée pareil sur toutes les passes du tour.
   *  ⚠️ Le store y REMPLACE `kinds` par le `turnKinds` du tour (spans fraîchement
   *  redacted compris) : sans eux, sur un premier message, le redacteur ne sait pas
   *  qu'une valeur du vault est (p. ex.) une entreprise — ni une catégorie désactivée,
   *  ni la politique clear BROWSER/SEARCH, ni un reveal en cours d'envoi ne peuvent
   *  alors empêcher le replay de son faux. `evals/navigation.test.ts`. */
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
  /** Les entités de la MÉMOIRE (cartes + alias) — forcées UNIQUEMENT pour le résultat
   *  de `memory_search` : une carte est du PII CONNU, sa protection ne doit jamais
   *  dépendre d'une détection (le moteur regex ne voit pas un nom libre). Scopé à ce
   *  seul outil : un résultat de RECHERCHE WEB garde la politique SEARCH_CLEAR (le nom
   *  public en clair est la substance de la réponse). */
  memorySearchForced?: { value: string; category: string }[];
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
  return rawText.length > cap
    ? rawText.slice(0, cap) + "\n\n[… résultat tronqué pour la performance]"
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
/** Appelable par résultat, plus `many` — N résultats du MÊME outil en UNE passe moteur. */
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

  // L'état d'UNE passe pour le résumé du journal (étage A : comptes/enums, jamais une
  // valeur). Écrit par `recordKinds` et les chemins masqués, lu par `tail()` après la
  // passe — sûr parce que les passes moteur sont STRICTEMENT SÉRIELLES (le coalesceur
  // `agent/redactCoalesce.ts` les sérialise ; c'est aussi l'invariant du vault).
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
    // `many` a DÉJÀ cappé texte par texte — recapper le blob joint tronquerait la suite.
    precapped = false,
  ): Promise<string> => {
    // Cap a huge tool result before redaction (a browser a11y snapshot is 35k+ chars; the
    // KEPT text is still FULLY redacted, the dropped tail never reaches the model).
    const text = precapped ? rawText : capToolResultText(rawText, tool);
    const dk = disabledForTool(tool);
    // `memory_search` : les entités des cartes rejoignent le forced — voir la doc du dep.
    const effForced = tool === "memory_search" ? [...forced, ...(deps.memorySearchForced ?? [])] : forced;
    // A `run_python` stdout/traceback is full of PUBLIC library + module identifiers
    // (numpy/scipy/matplotlib + submodules from site-packages paths) the detector
    // mis-flags as org/secret/apikey — vaulting them corrupts the NEXT run's code (the
    // model receives `<fake>` instead of `numpy`) AND, via `toWire`, every later tool
    // call. Keep those specific framework tokens in clear (leak-safe — real PII the code
    // prints is NOT in this list, so it's still redacted; see pythonFrameworkKeep).
    // The VAULT's real values are passed so the harvest can never spare one: the code runs
    // UN-REDACTED, so an injected `print("site-packages/<fake>")` puts the REAL value on
    // stdout, and sparing it would hand the model a fake→real oracle.
    // A run_python result keeps framework identifiers in clear; every OTHER tool
    // result keeps tool-DISCOVERY metadata (API tool names / tech terms) in clear —
    // only when the result IS discovery-shaped, only API-identifier shapes, never a
    // vault-real value (see toolDiscoveryKeep). This is what stops the NER from
    // vaulting `execute-sql → jade-tom` and derailing a meta-tool's discovery loop.
    const keep =
      tool === "run_python"
        ? [...engine.keep, ...pythonFrameworkKeep(text, Object.values(v))]
        : [...engine.keep, ...toolDiscoveryKeep(text, Object.values(v))];
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
              // Le clear par outil + les keep de forme (framework/discovery) remplacent
              // les valeurs du contexte — les SEULES divergences voulues avec le message.
              disabledKinds: dk,
              keep,
              numbers: redactNumbersOn(settings),
              model: settings.redactRemoteModel,
            },
            { url: rurl, token: rtok },
          );
          // HANDSHAKE de contrat : si le serveur a ignoré une option dont l'ignorance
          // fuit (Strict → personnalités), masquer — jamais retourner le sous-redacted.
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
      // Mêmes deux divergences voulues que le chemin remote ci-dessus. `reFakeExisting`
      // reste ABSENT à dessein : un résultat d'outil est un écho, jamais du contenu
      // que l'utilisateur vient d'écrire (le garde anti-recomposition reste armé).
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
  // The entry's `result` carries the pass summary (counts by category — étage A).
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

  /** N résultats du MÊME outil → UNE passe moteur (`batchRedact`) : chaque texte est cappé
   *  individuellement, le blob joint est redacted une fois (les keep de forme moissonnent
   *  l'union — même outil EXIGÉ, la politique par connecteur ne peut pas se mélanger), puis
   *  chaque partie est screenée séparément. Sentinel perdu ⇒ retombée par-texte dans
   *  `batchRedact` ; fail-closed inchangé (un masque casse le sentinel ⇒ chaque texte
   *  repasse seul et ressort masqué seul). */
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

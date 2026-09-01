import {
  replayVault,
  containsCredentialShaped,
  variantOccurrences,
  disabledVaultTokens,
  detectHostedUrlSpans,
  detectUrlSpans,
  urlOccurrenceGuard,
  redactionCategory,
  URL_EXEMPT_KINDS,
  type Vault,
} from "@openmasq/redact";
import { capToolResultText, disabledKindsForTool } from "../send/toolResult";
import { labelInbound, prescreen } from "../send/inboundScreen";
import { pushDebug } from "../state/debug";

/**
 * The CLEAR-MODE result redactor for a governed web tool whose call touches no
 * redacted data (`navCarriesRedactedData` said no): public page content reaches the
 * model UNDETECTED — only a REPLAY of what the conversation already redacted
 * (`replayVault`) — so a news summary is no longer distorted by masked third-party
 * names. The replayed vault honours the SAME per-tool clear policy as the full path
 * (`disabledKindsForTool`: `BROWSER_CLEAR`/`SEARCH_CLEAR` + the user's own
 * disabled/revealed categories, read LIVE from the mutated `disabledKinds` array) —
 * clear-mode must never re-mask what the full path deliberately keeps in clear.
 * An entry whose category cannot be PROVEN is still replayed (`disabledVaultTokens`
 * fails closed: over-masking costs fidelity, under-masking costs privacy).
 *
 * The relaxation is bounded by two FAIL-CLOSED escalations back to the full engine,
 * because the agent browser can sit on an AUTHENTICATED page:
 *
 * - a Coffre/forced value NOT yet in the vault appears in the result — the Coffre's
 *   contract is "always redacted" and minting its fake needs the engine;
 * - a credential-shaped span appears (`containsCredentialShaped`, the distinctive
 *   `secret` rules) — a PAT page / cloud console must never hand the model a real key.
 *
 * Any error while deciding ALSO escalates (never falls through to clear). The residual
 * this accepts, stated plainly: on a private page, free-form PII that is neither
 * vaulted, in the Coffre, nor credential-shaped passes to the model in clear — the
 * mode only exists for calls the conversation's own data never touched, and the
 * outward leg is unchanged. `navClearRedact.test.ts` pins every direction.
 */
export function makeNavClearRedactor(opts: {
  /** The FULL fail-closed redactor (detection + vault) — the escalation target. */
  full: (text: string, vault: Vault, tool?: string) => Promise<string> | string;
  /** Values ALWAYS redacted (the Coffre + forced) — an un-vaulted hit escalates. */
  secrets: readonly string[];
  /** The send's disabled categories — the LIVE array the reveal gate mutates. */
  disabledKinds: string[];
  /** value → category map (this send's spans included), so the per-tool clear
   *  policy can prove which vault entries it may leave un-replayed. */
  kinds?: Record<string, string>;
  /** The domains of the connected integrations — see `send/redactKeep.ts`
   *  `connectedUrlHosts`. Their links keep their structure even in Strict. */
  structuralUrlHosts?: string[];
  /** Called once per ESCALATED result (counts-only analytics hook — the reason
   *  stays in the journal entry, never in the callback). */
  onEscalate?: () => void;
  /** The conversation — scopes this redactor's Debug-Log entries per conversation. */
  convId?: string;
}): (text: string, vault: Vault, tool?: string) => Promise<string> {
  return async (rawText, vault, tool) => {
    let escalate = true; // fail closed: only an explicit "clean" verdict clears it
    let why = "erreur pendant la décision"; // journal: WHY the full engine ran
    try {
      const text = capToolResultText(rawText, tool);
      const vaultedReals = new Set(Object.values(vault).map((v) => v.trim().toLowerCase()));
      // A secret already in the vault is REPLAYED to its stable fake below — only a
      // value the engine has never faked needs the full path to mint one.
      const unvaulted = opts.secrets.filter((s) => {
        const t = s.trim();
        return t.length >= 2 && !vaultedReals.has(t.toLowerCase());
      });
      const vaultHit = unvaulted.some((s) => variantOccurrences(text, s.trim()).length > 0);
      const credHit = !vaultHit && containsCredentialShaped(text);
      escalate = vaultHit || credHit;
      why = vaultHit
        ? "valeur du Coffre (hors vault) présente dans la page"
        : "token en forme de credential dans la page";
      if (!escalate) {
        // Same clear policy as the full path: drop the entries whose category this
        // tool deliberately keeps in clear (org/place on a page are the answer's
        // substance) or that the user disabled/revealed for the conversation.
        const excluded = disabledVaultTokens(vault, {
          disabledKinds: disabledKindsForTool(opts.disabledKinds, tool),
          kinds: opts.kinds,
        });
        let replayed: Vault = vault;
        if (excluded.size) {
          replayed = {};
          for (const [t, v] of Object.entries(vault)) if (!excluded.has(t)) replayed[t] = v;
        }
        // The replay does not rewrite the INSIDE of a URL (`urlOccurrenceGuard`): here
        // the case/separator tolerance made it doubly destructive on the
        // page's links. Same trade-off as elsewhere — the guard never applies
        // to `URL_EXEMPT_KINDS` (key, PAN/IBAN, email, phone), and a category
        // that can't be proven stays substituted (fail closed).
        const urlSpans = [
          ...(opts.disabledKinds.includes("url") ? detectUrlSpans(text) : []),
          ...detectHostedUrlSpans(text, opts.structuralUrlHosts ?? []),
        ];
        const urlGuard = urlOccurrenceGuard(urlSpans, (value) => {
          const k = opts.kinds?.[value];
          return k === undefined || URL_EXEMPT_KINDS.has(redactionCategory(k));
        });
        const out = replayVault(text, replayed, urlGuard);
        const replayedCount = Object.keys(replayed).length;
        pushDebug(
          {
            type: "tool",
            name: "redaction dynamique · résultat web transmis en clair (replay du vault seul)",
            ok: true,
            args: `${text.length} car. · appel sans donnée redacted`,
            result: `${
              out === text
                ? `aucune valeur du vault dans la page (${replayedCount} surveillée${replayedCount > 1 ? "s" : ""})`
                : `valeurs du vault replayées en fakes`
            }${excluded.size ? ` · ${excluded.size} entrée(s) laissée(s) en clair (politique ${tool && tool.includes("browser") ? "BROWSER_CLEAR" : "SEARCH_CLEAR"}/révélations)` : ""}`,
          },
          opts.convId,
        );
        // The clear path is a PUBLIC web page — the classic injection carrier — and it
        // never reaches `full`, so it would otherwise be the one result nothing labels.
        // Tier 1 only here: no model call on a path whose whole point is being cheap.
        const tier1 = prescreen(out);
        return labelInbound(
          "web",
          out,
          tier1.flagged
            ? { decision: "suspect", reason: tier1.reasons.join(", "), unscreened: true }
            : { decision: "safe" },
        );
      }
    } catch (e) {
      escalate = true;
      // The CAUSE TRAVELS with the verdict: « erreur pendant la décision » alone made an
      // undefined deref, a malformed URL and a vault-shape bug indistinguishable
      // — on the hot path of every governed web call (audit 13/08).
      why = `erreur pendant la décision : ${e instanceof Error ? e.message : String(e)}`;
    }
    try {
      opts.onEscalate?.();
    } catch {
      /* analytics only — never affects the redaction path */
    }
    pushDebug(
      {
        type: "tool",
        name: "redaction dynamique · escalade vers le redaction complet",
        ok: true,
        args: `${rawText.length} car.`,
        result: `raison : ${why} (fail-closed)`,
      },
      opts.convId,
    );
    // The full path re-caps from the RAW text (its cap is the same helper).
    return await opts.full(rawText, vault, tool);
  };
}

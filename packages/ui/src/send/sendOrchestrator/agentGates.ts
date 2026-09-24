import { disabledVaultTokens, unredact, type Vault } from "@openmasq/redact";
import type { McpAgentParams } from "../../agent/mcpAgent";
import { webNavOfferableCategories, webNavRevealSet } from "../../state/browserPolicy/webNavReveal";
import { redactNumbersOn } from "../redactNumbers";
import type { RedactedTurn } from "./redactionPasses";
import type { RedactionSetup } from "./redactionSetup";
import type { TurnContext } from "./turnSetup";
import type { Routing } from "./platformGate";

/** The narrator resolves to "" on any failure so it never blocks or breaks the loop. */
const TOOL_SUMMARY_TIMEOUT_MS = 6000;

/**
 * Live tool-call narration: a small parallel call on the turn's OWN provider/creds turns
 * each tool call into a one-line status. WIRE-SAFE: it sees the same redacted fakes the
 * main model did, and the sentence is un-redacted via `fromWire` before display.
 */
export function makeSummarizeToolCall(
  ctx: TurnContext,
  r: RedactionSetup,
  routing: Routing,
): NonNullable<McpAgentParams["summarizeToolCall"]> | undefined {
  const { d, model, provider } = ctx;
  const { host, settings, t } = d;
  if (!host.complete) return undefined;
  return async (info) => {
    let argsText: string;
    try {
      argsText = JSON.stringify(info.args).slice(0, 800);
    } catch {
      argsText = "{}";
    }
    try {
      const reply = await Promise.race([
        host.complete!({
          provider,
          model: model.id,
          apiKey: routing.effectivePlatform ? routing.platformToken : undefined,
          baseUrl: routing.effectivePlatform
            ? routing.platformBaseUrl
            : provider === "openai-compat"
              ? settings.openaiCompatBaseUrl
              : undefined,
          temperature: 0,
          messages: [
            { role: "system", content: t.agent.toolIntentSystem },
            { role: "user", content: `Outil : ${info.server} · ${info.tool}\nArguments : ${argsText}` },
          ],
        }),
        new Promise<string>((_, rej) =>
          setTimeout(() => rej(new Error("tool summary timed out")), TOOL_SUMMARY_TIMEOUT_MS),
        ),
      ]);
      return r.fromWire(reply).replace(/\s+/g, " ").trim().slice(0, 140);
    } catch {
      return "";
    }
  };
}

/**
 * Pre-search REVEAL gate: offer to stop redacting the categories that make a web answer
 * meaningless when faked. THIS SEND ONLY: the choice is not written to the conversation.
 * It changes what the MODEL sees; the query always carries the REAL value (rule 11).
 * The ONLY write is `disabledKinds`, mutated in place so the in-flight tool-result
 * redactor and the loop's client see it right away.
 */
export function makeConfirmWebNav(ctx: TurnContext, r: RedactionSetup): NonNullable<McpAgentParams["confirmWebNav"]> | undefined {
  const { d, opts, conv, convId } = ctx;
  if (!opts.reviewWebNav) return undefined;
  return async () => {
    // A pristine conversation has nothing to reveal; the card's warning would be false.
    if (!Object.keys(r.vault).length) return;
    const live = d.conversationsRef.current.find((c) => c.id === convId) ?? conv;
    const offerable = webNavOfferableCategories(live, d.settings, d.orgProfileRef.current?.forcedCategories ?? []);
    if (!offerable.length) return;
    const picked = await opts.reviewWebNav!(offerable, convId);
    // Re-filtered against `offerable`: the renderer is not a trust boundary (rule 7).
    const reveal = webNavRevealSet(picked, offerable);
    for (const k of reveal) if (!r.disabledKinds.includes(k)) r.disabledKinds.push(k);
  };
}

/**
 * Un-fake ONLY the tokens whose category is disabled NOW in an already-wired string, so a
 * reveal takes effect for the rest of THIS turn. `turnKinds`, not `convKinds`: on a first
 * message only it knows the fresh spans' categories.
 */
export function makeRewireWire(ctx: TurnContext, r: RedactionSetup, red: RedactedTurn): NonNullable<McpAgentParams["rewireWire"]> {
  return (s) => {
    const excl = disabledVaultTokens(r.vault, {
      numbers: redactNumbersOn(ctx.d.settings),
      disabledKinds: r.disabledKinds,
      kinds: red.turnKinds,
    });
    if (!excl.size) return s;
    const sub: Vault = {};
    for (const t of excl) sub[t] = r.vault[t];
    return unredact(s, sub);
  };
}

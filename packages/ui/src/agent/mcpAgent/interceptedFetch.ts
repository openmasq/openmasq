import type { WebFetchItem } from "../../host";
import { analyzeNavExfil, domainAllowed } from "../../state/browserPolicy";
import { fakeDerivedNavHost } from "../../state/browserPolicy/browserNavFake";
import { recordWebSearch } from "../confirmationFacts";
import { isAbortError, raceAbort } from "../mcpAgentAbort";
import { safeJson } from "../mcpAgentUtil";
import { toolStartNarration } from "../toolActionLabel";
import { MAX_CONSECUTIVE_DEAD } from "./budget";
import type { Step, ToolCall } from "./call";
import type { LoopCtx } from "./context";

/**
 * `web_fetch_many`, intercepted. Each URL is un-redacted (fake→real, encoded forms) so the
 * fetch hits the REAL page, then every returned string is re-redacted. The SAME URL backstops
 * as `browser_navigate` apply — but a read has no confirm card, so a flagged URL is DROPPED.
 */
export async function handleWebFetchMany(ctx: LoopCtx, call: ToolCall, args: Record<string, unknown>): Promise<Step> {
  const { p } = ctx;
  const rawUrls = Array.isArray(args.urls) ? args.urls.filter((u): u is string => typeof u === "string") : [];
  const reals = p.vault ? Object.values(p.vault) : [];
  const placeValues = p.kinds ? reals.filter((v) => p.kinds?.[v] === "location") : [];
  const accepted: string[] = [];
  const refused: { url: string; reason: string }[] = [];
  for (const raw of rawUrls) {
    const url = ctx.wireArg(raw);
    const navFake = fakeDerivedNavHost(url, p.vault ?? {});
    if (navFake) {
      refused.push({ url, reason: `domaine dérivé d'un pseudonyme (${navFake.host}) — pas le site réel` });
      continue;
    }
    if (p.browserAllowedDomains?.length && !domainAllowed(p.browserAllowedDomains, url)) {
      refused.push({ url, reason: "domaine hors de la liste autorisée" });
      continue;
    }
    if (analyzeNavExfil(url, reals, placeValues).suspicious) {
      refused.push({ url, reason: "URL porteuse de données de conversation (exfiltration bloquée)" });
      continue;
    }
    accepted.push(url);
  }
  p.onToolProgress?.(toolStartNarration("web_fetch_many", "web"));
  let items: WebFetchItem[] = [];
  if (accepted.length) {
    // An intercepted batch fetch is web ingress too — counted only when something leaves.
    if (p.convId) recordWebSearch(p.convId);
    try {
      items = await raceAbort(Promise.resolve(p.fetchMany!(accepted)), p.signal);
    } catch (e) {
      if (ctx.aborted() || isAbortError(e)) return ctx.finalizeAborted(), "stop";
      items = accepted.map((url) => ({ url, ok: false, error: "échec de récupération" }));
    }
  }
  if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
  const sections = [
    ...items.map((it) => (it.ok ? `## ${it.finalUrl ?? it.url}\n${it.text ?? ""}` : `## ${it.url}\n[échec : ${it.error ?? "inconnu"}]`)),
    ...refused.map((r) => `## ${r.url}\n[refusé : ${r.reason}]`),
  ];
  let content = sections.join("\n\n---\n\n") || "Aucune URL exploitable fournie.";
  // Untrusted web text: masked when no redactor is wired. The browser's clear-mode decision
  // applies first — a fetch carrying NO redacted data replays the vault instead of minting fakes.
  content = ctx.redactResult
    ? await (ctx.navClearOpts("web_fetch_many", args)?.redactText(content, p.vault) ?? ctx.redactResult(content, p.vault, "web_fetch_many"))
    : "(résultats masqués : redaction indisponible)";
  if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
  const okCount = items.filter((i) => i.ok).length;
  ctx.dbg({
    type: "tool", vault: p.vault, kinds: p.kinds, name: "web_fetch_many", ok: okCount > 0,
    args: safeJson(call.arguments), result: content,
    ...(okCount > 0 ? {} : { error: `${accepted.length} tentée(s), ${refused.length} refusée(s), 0 réussie(s)` }),
  });
  p.onToolResult?.({ tool: "web_fetch_many", server: "web", ok: okCount > 0, summary: `${okCount}/${accepted.length + refused.length} page(s)` });
  ctx.messages.push({ role: "tool", toolCallId: call.id, content });
  if (okCount > 0) ctx.st.deadStreak = 0;
  else if (ctx.bumpDead() >= MAX_CONSECUTIVE_DEAD) return ctx.finishExhausted(), "stop";
  return "next";
}

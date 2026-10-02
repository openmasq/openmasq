import type { Locale, Messages } from "@openmasq/i18n";
import { mainLocale, mainMessages } from "../i18n";
import type { WriteConfirmRequest } from "./writeConfirmWindow";

/**
 * The write-confirmation window's HTML builder — split out of `writeConfirmWindow.ts`
 * to keep it under the 300-LOC cap. Pure string building (args HTML-ESCAPED here, the
 * one XSS-relevant step); the window lifecycle + gates stay in `writeConfirmWindow.ts`.
 * `escapeHtml`/`argsSummary`/`argsLines` are helpers. The sentinel exit URLs live HERE
 * (they are written into the page's button hrefs); `writeConfirmWindow` imports them for
 * the `will-navigate` interception — one direction, no runtime cycle.
 */

/** The three sentinel exit URLs the page's buttons navigate to; main intercepts them via
 *  `will-navigate`. ⚠️ `ALLOW_TOOL_URL` shares `ALLOW_URL`'s prefix — match it FIRST. */
export const ALLOW_URL = "https://example.invalid/write-allow";
export const ALLOW_TOOL_URL = "https://example.invalid/write-allow-tool";
export const DENY_URL = "https://example.invalid/write-deny";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

type Copy = Messages["desktopMain"]["writeConfirm"];

/** A compact preview of the args so the user sees WHAT the action will do (escaped by the caller). */
function argsSummary(args: unknown, t: Copy): string {
  try {
    const s = JSON.stringify(args ?? {}, null, 1);
    if (!s || s === "{}" || s === "null") return t.noParams;
    return s.length > 900 ? s.slice(0, 900) + " …" : s;
  } catch {
    return t.paramsUnreadable;
  }
}

const clipLine = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** HUMAN lines for the window (mirrors the renderer's `describeWriteArgs` shapes —
 *  `actions[].label`, else top-level `key: value`) so the raw JSON is a collapsible
 *  detail, not the main content the user must decode. */
function argsLines(args: unknown): string[] {
  if (!args || typeof args !== "object") return [];
  const a = args as Record<string, unknown>;
  const lines: string[] = [];
  if (Array.isArray(a.actions)) {
    for (const act of a.actions) {
      if (!act || typeof act !== "object") continue;
      const label = (act as { label?: unknown }).label;
      if (typeof label === "string" && label.trim()) lines.push(clipLine(label.trim(), 90));
      else {
        const op = Object.keys(act as object).find((k) => k !== "label");
        if (op) lines.push(op.replace(/[_-]/g, " "));
      }
    }
  }
  if (lines.length === 0) {
    for (const [k, v] of Object.entries(a)) {
      if (k === "context" || k === "actions") continue;
      const val =
        typeof v === "string" ? ` : ${clipLine(v, 70)}` : typeof v === "number" || typeof v === "boolean" ? ` : ${v}` : "";
      lines.push(`${k.replace(/[_-]/g, " ")}${val}`);
      if (lines.length >= 6) break;
    }
  }
  return lines.slice(0, 8);
}

/** Branded confirmation page (near-white paper, forest-green ink, one lime CTA, SKY
 *  accent). All interpolated values are HTML-escaped, the catalogue's words included; the
 *  page has no capability beyond navigating to the sentinel URLs. The words follow main's
 *  language (`../i18n.ts`); `copy` overrides it for tests. */
export function buildHtml(req: WriteConfirmRequest, copy?: { locale: Locale; t: Copy }): string {
  const lang = copy?.locale ?? mainLocale();
  const c = copy?.t ?? mainMessages().desktopMain.writeConfirm;
  const e = escapeHtml;
  const disableGate = req.mode === "disable-gate";
  const leaveRenforce = req.mode === "leave-renforce";
  const gateChange = disableGate || leaveRenforce;
  const tool = escapeHtml(req.toolName);
  const summary = escapeHtml(argsSummary(req.args, c));
  // `disable-gate` asks to turn OFF confirmations for the session; `leave-renforce` asks
  // to leave the Mode renforcé (persisted); the write mode confirms ONE action. All exit
  // ONLY via the sentinel links (main intercepts them).
  const eyebrow = e(c.eyebrow);
  const title = e(leaveRenforce ? c.titleLeaveStrict : disableGate ? c.titleDisableGate : c.titleAllow);
  // The HUMAN summary leads; the raw JSON is a collapsible detail (native <details>,
  // no script needed) — the JSON-first layout was unreadable for non-developers.
  const lines = gateChange ? [] : argsLines(req.args);
  const linesHtml = lines.length
    ? `<ul class="acts">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`
    : "";
  const bodyHtml = leaveRenforce
    ? `<p>${e(c.leaveStrictBody)}</p>`
    : disableGate
      ? `<p>${e(c.disableGateLead)} <strong>${e(c.disableGateStrong)}</strong>${e(c.disableGateTail)}</p>`
      : `<p>${e(c.allowLead)}&nbsp;<span class="tool">${tool}</span>${e(c.allowTail)}</p>
    ${linesHtml}
    <details><summary>${e(c.technicalDetails)}</summary><pre>${summary}</pre></details>
    <p class="scope">${e(c.scopeLead)} <span class="tool">${tool}</span>${e(c.scopeTail)}</p>`;
  const denyLabel = e(leaveRenforce ? c.denyLeaveStrict : disableGate ? c.denyDisableGate : c.deny);
  const allowLabel = e(leaveRenforce ? c.allowLeaveStrict : disableGate ? c.allowDisableGate : c.allow);
  const allowToolBtn = gateChange
    ? ""
    : `<a class="btn tool-allow" href="${ALLOW_TOOL_URL}">${e(c.allowTool)}</a>`;
  // Brand tokens (mirrors the design-system `tokens/colors.css` — this page can't load
  // the app CSS, so the values are pinned here): paper/ink/lime + the SKY highlight
  // (--hl-sky #6FC2FF, soft #DCEEFF, deep #2F6FE0) as this surface's accent hue. The
  // primary CTA stays ink+lime (the brand's one-lime-CTA rule); sky carries the accent
  // stripe, the glyph tile, the tool chip and the per-tool button.
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<style>
  :root { --ink:#12210c; --paper:#fbfbfa; --muted:#5b6b52; --line:#dfe6d8; --lime:#c6f24e; --card:#fff;
    --sky:#6FC2FF; --sky-soft:#DCEEFF; --blue:#2F6FE0; }
  * { box-sizing:border-box; margin:0; padding:0; }
  html,body { height:100%; }
  body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--paper); color:var(--ink);
    display:flex; align-items:center; justify-content:center; padding:18px; -webkit-user-select:none; user-select:none; }
  .card { position:relative; width:100%; background:var(--card); border:1px solid var(--line); border-radius:14px;
    padding:18px 20px 16px; overflow:hidden; box-shadow:0 18px 40px -24px rgba(18,33,12,.35); }
  /* The AgentCard family's accent stripe, in the app blue. */
  .card::before { content:""; position:absolute; top:0; left:0; right:0; height:4px;
    background:linear-gradient(90deg, var(--sky) 0, var(--sky) 58px, var(--ink) 58px); }
  .head { display:flex; gap:12px; align-items:flex-start; margin-top:4px; }
  .tile { flex:none; width:36px; height:36px; border-radius:10px; background:var(--sky-soft);
    border:1px solid var(--sky); display:flex; align-items:center; justify-content:center; color:var(--blue); }
  .eyebrow { font-family:ui-monospace,"SF Mono",monospace; font-size:10.5px; letter-spacing:.08em; text-transform:uppercase; color:var(--blue); }
  h1 { font-size:18px; font-weight:800; letter-spacing:-.01em; margin:3px 0 0; }
  .tool { font-family:ui-monospace,"SF Mono",monospace; font-size:12px; color:var(--blue); background:var(--sky-soft); border:1px solid var(--sky); border-radius:7px; padding:1px 7px; display:inline-block; }
  p { font-size:12.5px; color:var(--muted); line-height:1.45; margin:10px 0 8px; }
  pre { font-family:ui-monospace,"SF Mono",monospace; font-size:11px; color:var(--ink); background:#f4f7f0; border:1px solid var(--line); border-radius:8px; padding:8px 10px; max-height:96px; overflow:auto; white-space:pre-wrap; word-break:break-word; }
  ul.acts { margin:8px 0; padding:8px 12px 8px 26px; background:#f7f9f4; border:1px solid var(--line); border-radius:10px; max-height:110px; overflow:auto; }
  ul.acts li { font-size:12.5px; color:var(--ink); line-height:1.55; }
  ul.acts li::marker { color:var(--blue); }
  details { margin:8px 0 0; }
  details summary { font-size:11.5px; color:var(--muted); cursor:pointer; }
  details summary::marker { color:var(--sky); }
  p.scope { font-size:11px; margin-top:10px; }
  .row { display:flex; gap:10px; margin-top:14px; }
  a.btn { flex:1; text-align:center; text-decoration:none; font-size:13px; font-weight:700; padding:10px 12px; border-radius:10px; border:1px solid var(--line); color:var(--ink); background:#fff; }
  a.allow { background:var(--ink); color:var(--lime); border-color:var(--ink); }
  a.tool-allow { background:var(--sky-soft); border-color:var(--sky); color:var(--blue); }
</style></head><body>
  <div class="card">
    <div class="head">
      <span class="tile"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/></svg></span>
      <div>
        <div class="eyebrow">${eyebrow}</div>
        <h1>${title}</h1>
      </div>
    </div>
    ${bodyHtml}
    <div class="row">
      <a class="btn" href="${DENY_URL}">${denyLabel}</a>
      ${allowToolBtn}
      <a class="btn allow" href="${ALLOW_URL}">${allowLabel}</a>
    </div>
  </div>
</body></html>`;
}

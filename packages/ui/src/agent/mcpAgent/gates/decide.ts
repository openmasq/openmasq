import { matchesAttachmentName } from "../../../send/sendGuards";
import { analyzeArgExfil, analyzeNavExfil, browserNavUrl, domainAllowed } from "../../../state/browserPolicy";
import { fakeDerivedNavHost } from "../../../state/browserPolicy/browserNavFake";
import { isCommSendTool, isDraftOnlyIntent, isWriteTool, refusedAsConsultOnly, skipsArgExfilScan } from "../../mcpAgentClassify";
import { raceAbort } from "../../mcpAgentAbort";
import { deredactArgs } from "../../mcpAgentUtil";
import { missingRequired } from "../../toolFault";
import { writeKey } from "../../writeIdempotency";
import type { CallDecision, ConnectorCall } from "../call";
import type { LoopCtx } from "../context";
import type { ResolvedAttachment } from "../types";

/** A document leaving the conversation: the model NAMES it, the desktop resolves the bytes. */
const ATTACH_FIELD: Record<string, string | undefined> = { send_email: "attachments", upload_file: "file" };

/** Resolves the named attachments UP FRONT, so the card lists the REAL filenames that will
 *  leave and the ones that will NOT. A DB failure is not « no attachments » — it is said. */
async function resolveAttachmentsFor(
  ctx: LoopCtx,
  c: ConnectorCall,
  field: string,
): Promise<{ resolved: ResolvedAttachment[]; unresolved: string[] } | "aborted"> {
  const raw = c.args[field];
  const rawNames = (Array.isArray(raw) ? raw : [raw]).filter((x): x is string => typeof x === "string" && !!x.trim());
  if (!rawNames.length) return { resolved: [], unresolved: [] };
  // A requested name can carry a vault FAKE: `wireArg` restores it like any outgoing argument.
  const wireNames = rawNames.map((x) => ctx.wireArg(x));
  let resolveFailed = false;
  const resolved = await raceAbort(ctx.p.resolveAttachments!(wireNames), ctx.p.signal).catch(() => {
    resolveFailed = true;
    return [] as ResolvedAttachment[];
  });
  if (ctx.aborted()) return "aborted";
  const unresolved = resolveFailed
    ? rawNames
    : rawNames.filter((_, i) => {
        const w = wireNames[i].toLowerCase().trim();
        return !resolved.some((a) => matchesAttachmentName(a.filename, [w]));
      });
  return { resolved, unresolved };
}

/**
 * Everything decided about a connector call BEFORE dispatch, in this order: missing args;
 * the domain allow-list on a navigation; write classification + idempotency; « rédiger » ≠
 * « envoyer » and « consulter » ≠ « agir »; attachments; and whether the user must confirm.
 * Only a WRITE, a nav whose URL carries real data, or real bytes leaving interrupt the user
 * — a READ is dispatched without asking (the arg scan still traces).
 */
export async function decideCall(ctx: LoopCtx, c: ConnectorCall): Promise<CallDecision | "aborted"> {
  const { p } = ctx;
  const { call, args, bareTool } = c;
  const info = ctx.toolInfo.get(call.name);
  const missing = missingRequired(info?.inputSchema, args);
  const deredactedArgs = !missing.length ? (deredactArgs(args, p.fromWireArgs ?? p.fromWire) as Record<string, unknown>) : {};
  // The URL a navigation would load — `browser_navigate` OR `browser_tabs`, on ANY connector.
  // The URL itself is the trigger: naming must never confer capability.
  const navUrl = browserNavUrl(call.name, deredactedArgs);
  let navBlocked = false;
  let navHost = "";
  if (navUrl && p.browserAllowedDomains?.length && !domainAllowed(p.browserAllowedDomains, navUrl)) {
    navBlocked = true;
    try {
      navHost = new URL(navUrl).hostname;
    } catch {
      navHost = navUrl;
    }
  }
  const isWrite = isWriteTool(call.name, info?.description, info?.annotations);
  // Keyed on the WIRE fakes: stable across a retry (same vault) and PII-free. Reads are never keyed.
  const idemKey = isWrite && p.turnId ? writeKey(p.turnId, call.name, args) : null;
  const alreadyDone = !!idemKey && !!p.writeLedgerHas?.(idemKey);
  const lastUser = [...p.history].reverse().find((m) => m.role === "user")?.content ?? "";
  const lastUserText = typeof lastUser === "string" ? lastUser : "";
  const draftOnly = isWrite && isCommSendTool(bareTool) && isDraftOnlyIntent(lastUserText);
  const consultOnly = refusedAsConsultOnly(call.name, isWrite, lastUserText, info);
  const vaultVals = p.vault ? [...Object.keys(p.vault), ...Object.values(p.vault)] : [];
  // `wireArg` IS the client's own un-redactor, so this cannot drift from the wire; `navUrl`
  // stays `fromWireArgs`-based because the domain allow-list only needs the real HOST.
  const wireNavUrl = navUrl ? browserNavUrl(call.name, deredactArgs(args, ctx.wireArg) as Record<string, unknown>) : "";
  // Holding only fakes, the model MINTS a hostname from one — a mutation no un-redactor restores.
  const navFake = wireNavUrl ? fakeDerivedNavHost(wireNavUrl, p.vault) : null;

  let resolvedAttachments: ResolvedAttachment[] = [];
  let unresolvedAttachmentNames: string[] = [];
  const attachField = ATTACH_FIELD[bareTool];
  if (attachField && !draftOnly && !consultOnly && p.resolveAttachments) {
    const r = await resolveAttachmentsFor(ctx, c, attachField);
    if (r === "aborted") return "aborted";
    resolvedAttachments = r.resolved;
    unresolvedAttachmentNames = r.unresolved;
  }
  const attachmentNames = [
    ...resolvedAttachments.map((a) => a.filename),
    ...unresolvedAttachmentNames.map((u) => `⚠️ introuvable — ne partira pas : ${u}`),
  ];

  let needsConfirm: boolean;
  let confirmFlags: CallDecision["confirmFlags"] = [];
  let confirmReason: CallDecision["confirmReason"] = "write";
  if (navUrl) {
    // Scan the WIRE url against the REALS; place-name values are handed over so an exact path
    // segment reads as geography, not smuggling.
    const reals = p.vault ? Object.values(p.vault) : [];
    const placeValues = p.kinds ? reals.filter((v) => p.kinds?.[v] === "location") : [];
    const nav = analyzeNavExfil(wireNavUrl, reals, placeValues);
    needsConfirm = !!wireNavUrl && nav.suspicious;
    confirmFlags = nav.flags;
    confirmReason = "nav-exfil";
  } else if (isWrite) {
    needsConfirm = true;
  } else {
    // The scan still RUNS on a read (a hit lands in the journal) but never blocks.
    if (!missing.length && !skipsArgExfilScan(call.name)) {
      const argExfil = analyzeArgExfil(deredactedArgs, vaultVals);
      if (argExfil.suspicious && !ctx.resultEcho.allArgsEchoed(c.connectorId, args))
        ctx.dbg({ type: "phase", scope: "tool", label: `Lecture autorisée d'office · ${call.name}`, detail: argExfil.flags.map((f) => f.param).join(", "), ok: true });
    }
    needsConfirm = false;
  }
  // Real user files leaving are confirmed whatever the classification; a write stays a write in the copy.
  if (attachmentNames.length) {
    if (!needsConfirm) confirmReason = "attachments";
    needsConfirm = true;
  }
  const navClear = !missing.length && ctx.navClearFor(call.name, args);
  return {
    missing, deredactedArgs, navUrl, isNav: !!navUrl, navBlocked, navHost, wireNavUrl, navFake,
    isWrite, idemKey, alreadyDone, draftOnly, consultOnly,
    resolvedAttachments, unresolvedAttachmentNames, attachmentNames,
    needsConfirm, confirmFlags, confirmReason, navClear, declinedByUser: false,
  };
}

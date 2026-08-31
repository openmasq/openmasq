import { expect, type Page } from "@playwright/test";

/*
 * The LAB: N CONCURRENT agentic turns in ONE launched app.
 *
 * The cost of a "real connectors" test splits into three: app startup
 * (~30 s), reconnecting the connectors, and model turns (the
 * minutes). One test = one app paid the first cost twice for nothing and serialized
 * the third. Here: ONE app, N conversations launched together, we wait for the batch.
 * The batch's time ≈ the slowest turn, not their sum.
 *
 * What runs is still the app's EXACT PROCESS: the store's `sendMessage` →
 * redaction → wire → `mcpAgent` → real MCP connectors → both gates. The bridge
 * only substitutes the confirmation cards' answer (see `e2eBridge.tsx`).
 */

/** The bridge's contract, redeclared here: the spec and the renderer don't share a
 *  tsconfig. It must stay the mirror of `src/renderer/src/e2eBridge.tsx` — a
 *  drift shows up immediately (the bridge is the ONLY consumer). */
interface E2eTurnSnapshot {
  convId: string;
  done: boolean;
  text: string;
  error: boolean;
  errorText: string;
  tools: string[];
  redactions: Record<string, string>;
  ms: number;
}
declare global {
  interface Window {
    __openmasqE2E?: {
      send: (
        text: string,
        opts?: { approveWrites?: boolean; revealForWeb?: boolean; modelId?: string },
      ) => string;
      modelReady: (id: string) => boolean;
      turn: (convId: string) => E2eTurnSnapshot | null;
      confirms: () => {
        tool: string;
        convId: string;
        approved: boolean;
        at: number;
        args: Record<string, unknown>;
      }[];
      journal: (convId: string) => unknown[];
      toolNameRedactions: (convId: string) => { fake: string; real: string }[];
    };
  }
}

export interface LabPrompt {
  id: string;
  prompt: string;
  /**
   * Allow THIS turn's writes. **Absent = REFUSED** — a bench that runs against
   * REAL accounts approves by exception, never by default.
   *
   * The reverse default cost exactly what it promised: on `prep-journee`, a
   * scenario annotated "Read only", the model created an invented event in the
   * real calendar — approved without anyone having asked, and counted as a
   * success (27/07/2026 log). A scenario that WANTS to write declares it.
   */
  approveWrites?: boolean;
  /** THIS turn's model — compare two models within the same batch. */
  modelId?: string;
}

export interface LabResult extends LabPrompt {
  convId: string;
  done: boolean;
  timedOut: boolean;
  error: boolean;
  errorText: string;
  text: string;
  /** The tools actually called, in order — the diagnostic's raw material. */
  tools: string[];
  /** Was the loop CUT OFF by the call cap? (symptom #1:
   *  the model replays the same tool instead of changing approach). */
  loopStopped: boolean;
  /** The largest number of times ONE same tool was called in this turn —
   *  the guidance-quality metric: it must GO DOWN as it's improved. */
  maxRepeat: number;
  /** Tool names / technical terms redacted BY MISTAKE in discovery
   *  results (`execute-sql → jade-tom`). Non-empty = the loop is (at least in
   *  part) INDUCED BY REDACTION, not a model weakness — the distinction
   *  that makes the reliability figure interpretable. */
  toolRedactions: { fake: string; real: string }[];
  ms: number;
}

/** The app itself announces the interruption in its answer — relying on its
 *  text (rather than guessing) keeps the test aligned with `mcpAgentGuidance`. */
const LOOP_STOPPED = /Boucle d'outils interrompue/i;

const maxRepeatOf = (tools: string[]): number => {
  const n = new Map<string, number>();
  for (const t of tools) n.set(t, (n.get(t) ?? 0) + 1);
  return Math.max(0, ...n.values());
};

/** The bridge mounts asynchronously (flag requested from main) — wait for it. */
export async function waitForBridge(page: Page): Promise<void> {
  await page.waitForFunction(() => !!window.__openmasqE2E, null, { timeout: 30_000 });
}

/**
 * Launches all the prompts at once, then waits until each one is done.
 * `timeoutMs` applies to the BATCH (a stuck turn doesn't block the others — it
 * comes back `timedOut`, which IS the symptom we're trying to measure).
 */
export async function runLab(
  page: Page,
  prompts: LabPrompt[],
  opts: { modelId: string; timeoutMs?: number },
): Promise<LabResult[]> {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  await waitForBridge(page);
  // The DYNAMIC OpenRouter catalog is merged in on mount: without this
  // wait, a dynamic slug isn't resolvable and the send goes out on the
  // factory model (401 with our dummy session).
  await page.waitForFunction((id) => window.__openmasqE2E!.modelReady(id), opts.modelId, {
    timeout: 60_000,
  });
  const started = await page.evaluate(
    ({ list, modelId }) =>
      list.map((p) => ({
        id: p.id,
        convId: window.__openmasqE2E!.send(p.prompt, {
          approveWrites: p.approveWrites === true,
          modelId: p.modelId ?? modelId,
        }),
      })),
    { list: prompts, modelId: opts.modelId },
  );

  const deadline = Date.now() + timeoutMs;
  let snapshot: Record<string, ReturnType<NonNullable<Window["__openmasqE2E"]>["turn"]>> = {};
  for (;;) {
    snapshot = await page.evaluate(
      (ids) => Object.fromEntries(ids.map((c) => [c, window.__openmasqE2E!.turn(c)])),
      started.map((s) => s.convId),
    );
    if (Object.values(snapshot).every((t) => t?.done)) break;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(2_000);
  }

  // The TOOL NAME redactions per conversation (the debug journal).
  const toolReds = await page.evaluate(
    (ids) => Object.fromEntries(ids.map((c) => [c, window.__openmasqE2E!.toolNameRedactions(c)])),
    started.map((s) => s.convId),
  );

  return prompts.map((p) => {
    const convId = started.find((s) => s.id === p.id)!.convId;
    const t = snapshot[convId];
    return {
      ...p,
      convId,
      done: !!t?.done,
      timedOut: !t?.done,
      error: !!t?.error,
      errorText: t?.errorText ?? "",
      text: t?.text ?? "",
      tools: t?.tools ?? [],
      loopStopped: LOOP_STOPPED.test(t?.text ?? ""),
      maxRepeat: maxRepeatOf(t?.tools ?? []),
      toolRedactions: toolReds[convId] ?? [],
      ms: t?.ms ?? 0,
    };
  });
}

/** Dump the bench's journal to a file (for the autopsy of a workflow that
 *  loops) — the FULL journal, with the redacted↔original correspondences. */
export async function dumpJournal(page: Page, convId: string): Promise<unknown[]> {
  return page.evaluate((c) => window.__openmasqE2E!.journal(c), convId);
}

/** The write confirmations requested by the loop, across all turns —
 *  `2×` on the same tool within the same conversation IS the double-send. */
export async function labConfirms(page: Page) {
  return page.evaluate(() => window.__openmasqE2E!.confirms());
}

/** A compact report, readable at a glance in Playwright's output. */
export function labReport(results: LabResult[]): string {
  return results
    .map((r) => {
      const state = r.timedOut ? "⏳ BLOQUÉ" : r.error ? "✗ ERREUR" : r.loopStopped ? "🔁 BOUCLE" : "✓";
      const tools = r.tools.length
        ? ` · ${r.tools.length} appel(s) [max ${r.maxRepeat}× le même]: ${[...new Set(r.tools)].join(", ")}`
        : " · aucun outil";
      // The flag that makes the loop interpretable: redaction OR model.
      const redact = r.toolRedactions.length
        ? `\n    ⚠️ NOMS D'OUTILS REDACTED (cause probable de boucle) : ${r.toolRedactions
            .slice(0, 6)
            .map((x) => `${x.real}→${x.fake}`)
            .join(", ")}`
        : "";
      const body = (r.errorText || r.text).slice(0, 200).replace(/\n/g, " ");
      return `${state} ${r.id} (${Math.round(r.ms / 1000)}s)${tools}\n    ${body}${redact}`;
    })
    .join("\n");
}

/**
 * OUTWARD actions (send, create, publish) confirmed at most once
 * per conversation — the anti-double-send assertion.
 *
 * ⚠️ Deliberately restricted to those tools: the write gate is fail-closed
 * ("unknown ⇒ write"), so an unclassified READ tool — `posthog__exec`,
 * measured 7× — also asks for confirmation. Counting every repeated confirmation
 * as a double-send would conflate "the model is looping" (quality, measured by
 * `maxRepeat`) with "the user sent it twice" (security). Two symptoms,
 * two verdicts.
 */
export const OUTWARD_TOOLS = /^(slack|gmail|linear|google-calendar|notion)__/;

export function expectNoDoubleOutwardAction(
  confirms: { tool: string; convId: string; approved: boolean }[],
  pattern: RegExp = OUTWARD_TOOLS,
): void {
  const seen = new Map<string, number>();
  for (const c of confirms.filter((c) => c.approved && pattern.test(c.tool)))
    seen.set(`${c.convId}·${c.tool}`, (seen.get(`${c.convId}·${c.tool}`) ?? 0) + 1);
  const doubled = [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k}×${n}`);
  expect(doubled, `action sortante exécutée plusieurs fois : ${doubled.join(", ")}`).toEqual([]);
}

/** The batch's reliability SUMMARY — what we watch go down as we iterate on
 *  the guidance: turns cut off by the cap, and the worst repeat of a same tool. */
export function labReliability(results: LabResult[]): {
  looped: string[];
  worstRepeat: { id: string; n: number } | null;
} {
  const looped = results.filter((r) => r.loopStopped).map((r) => r.id);
  const worst = [...results].sort((a, b) => b.maxRepeat - a.maxRepeat)[0];
  return { looped, worstRepeat: worst ? { id: worst.id, n: worst.maxRepeat } : null };
}

/** A turn in ERROR is a batch failure — otherwise a 401 passes for a success
 *  (measured: three "error" turns in 4 s left the test green). */
export function expectNoErrors(results: LabResult[]): void {
  const bad = results.filter((r) => r.error);
  expect(
    bad.map((r) => r.id),
    `tours en échec : ${bad.map((r) => `${r.id} → ${r.errorText || "(sans message)"}`).join(" | ")}`,
  ).toEqual([]);
}

/** No turn should stay stuck: that's the `errorbrowser.md` incident (empty
 *  router → a loop that never resolves), and the first symptom of failed guidance. */
export function expectAllCompleted(results: LabResult[]): void {
  const stuck = results.filter((r) => r.timedOut).map((r) => r.id);
  expect(stuck, `tours jamais terminés : ${stuck.join(", ")}`).toEqual([]);
}

import { captureEvent } from "../../analytics";
import { isAbortError, raceAbort } from "../mcpAgentAbort";
import { pythonErrorHint, pythonFailReason } from "../mcpAgentGuidance";
import { safeJson } from "../mcpAgentUtil";
import { liveToolStatus, watchToolCall } from "../mcpAgentWatchdog";
import { toolStartNarration } from "../toolActionLabel";
import { MAX_CONSECUTIVE_DEAD } from "./budget";
import type { Step, ToolCall } from "./call";
import type { LoopCtx } from "./context";
import type { PythonRunResult } from "./types";

const PY_WATCHDOG_MS = 90_000; // above the jail's own kill: exists for the ticks, fires only if the jail hung

const EMPTY_CODE_MSG =
  "Erreur : l'argument `code` est manquant ou vide — RIEN n'a été exécuté. " +
  "Renvoie l'appel `run_python` avec le script Python COMPLET dans le champ `code` (une seule chaîne JSON valide). " +
  "Si ton exécution précédente a déjà produit le résultat (figure affichée, sortie correcte), ne relance rien : présente la réponse.";

/** Hands each figure/file to the host; a failed save is REPORTED, never assumed delivered. */
async function deliver(ctx: LoopCtx, r: PythonRunResult) {
  const images: PythonRunResult["images"] = [];
  const files: PythonRunResult["files"] = [];
  const failed: string[] = [];
  for (const img of r.images) {
    try {
      await ctx.p.onPythonImage?.(img);
      images.push(img);
    } catch {
      failed.push(img.name);
    }
  }
  for (const file of r.files) {
    try {
      await ctx.p.onPythonFile?.(file);
      files.push(file);
    } catch {
      failed.push(file.name);
    }
  }
  return { images, files, failed };
}

/** The model-facing text of a run: stdout, delivery notes, then the error and its steer. */
function describeRun(ctx: LoopCtx, r: PythonRunResult, d: Awaited<ReturnType<typeof deliver>>): string {
  let content = r.stdout.trim();
  const add = (s: string) => {
    content += (content ? "\n\n" : "") + s;
  };
  if (d.images.length) add(`[${d.images.length} figure(s) générée(s) et affichée(s) à l'utilisateur — le résultat est définitif, ne relance pas ce code : présente la réponse.]`);
  if (d.files.length) add(`[${d.files.length} fichier(s) remis à l'utilisateur : ${d.files.map((f) => f.name).join(", ")}.]`);
  if (d.failed.length)
    add(`[ÉCHEC de remise à l'utilisateur : ${d.failed.join(", ")} — ce(s) fichier(s) n'ont PAS pu être enregistrés. Dis-le à l'utilisateur et propose de réessayer.]`);
  if (!r.ok && r.stderr.trim()) {
    add(`Erreur d'exécution :\n${r.stderr.trim().slice(0, 4000)}`);
    const hint = pythonErrorHint(r.stderr, { browser: ctx.hasBrowser, fetchMany: !!ctx.p.fetchMany });
    if (hint) content += `\n\n${hint}`;
    // A CODE error is fixed by ITERATION on the whole script, never a fragment or a restart.
    const reason = pythonFailReason(r.stderr);
    if (reason === "runtime" || reason === "module")
      content += "\n\nCorrige le script ci-dessus (garde ce qui marchait, change ce qui a échoué) et renvoie-le EN ENTIER dans un nouvel appel `run_python` — jamais un fragment.";
  }
  return content || (r.ok ? "(exécuté — aucune sortie)" : "Échec de l'exécution.");
}

/**
 * `run_python`, intercepted. The model wrote the code with FAKES; the sandbox is LOCAL, so
 * the code runs DE-REDACTED and the deliverables carry the user's REAL data. Everything that
 * comes back to the model (stdout, stderr, filenames) is RE-REDACTED through the same vault —
 * and MASKED when no redactor is wired (fail closed).
 */
export async function handleRunPython(ctx: LoopCtx, call: ToolCall, args: Record<string, unknown>): Promise<Step> {
  const { p, st } = ctx;
  const code = p.fromWire(typeof args.code === "string" ? args.code : "");
  if (!code.trim()) {
    ctx.struggle.argErrored.add("run_python");
    ctx.dbg({ type: "tool", vault: p.vault, kinds: p.kinds, name: "run_python", ok: false, args: safeJson(call.arguments, 400), result: EMPTY_CODE_MSG, error: "code vide" });
    p.onToolResult?.({ tool: "run_python", server: "python", ok: false });
    ctx.messages.push({ role: "tool", toolCallId: call.id, content: EMPTY_CODE_MSG });
    if (ctx.bumpDead() >= MAX_CONSECUTIVE_DEAD) return ctx.finishExhausted(), "stop";
    return "next";
  }
  const narration = toolStartNarration("run_python", "python");
  p.onToolProgress?.(narration);
  const tPy = Date.now();
  let r: PythonRunResult;
  try {
    r = await raceAbort(
      watchToolCall(p.runPython!(code), {
        bareTool: "run_python",
        timeoutMs: PY_WATCHDOG_MS,
        onTick: (elapsed) => {
          if (!ctx.aborted()) p.onToolProgress?.(liveToolStatus(narration, elapsed, PY_WATCHDOG_MS));
        },
      }),
      p.signal,
    );
  } catch (e) {
    if (ctx.aborted() || isAbortError(e)) return ctx.finalizeAborted(), "stop";
    r = { ok: false, stdout: "", stderr: e instanceof Error ? e.message : String(e), images: [], files: [] };
  }
  if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
  const delivered = await deliver(ctx, r);
  if (r.ok) {
    // The turn's working script, WIRE form — the de-redacted `code` never leaves the sandbox path.
    try {
      await p.onPythonScript?.(typeof args.code === "string" ? args.code : "");
    } catch {
      /* best-effort */
    }
  }
  let content = describeRun(ctx, r, delivered);
  if (!r.ok) captureEvent({ name: "run_python_failed", reason: pythonFailReason(r.stderr), ms: Date.now() - tPy, loopId: ctx.loopId });
  content = ctx.redactResult ? await ctx.redactResult(content, p.vault, "run_python") : "(sortie masquée : redaction indisponible)";
  if (ctx.aborted()) return ctx.finalizeAborted(), "stop";
  ctx.dbg({
    type: "tool", vault: p.vault, kinds: p.kinds, name: "run_python", ok: r.ok,
    args: safeJson(call.arguments, 4000), result: content,
    ...(r.ok
      ? {}
      : { error: `échec en ${Date.now() - tPy} ms · stderr ${r.stderr.trim().length} car. (re-redacted ci-dessous)${r.stdout.trim() ? ` · stdout ${r.stdout.trim().length} car.` : ""}` }),
  });
  p.onToolResult?.({
    tool: "run_python",
    server: "python",
    ok: r.ok,
    summary:
      [r.images.length && `${r.images.length} figure(s)`, r.files.length && `${r.files.length} fichier(s)`].filter(Boolean).join(" · ") || undefined,
  });
  ctx.messages.push({ role: "tool", toolCallId: call.id, content });
  if (r.ok) {
    st.deadStreak = 0;
    st.pyTimeoutStreak = 0;
  } else {
    // A TIMEOUT/network failure never recovers by retrying: stop after the 2nd in a row.
    const reason = pythonFailReason(r.stderr);
    st.pyTimeoutStreak = reason === "timeout" || reason === "network" ? st.pyTimeoutStreak + 1 : 0;
    if (st.pyTimeoutStreak >= 2) return ctx.finishExhausted(), "stop";
    if (ctx.bumpDead() >= MAX_CONSECUTIVE_DEAD) return ctx.finishExhausted(), "stop";
  }
  return "next";
}

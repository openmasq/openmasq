import { ipcMain } from "electron";
import { ensureRuntime, type Progress } from "./runtime";
import { runPython, type PythonResult, type SeedFile } from "./sandbox";

/**
 * IPC surface for the sandboxed Python engine: `python:run` ensures the runtime
 * (download-on-first-use CPython + frozen venv, cached under userData) and then
 * runs the model-generated `code` in the jailed, egress-constrained sandbox.
 *
 * It ALSO pushes a live human status over `python:progress` (to the calling
 * webContents) throughout — the first-use download/extract/install phases, then
 * "Exécution du code…", then the code's latest stdout line — so the chat's tool
 * indicator EVOLVES instead of sitting on a static "en cours…".
 */

/** Map a runtime install phase to a user-facing FR status line. */
function phaseLabel(p: Progress): string {
  switch (p.phase) {
    case "download":
      return `Téléchargement de l'environnement Python…${p.pct != null ? ` ${p.pct} %` : ""}`;
    case "extract":
      return "Décompression de l'environnement…";
    case "install":
      return "Installation des paquets (numpy, pandas, matplotlib…)…";
    case "ready":
      return "Environnement prêt.";
  }
}

/** Last non-empty line of a stdout chunk, trimmed + bounded for the indicator. */
function lastLine(chunk: string): string | undefined {
  const line = chunk
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .pop();
  return line ? (line.length > 90 ? `${line.slice(0, 90)}…` : line) : undefined;
}

let registered = false;

/** Register the `python:run` handler once (idempotent — safe to call on relaunch). */
export function registerPythonIpc(): void {
  if (registered) return;
  registered = true;
  ipcMain.handle("python:run", async (e, payload: unknown): Promise<PythonResult> => {
    const emit = (status: string): void => {
      if (!e.sender.isDestroyed()) e.sender.send("python:progress", status);
    };
    // Payload: `{ code, files? }` — `files` = deliverables generated earlier in the
    // conversation, seeded into the run's CWD so the code can load + MODIFY them
    // (sanitized in `runPython`, main-side; the renderer is untrusted). A bare string
    // (an un-restarted preload) still works.
    const p =
      typeof payload === "object" && payload !== null
        ? (payload as { code?: unknown; files?: unknown })
        : { code: payload, files: undefined };
    // First call downloads the runtime (slow); subsequent calls are instant. Errors
    // (no network on first use, unsupported platform) surface as a failed result.
    try {
      const { pythonBin } = await ensureRuntime((prog) => emit(phaseLabel(prog)));
      emit("Exécution du code…");
      return await runPython(String(p.code ?? ""), {
        pythonBin,
        seedFiles: Array.isArray(p.files) ? (p.files as SeedFile[]) : undefined,
        onStdout: (chunk) => {
          const l = lastLine(chunk);
          if (l) emit(l);
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, stdout: "", stderr: `Environnement Python indisponible : ${msg}`, images: [], files: [] };
    }
  });
}

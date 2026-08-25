import { generatedFileNames } from "./generatedFiles";

/**
 * Seed loader for `run_python`: resolve the conversation's previously generated
 * deliverables (PDF/xlsx/docx/pptx…) to their REAL bytes so the sandbox can copy them
 * into the run's working dir — a « modifie/enrichis ce fichier » then LOADS the file
 * instead of recreating it from nothing. Has side effects (Host DB reads) like
 * `toolResult.ts`; the pure name selection lives in `generatedFiles.ts`.
 *
 * Best-effort ON PURPOSE: seeding is a convenience, not a gate — any failure returns
 * fewer seeds, never an error. The SECURITY validation (basename-only names, extension
 * allow-list, size/count caps) is main-side (`sandbox.ts` `sanitizeSeedFiles`), where
 * the trust boundary is; this loader only bounds the IPC payload.
 */

const MAX_SEEDS = 8;
const MAX_SEED_BYTES = 25 * 1024 * 1024; // mirror of the sandbox's per-file cap

export interface PythonSeed {
  name: string;
  base64: string;
}

export async function loadPythonSeeds(opts: {
  listFiles?: (conversationId: string) => Promise<{ id: string; name: string; createdAt: number }[]>;
  loadFile?: (id: string) => Promise<{ original: Uint8Array } | null>;
  toBase64: (bytes: Uint8Array) => string;
  conversationId: string | null | undefined;
  messages: readonly { role: string; attachments?: readonly { name: string; kind: string }[] }[];
  /** Files generated EARLIER IN THIS TURN (not yet in `messages`) — freshest, they win. */
  turnFiles: readonly PythonSeed[];
}): Promise<PythonSeed[]> {
  const byName = new Map<string, PythonSeed>();
  try {
    const names = generatedFileNames(opts.messages, MAX_SEEDS);
    if (names.length && opts.conversationId && opts.listFiles && opts.loadFile) {
      const metas = await opts.listFiles(opts.conversationId).catch(() => []);
      for (const name of names) {
        // A re-generated name has several rows — take the NEWEST one.
        const meta = metas
          .filter((m) => m.name === name)
          .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
          .pop();
        if (!meta) continue;
        const f = await opts.loadFile(meta.id).catch(() => null);
        if (!f?.original?.length || f.original.length > MAX_SEED_BYTES) continue;
        byName.set(name, { name, base64: opts.toBase64(f.original) });
      }
    }
  } catch {
    /* best-effort — a failed load just means fewer seeds */
  }
  for (const f of opts.turnFiles) byName.set(f.name, f); // this turn's version wins
  return Array.from(byName.values()).slice(-MAX_SEEDS);
}

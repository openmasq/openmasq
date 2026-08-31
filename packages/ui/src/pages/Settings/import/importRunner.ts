import {
  readExportFile,
  parseChatGptExport,
  parseClaudeExport,
  detectExportProvider,
  redactImported,
  type ImportProvider,
  type ImportProgress,
} from "../../../import";
import type { Conversation } from "../../../types";

export const PROVIDER_LABEL: Record<ImportProvider, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
};

/**
 * The whole import flow for one picked file, off the JSX (logic in .ts): read the
 * export (zip or json, 100% local) → parse for the chosen provider → run the
 * import-time redaction pass per conversation (progress-reported — it dominates the
 * wall clock on a big export). Throws user-facing FRENCH messages; the modal shows
 * them verbatim.
 */
export async function runImport(opts: {
  bytes: Uint8Array;
  provider: ImportProvider;
  modelId: string;
  disabledKinds: string[];
  /** What the model will see for these conversations (their vault is built at import
   *  time, so the mode is frozen there). Absent ⇒ plausible fakes. */
  mode?: "fake" | "token";
  onProgress?: ImportProgress;
}): Promise<Conversation[]> {
  const json = await readExportFile(opts.bytes);
  const parsed =
    opts.provider === "chatgpt"
      ? parseChatGptExport(json, { modelId: opts.modelId })
      : parseClaudeExport(json, { modelId: opts.modelId });

  if (parsed.length === 0) {
    const detected = detectExportProvider(json);
    if (detected && detected !== opts.provider)
      throw new Error(
        `Ce fichier ressemble à un export ${PROVIDER_LABEL[detected]} — sélectionnez « ${PROVIDER_LABEL[detected]} » puis réessayez.`,
      );
    throw new Error(
      `Aucune conversation trouvée. Vérifiez qu'il s'agit bien de l'export ${PROVIDER_LABEL[opts.provider]} (le .zip reçu par e-mail, ou son conversations.json).`,
    );
  }

  const out: Conversation[] = [];
  for (let i = 0; i < parsed.length; i++) {
    out.push(await redactImported(parsed[i], { disabledKinds: opts.disabledKinds, mode: opts.mode }));
    opts.onProgress?.(i + 1, parsed.length);
    // Yield to the event loop every few conversations so the progress line paints.
    if (i % 5 === 4) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}

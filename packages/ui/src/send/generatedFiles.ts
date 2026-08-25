/**
 * Context continuity for GENERATED deliverables across turns.
 *
 * A file the model produces via `run_python` (or a tool export) is persisted ONLY as
 * display-side `Message.attachments` metadata — it is NEVER folded into the model-facing
 * wire text. So on a FOLLOW-UP turn ("envoie-le par email") the model has zero evidence
 * the file already exists and re-runs `run_python` to recreate it from scratch (the
 * reported "régénère le document à chaque fois"). `generatedFilesNote` rebuilds a compact,
 * wire-safe marker — the persistent analogue of the transient "N fichier(s) remis à
 * l'utilisateur" line the agent loop only adds WITHIN a turn — that is appended to the
 * assistant turn's content so the model REUSES the deliverable instead of regenerating it.
 * A MODIFICATION request is the one case where regenerating is right, so the note says
 * so — generically (never naming `run_python`: the tool may be absent from the offer;
 * the tool-specific "il est dans ton dossier courant" detail rides the run_python
 * guidance in `agent/mcpAgentPython.ts`, which only ships when the tool is offered).
 *
 * Pure (no React / no side effects); the caller passes filenames already vault-redacted.
 */

/** The marker appended to a prior ASSISTANT turn's model-facing content listing the
 *  deliverables it already produced. Returns "" when there are none. */
export function generatedFilesNote(names: readonly string[]): string {
  const clean = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (clean.length === 0) return "";
  return (
    `\n\n[Fichier(s) DÉJÀ généré(s) dans cette conversation et remis à l'utilisateur : ` +
    `${clean.join(", ")}. Pour les transmettre (les joindre à un email…), réutilise-les ` +
    `tels quels — NE les régénère PAS à l'identique. Pour en MODIFIER/enrichir un à la ` +
    `demande de l'utilisateur, produis une NOUVELLE version sous le MÊME nom de fichier.]`
  );
}

/** The marker carrying the LATEST successful analysis script (WIRE form — fakes only)
 *  so a follow-up turn ITERATES on it instead of regenerating the analysis from
 *  nothing (tool calls are never replayed in the wire history, so without this the
 *  model has zero memory of its own code). Appended by `buildWire.ts` to the LAST
 *  assistant turn holding one — a single copy per send, size bounded by the store's
 *  cap. Model-facing ONLY (no UI surfaces the script). Deliberately does NOT name
 *  `run_python` (the tool may be absent from the offer); the tool-specific how-to
 *  rides `agent/mcpAgentPython.ts`. */
export function pythonScriptNote(wireScript: string): string {
  const s = wireScript.trim();
  if (!s) return "";
  return (
    `\n\n[Script d'analyse déjà exécuté avec succès dans cette conversation (fichier \`analyse.py\`). ` +
    `Pour toute NOUVELLE itération (ajuster, enrichir, corriger), repars de CE script et modifie ce qui doit l'être — ne réécris pas l'analyse de zéro :\n` +
    "```python\n" +
    s +
    "\n```]"
  );
}

/** A name that collides with an ALREADY-STORED file of the conversation gets a `-2`,
 *  `-3`… suffix before the extension. Uniqueness is load-bearing, not cosmetic:
 *  `findStoredFile` resolves a click by name, LAST row wins — two files under one name
 *  make the older chip silently render the newer bytes. */
export function uniqueFileName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let i = 2; ; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Names of the deliverable FILES the assistant generated in this conversation (the
 *  non-image attachments of assistant turns), oldest→newest, deduped keeping the LAST
 *  occurrence, capped to the `max` most recent. Feeds the `run_python` seed loader
 *  (`pythonSeeds.ts`) — REAL names in, since the seeds must match what the de-redacted
 *  code references. */
export function generatedFileNames(
  messages: readonly { role: string; attachments?: readonly { name: string; kind: string }[] }[],
  max = 8,
): string[] {
  const names: string[] = [];
  for (const m of messages) {
    if (m.role !== "assistant" || !m.attachments) continue;
    for (const a of m.attachments) {
      if (a.kind === "image" || !a.name.trim()) continue;
      const i = names.indexOf(a.name);
      if (i >= 0) names.splice(i, 1); // re-generated later → keep the LAST occurrence
      names.push(a.name);
    }
  }
  return names.slice(-max);
}

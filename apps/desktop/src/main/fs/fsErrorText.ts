/**
 * The error text rendered to the MODEL — the "guidance" half of the refusal, pure and tested.
 *
 * ⚠️ An ENOENT on the tool surface is almost always a RECOMPOSED path: paths
 * come back to the model redacted segment by segment, and it cannot
 * memorize them — so it assembles one from fragments (a name read in some content,
 * a guessed folder) and `stat` fails. Measured on 15/08: three `get_file_info` ENOENTs
 * in a row on plausible but nonexistent paths, until the loop's cap.
 * The raw Node message ("ENOENT: no such file or directory") teaches it nothing; a way out
 * exists (relist, copy exactly) — same remedy as the "outside the allowed
 * folders" refusal (`grant.ts`) and as the browser's guessed domain.
 *
 * The UI surface keeps the RAW error: it speaks to code, not to a model, and
 * French-language guidance in a programmatic error would just be noise.
 */
const ENOENT_GUIDANCE =
  ". Ce chemin n'existe pas — ne recompose JAMAIS un chemin à partir de fragments : " +
  "liste d'abord le dossier (list_directory) et recopie un chemin EXACTEMENT tel " +
  "qu'un résultat l'a rendu.";

export function fsErrorText(err: unknown, surface: "tool" | "ui"): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (surface !== "tool") return msg;
  if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return msg + ENOENT_GUIDANCE;
  return msg;
}

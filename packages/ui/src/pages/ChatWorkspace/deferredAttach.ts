import type { Attachment } from "./Composer";
import type { ExtractedFile } from "../../host";
import type { DeferredFile } from "../../state/deferredFile";

/** Ce que `ChatView` sait faire et que ce module ne sait pas : poser, corriger, enchaîner. */
export interface DeferredAttachDeps {
  /** Met le chip en scène — c'est `ChatView` qui choisit entre l'état local et le magasin. */
  stage(files: Attachment[], forConvId?: string): void;
  /** Corrige un chip DÉJÀ posé, du même côté que `stage` l'a mis. */
  patch(cid: string, patch: Partial<Attachment>, forConvId?: string): void;
  /** Le nombre de valeurs que la passe regex voit — le compteur 🛡 du chip. */
  countMatches(text: string): number;
  /** Journal OCR + départ du redaction, une fois le contenu là. */
  onExtracted(file: ExtractedFile, attachment: Attachment): void;
  /** Un identifiant de chip. Injecté par le TEST seulement, pour être déterministe. */
  newCid?(): string;
}

/** Le chip tel qu'il paraît AVANT d'avoir son contenu : nommé, et déjà en travail. */
export function placeholderFor(d: DeferredFile, cid: string): Attachment {
  return {
    name: d.name,
    ...(d.mime ? { mime: d.mime } : {}),
    kind: "",
    text: "",
    chars: 0,
    cid,
    redactPreview: 0,
    extracting: true,
  };
}

/**
 * Poser le chip TOUT DE SUITE, puis le remplir.
 *
 * L'ordre est tout : `stage` avant le premier `await`, sinon on revient au comportement
 * qu'on corrige — l'utilisateur clique et rien ne bouge pendant l'OCR.
 *
 * ⚠️ **Un échec laisse le chip, marqué.** Le retirer serait plus propre à l'œil et
 * malhonnête : le fichier a bien été demandé, et un chip fautif se réessaie (`retryAttachment`)
 * là où une disparition ne laisse rien à faire, ni rien à comprendre.
 */
export async function stageDeferredFile(
  d: DeferredFile,
  forConvId: string | undefined,
  deps: DeferredAttachDeps,
): Promise<void> {
  const ph = placeholderFor(d, deps.newCid?.() ?? Math.random().toString(36).slice(2));
  deps.stage([ph], forConvId);
  let file: ExtractedFile;
  try {
    // La progression OCR corrige le chip page par page ; une source qui n'en émet pas
    // laisse la barre indéterminée (le paramètre est ignoré sans dommage).
    file = await d.load((p) => deps.patch(ph.cid, { extractProgress: p }, forConvId));
  } catch {
    deps.patch(ph.cid, { extracting: false, error: "extraction échouée" }, forConvId);
    return;
  }
  const redactPreview = deps.countMatches(file.text);
  deps.patch(
    ph.cid,
    // `extracting` tombe et `redacting` prend le relais dans le MÊME correctif : deux
    // correctifs laissaient le chip une frame sans état, ce qui se lit comme un échec.
    { ...file, extracting: false, extractProgress: undefined, redactPreview, redacting: !!file.text.trim() },
    forConvId,
  );
  deps.onExtracted(file, { ...ph, ...file, redactPreview });
}

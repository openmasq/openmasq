import { MiniRedaction } from "../media/BrandLogo/MiniRedaction";

/**
 * The "thinking" indicator shown while an assistant turn is PENDING with no content
 * or tool yet — the prefill / tool-routing wait AND while the model streams a tool-call
 * ARGUMENT (a big `run_python` / `write_file` body arrives with NO prose, so `onText`
 * never fires).
 *
 * **The loader, plus the model's own reflection when there is one.** It used to carry a
 * colour-cycling pill: a rotating succession of phrases ("Le modèle réfléchit", "Bientôt
 * prêt"…), the live tool label, and an elapsed ticker. All of it is gone on purpose — a
 * phrase that changes every 1.8 s reads as PROGRESS the app cannot actually report, so it
 * invented reassurance the wait didn't earn, and the second-by-second counter turned an
 * ordinary wait into something to watch.
 *
 * `reasoning` is the exact opposite of that invention: the model's REAL chain of thought,
 * streamed by the provider (`@openmasq/llm` `onReasoning`) and already un-redacted. It
 * appears only when a provider actually sends one — a model that doesn't reason, or whose
 * reasoning isn't exposed, keeps the bare `MiniRedaction`, which already says what the
 * wait is about (the redaction, still working) and is visibly alive. Nothing stands in
 * for a reflection that doesn't exist.
 *
 * ⚠️ The wait is still ANNOUNCED to assistive tech (`role="status"` + `aria-label`): a
 * loader with no accessible name is silence, not restraint. That text is never painted.
 * The reflection itself is `aria-hidden` — inside a `role="status"` region, text rewritten
 * every ~90 ms would machine-gun a screen reader with a draft of an answer it is about to
 * read out properly.
 *
 * The tool being called is not lost with the pill — `ToolTrace` renders the live "APPEL
 * D'OUTILS" row beside this one.
 */
export function ThinkingIndicator({
  reasoning,
  trailing,
}: {
  reasoning?: string;
  /** The loader rides BELOW a reply that is still streaming, rather than standing in
   *  for it (`messageBubbleView.ts` `showsTrailingLoader`). It says « still writing »,
   *  so it takes tighter spacing and its own accessible name — and never a reflection,
   *  which `TurnProcess` is already showing above the answer by then. */
  trailing?: boolean;
}) {
  const text = trailing ? undefined : reasoning?.trim();
  return (
    <div
      className={`om-think${text ? " is-reflecting" : ""}${trailing ? " is-trailing" : ""}`}
      role="status"
      aria-label={
        trailing
          ? "Le modèle rédige la réponse"
          : text
            ? "Le modèle réfléchit"
            : "Le modèle prépare la réponse"
      }
    >
      {/* The app-open grid, in miniature and never finishing — the wait wears the object
          the app opened on. */}
      <MiniRedaction />
      {text && (
        <div className="om-think-reflection" aria-hidden="true">
          {/* ONE child on purpose: `column-reverse` pins it to the bottom of the box, so a
              growing text always shows its freshest lines (see `styles/thinking.css`). */}
          <span>{text}</span>
        </div>
      )}
    </div>
  );
}

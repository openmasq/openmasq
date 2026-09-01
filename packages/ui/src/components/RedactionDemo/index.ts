/* The redaction demonstration — one sentence, twice: what you write, what the
   model receives. Promoted here (shared sheet) the day AIDE showed it too:
   it's the clearest explanation of the product, and it shouldn't disappear with
   the first launch. */
// Only the component leaves here: `demo.ts` is imported DIRECTLY by whatever
// needs it (the component, its test). A barrel that re-exports more broadly creates dead
// code that `check:knip` counts — and that nobody can reach.
export { RedactionDemo } from "./RedactionDemo";

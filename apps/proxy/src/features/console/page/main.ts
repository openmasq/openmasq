// The console page's ENTRY — what `scripts/build-console.mjs` bundles into `app.js`.
//
// The page is mid-move. Its markup and CSS stay an asset (`../index.html`: it is the design
// kit, and diffing it against the kit is what keeps them honest), while the logic that
// DECIDES something comes across module by module, gaining types and tests on the way. Until
// the move is done the asset's own `<script>` is still there, so this file's job is to hand
// it what has already crossed, under one name.
//
// ⚠️ ONE home per behaviour: what appears here is DELETED from the asset in the same change,
// never left behind "for now". Two copies of a rule about who may see a real value is exactly
// the bug rule 9 exists to prevent.
import { exportableEvent, exportDocument, exportFilename, mayReveal } from "./reveal.js";

export { exportableEvent, exportDocument, exportFilename, mayReveal };

/** The surface the asset's inline script calls. Narrow on purpose — it shrinks as the move
 *  proceeds, and it disappears when the last of the inline script does. */
declare global {
  interface Window {
    openmasqConsole?: {
      mayReveal: typeof mayReveal;
      exportableEvent: typeof exportableEvent;
      exportDocument: typeof exportDocument;
      exportFilename: typeof exportFilename;
    };
  }
}

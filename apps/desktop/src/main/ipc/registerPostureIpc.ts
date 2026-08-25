import { confirmWrite, setWriteAutoApprove } from "../mcp/writeConfirmWindow";
import { getConfirmationMode, setConfirmationMode, setOrgConfirmationFloor } from "../mcp/confirmationMode";
import { setOrgAllowedConnectors } from "../mcp/orgPolicy";
import { setOrgByoKeysAllowed } from "../store/keysPolicy";
import { handle, any, nullable, str } from "./handle";

/**
 * The confirmation-POSTURE IPC family: how much the app confirms, and what an organisation
 * imposes on top. Grouped in one module because they are one trust boundary (root rule 10)
 * and because `index.ts` keeps handlers thin.
 *
 * Each of the four has a different relationship to the untrusted renderer, and that is the
 * thing to keep straight when editing:
 *
 *  - `set-write-auto-approve` — ENABLING pops the un-spoofable window, so a renderer XSS
 *    cannot self-grant it. The handler returns the REAL resulting state, never the request.
 *  - `set-confirmation-mode` — main-owned + persisted. Upgrading is free; DOWNGRADING pops
 *    the same window. An unknown value reads as `renforce`: fail closed, and a no-op unless
 *    the user was already on `standard`.
 *  - `set-org-confirmation-floor` — unverified, and SAFE anyway: main composes it with the
 *    member's own mode by taking the STRICTER, so a forged floor can only ADD confirmations.
 *  - `set-org-allowed-connectors` — unverified and NOT self-securing: a renderer that clears
 *    it clears the policy. It still closes every non-XSS bypass the renderer-only filter
 *    left open (custom-server re-add, a direct call-tool, a route the loop's filter missed).
 *    `../mcp/orgPolicy.ts` states that boundary; don't let it drift into a claim of proof.
 *  - `keys:set-org-byo-allowed` — même régime : un compte géré n'écrit ni n'utilise de clé
 *    personnelle (`../store/keysPolicy.ts`). Non vérifiable par main, mais elle ferme
 *    l'écriture directe par IPC et l'injection d'une clé stockée AVANT l'adhésion.
 */
export function registerPostureIpc(): void {
  handle("mcp:set-write-auto-approve", [any], (_e, enable) => setWriteAutoApprove(enable === true));
  handle("mcp:set-confirmation-mode", [any], (_e, mode) =>
    setConfirmationMode(mode === "standard" ? "standard" : "renforce", confirmWrite),
  );
  handle("mcp:get-confirmation-mode", [], () => getConfirmationMode());
  handle("mcp:set-org-confirmation-floor", [nullable(str)], (_e, floor) => {
    setOrgConfirmationFloor(floor);
  });
  handle("mcp:set-org-allowed-connectors", [any], (_e, ids) => {
    setOrgAllowedConnectors(ids);
  });
  handle("keys:set-org-byo-allowed", [any], (_e, allowed) => {
    setOrgByoKeysAllowed(allowed);
  });
}

/**
 * MAIN's copy of "can this account use ITS OWN keys?".
 *
 * On an account managed by an organization, the answer is no: the organization provides the
 * models and pays for the calls, so a personal key would be an egress its policy
 * doesn't see — the member would bypass the allowed-models list simply by
 * pasting an OpenAI key. The UI says so and hides the keys grid, but a
 * UI is only a UI: the write and the INJECTION are refused here.
 *
 * This module lives beside the keys store it guards, not in the MCP family, because
 * a fail-closed check must be read in the same place as what it protects
 * (rule 10): whoever opens `keys.ts` sees the policy in the same folder.
 *
 * ⚠️ **Three states, not two**, and conflating them would reopen everything:
 * - `null` = never published (no profile pushed since launch) ⇒ **allowed**, otherwise
 *   a solo account would lose its keys for however long the renderer takes to start;
 * - `true` = known policy, personal keys allowed;
 * - `false` = managed account ⇒ **refused**.
 *
 * Like the connector policy, the value ARRIVES from the renderer and main can't
 * verify it: a renderer compromised enough to push `true` gets its keys back. What is
 * closed is everything else — a direct IPC call, a reopened modal, a key already
 * stored before joining the organization. The check that actually PROVES itself is
 * server-side: the gateway refuses a model outside the organization's allow-list.
 */

let byoAllowed: boolean | null = null;

/** Publish the posture. Anything that isn't a boolean clears the policy ("not
 *  known yet") rather than being guessed — a half-read policy looks enforced. */
export function setOrgByoKeysAllowed(value: unknown): boolean | null {
  byoAllowed = typeof value === "boolean" ? value : null;
  return byoAllowed;
}

/** Are personal keys refused? TRUE only on an explicit `false`. */
export function isByoKeysBlocked(): boolean {
  return byoAllowed === false;
}

/** The refusal returned to the renderer — it names the cause, not the plumbing: the
 *  person needs to know this isn't a bug and who to contact. */
export function byoKeysBlockedError(): Error {
  return new Error(
    "Les clés d'API personnelles sont désactivées par votre organisation. " +
      "Les modèles qu'elle a ouverts fonctionnent sans clé ; votre administrateur gère la liste.",
  );
}

/** Test seam. */
export function _resetKeysPolicy(): void {
  byoAllowed = null;
}

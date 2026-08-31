/**
 * Provenance ledger for the H-4 arg-exfil gate: the WIRE text of every connector tool
 * result, keyed by CONNECTOR (the `${server}__` tool-name prefix — never `serverId`,
 * which main collapses to one transport id for every connector).
 *
 * A call whose every string argument appears VERBATIM inside a prior result of the SAME
 * connector is the model ECHOING what that connector just told it — re-opening a path
 * `find_files` returned. Nothing new leaves the machine, so the « données glissées dans
 * les paramètres » card is a false alarm that trains the user to blind-click the one
 * card that must stay meaningful (journal 01/08: card on `read_document` for a path
 * the connector had just listed).
 *
 * Why this stays SOUND as an exemption (rule 7):
 * - Verbatim-only: a fake smuggled INSIDE a larger/composed arg breaks the verbatim
 *   test → still confirms. Fail-closed: an empty ledger exempts nothing.
 * - Per-connector: echoing connector A's data into connector B's args (cross-connector
 *   exfiltration) finds no ledger entry under B → still confirms.
 * - Wire-side on purpose: the ledger holds only REDACTED text, no real value.
 */
export class ResultEchoLedger {
  private byConnector = new Map<string, string[]>();

  record(connectorId: string, wireResult: string): void {
    if (!wireResult) return;
    const arr = this.byConnector.get(connectorId) ?? [];
    arr.push(wireResult);
    this.byConnector.set(connectorId, arr);
  }

  /** True when every non-blank STRING leaf of the WIRE args appears verbatim in a prior
   *  result of this connector. No string leaf at all ⇒ false (nothing proven). */
  allArgsEchoed(connectorId: string, args: unknown): boolean {
    const texts = this.byConnector.get(connectorId);
    if (!texts?.length) return false;
    const leaves: string[] = [];
    const walk = (v: unknown): void => {
      if (typeof v === "string") {
        if (v.trim()) leaves.push(v);
        return;
      }
      if (Array.isArray(v)) {
        v.forEach(walk);
        return;
      }
      if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    walk(args);
    if (!leaves.length) return false;
    return leaves.every((s) => texts.some((t) => t.includes(s)));
  }
}

/**
 * The « turnStatus » slice contract — the ONE slot under a reply where the app says
 * what became of the turn: it failed, it was cut off, it came back empty, one of its
 * tool steps broke, or the account's credits ran out. One component wears every
 * reason (`components/message/TurnStatus/`), so the words live together too.
 *
 * ⚠️ The eyebrows are STATUSES, not causes — « Clé requise » above a credits block was
 * lying about why the send failed (the key is a proposed way out). Each reason gets
 * its own word so the card never has to infer one from another.
 *
 * A SLICE of the contract (`../messages.ts`), which stays the only list of namespaces.
 */
export interface TurnStatusMessages {
  /** The short mono label above the card, by reason. */
  eyebrow: {
    sendBlocked: string;
    quota: string;
    keyRequired: string;
    planRequired: string;
    interrupted: string;
    empty: string;
    tool: string;
    limit: string;
  };
  /** The one « Réessayer » — the same word whatever the reason. */
  retry: string;
  fillKey: string;
  /** The card's sentence, by reason (a failed turn shows its persisted text instead). */
  failedDefault: string;
  interrupted: string;
  empty: string;
  toolFlowFailed: string;
  /** The amber credits card: real figures only, never an invented amount or date. */
  credits: {
    title: string;
    desc: (brand: string, keyName: string) => string;
    resetOn: (date: string) => string;
    useKey: (name: string) => string;
    useKeyTip: (name: string) => string;
    used: (amount: string) => string;
    left: (amount: string) => string;
  };
}

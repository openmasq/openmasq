// CAN THE PAGE CHANGE THE MASKING — and the answer is: it depends which way.
//
// The console is reached by a URL carrying a token, and that URL lands in browser history,
// on a shared screen, in `~/.openmasq/console.url`. The rule until now was that such a token
// authorises READING the log and nothing else, so every control in the configuration panel
// was inert.
//
// It cannot simply become live. The argument is NOT that the token is secret — the page
// already shows real values, so whoever holds it already sees local data. The argument is
// that the two directions are not the same act: reading the log shows what has ALREADY
// crossed, while lowering a level makes real data leave to a third party from then on. That
// is an escalation from "sees" to "causes", and it is the one a gate has to stand in.
//
// So the gate is ASYMMETRIC:
//
//   tightening — masks more — applies straight away. It can only reduce exposure, and
//                making protection hard to add is its own kind of bug.
//   loosening  — masks less — asks for a `y` on the TERMINAL, where the operator is, and
//                refuses without one.
//
// Which of the two a change is, is not read off the level name: `loosensMasking`
// (`@openmasq/catalog`) compares the category SETS, so staying at `strict` while adding one
// category to `disable` is caught for what it is.
//
// ⚠️ NO TTY MEANS NO, exactly as the MCP write gate decided (`../mcp/confirm.ts`, whose
// keystroke reader this borrows so two readers never fight over stdin). A proxy under a
// service manager, in CI, or behind `-- <tool>` has nobody to ask; a prompt nobody answers
// must not fall open.
import { type ConnectorMasking, loosensMasking, type RedactionLevel } from "@openmasq/catalog";
import { readKeyFrom } from "../mcp/confirm.js";

export interface MaskingChange {
  /** The connector this is about, or `""` for the run's own default. */
  connector: string;
  before: ConnectorMasking & { level: RedactionLevel };
  after: ConnectorMasking & { level: RedactionLevel };
}

export type GateVerdict = { ok: true } | { ok: false; why: string };

export interface MaskingGateOptions {
  note: (text: string, tone?: "info" | "warn" | "ok") => void;
  stdin?: NodeJS.ReadStream;
  /** No answer within this long ⇒ refused. */
  timeoutMs?: number;
  /** Injected by tests. */
  readKey?: (timeoutMs: number) => Promise<string>;
}

/** How a change reads on the terminal, in one line. Names the connector, because the operator
 *  is being asked about a server they may not have been thinking about. */
export function describeChange(c: MaskingChange): string {
  const who = c.connector || "every connector";
  const level =
    c.before.level === c.after.level ? c.after.level : `${c.before.level} → ${c.after.level}`;
  const added = (c.after.disable ?? []).filter((k) => !(c.before.disable ?? []).includes(k));
  const kept = (c.after.keep ?? []).filter((k) => !(c.before.keep ?? []).includes(k));
  const parts = [level];
  if (added.length) parts.push(`${added.join(", ")} in clear`);
  if (kept.length) parts.push(`${kept.length} value${kept.length > 1 ? "s" : ""} kept`);
  return `${who}: ${parts.join(", ")}`;
}

export function createMaskingGate(opts: MaskingGateOptions) {
  const stdin = opts.stdin ?? process.stdin;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const readKey = opts.readKey ?? ((ms: number) => readKeyFrom(stdin, ms));
  const interactive = !!stdin.isTTY;
  let queue: Promise<unknown> = Promise.resolve();

  const ask = async (c: MaskingChange): Promise<GateVerdict> => {
    if (!loosensMasking(c.before, c.after)) return { ok: true };
    if (!interactive)
      return {
        ok: false,
        why: "lowering the masking needs a terminal to confirm it, and this run has none",
      };
    opts.note("", "info");
    opts.note(`the live view asks to mask LESS — ${describeChange(c)}`, "warn");
    opts.note("  y to allow it, any other key to refuse");
    const key = await readKey(timeoutMs);
    if (key.toLowerCase() === "y") {
      opts.note(`masking lowered for ${c.connector || "the run"}`, "warn");
      return { ok: true };
    }
    opts.note(`refused${key ? "" : " (no answer)"} — masking unchanged`, "ok");
    return { ok: false, why: "not approved on the operator's terminal" };
  };

  /** Queued, like the write gate: a `y` typed at an ambiguous moment must not approve a
   *  change the operator never read. */
  return (c: MaskingChange): Promise<GateVerdict> => {
    const run = queue.then(() => ask(c));
    queue = run.catch(() => ({ ok: false as const, why: "the gate failed" }));
    return run;
  };
}

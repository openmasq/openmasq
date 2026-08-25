/**
 * The bridge between a provider's REFLECTION stream and the assistant bubble.
 *
 * Three jobs, none of which belong inline in the send orchestration:
 *
 *  1. **Un-redact.** The model reasons about the FAKES it was given, so the raw
 *     reflection is full of placeholders; it goes through the conversation's own
 *     `fromWire` exactly like the answer does. Rendering it raw would show the user
 *     invented names in place of their own data.
 *  2. **Throttle.** Reflection arrives token by token and un-redacting the whole
 *     accumulated text on every one is O(n²) plus a React render per token — the same
 *     reason the answer stream coalesces. One flush per `flushMs` instead.
 *  3. **Seal the turn.** `done()` cancels the pending flush and writes the reflection
 *     ONE last time, complete. It is KEPT from there on: the reflection is the only
 *     account of how a long turn was spent, and dropping it at the exact moment the
 *     answer appeared destroyed it just as the user became able to read it. The bubble
 *     shows it collapsed (`components/message/ReasoningPanel.tsx`) and the encrypted DB
 *     persists it (`@openmasq/schema` `Message.reasoning` — read the at-rest note there
 *     before mirroring it anywhere else).
 *
 * A turn that produced NO reflection writes nothing at all, so a non-reasoning model
 * leaves no empty field behind.
 *
 * Deltas are cumulative and arrive in order, so the relay only ever appends.
 */

/** ~1 flush per animation-ish frame budget: fast enough to read as live typing, cheap
 *  enough that a long reflection doesn't re-render the bubble hundreds of times. */
export const REASONING_FLUSH_MS = 90;

export interface ReasoningRelay {
  /** A wire-form delta straight off the provider stream. */
  push: (delta: string) => void;
  /** The turn is over (answer, error or Stop): flush the final text and stop. */
  done: () => void;
}

export function reasoningRelay(
  fromWire: (wire: string) => string,
  apply: (text: string) => void,
  flushMs: number = REASONING_FLUSH_MS,
): ReasoningRelay {
  let acc = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    timer = undefined;
    apply(fromWire(acc));
  };
  return {
    push: (delta) => {
      if (!delta) return;
      acc += delta;
      if (timer === undefined) timer = setTimeout(flush, flushMs);
    },
    done: () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      // The last deltas may never have been flushed (the timer was still pending when
      // the answer landed), so the seal is a WRITE, not just a stop — otherwise the
      // kept reflection is truncated at whatever the last tick happened to catch.
      if (acc) apply(fromWire(acc));
    },
  };
}

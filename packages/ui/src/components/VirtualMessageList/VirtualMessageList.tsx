import { Plain } from "./Plain";
import { Windowed } from "./Windowed";
import { CHAR_BUDGET, THRESHOLD, rendersWhole } from "./sizing";
import type { Props } from "./types";

/**
 * List virtualization for the message thread, so a heavy conversation doesn't bog
 * the UI down: only the messages near the viewport are mounted; the rest are
 * replaced by two spacer divs whose heights stand in for the hidden rows.
 *
 * It's GATED on TWO axes — see `sizing.ts` for why count alone is the wrong one,
 * and `sizing.test.ts` for what that pins. Under both, this renders exactly as
 * before (every bubble, no wrapper), so the common case is unchanged.
 *
 * Windowing uses natural flow + spacer heights (NOT absolute positioning), so
 * message margins, centering and any in-bubble overlay keep working. The parent's
 * "scroll to bottom on new message" effect still works because the spacers make the
 * container's scrollHeight match the full thread height.
 */
export function VirtualMessageList<T>(props: Props<T>) {
  // Both branches are components so hooks (the imperative handle) run
  // unconditionally within them; crossing the threshold remounts, which is fine.
  const whole = rendersWhole(
    props.items,
    props.sizeOf,
    props.threshold ?? THRESHOLD,
    props.charBudget ?? CHAR_BUDGET,
  );
  return whole ? <Plain {...props} /> : <Windowed {...props} />;
}

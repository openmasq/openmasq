import type { Host } from "@openmasq/ui";
import { UPDATES_CONFIGURED } from "../appEnv";

/**
 * The auto-update slot. Two conditions: a feed provided at build time (otherwise there is
 * NOTHING to query) and an up-to-date preload. Each method added later is OPTIONAL on the
 * preload side: a preload not restarted since lacks it, and the slot omits it rather than throw.
 */
export function updatesSlot(): Host["updates"] {
  const u = window.openmasq.updates;
  if (!UPDATES_CONFIGURED || !u) return undefined;
  return {
    current: () => u.current(),
    revealLog: u.revealLog ? () => u.revealLog!() : undefined,
    list: () => u.list(),
    permissions: () => u.permissions(),
    check: () => u.check(),
    pin: (version) => u.pin(version),
    setChannel: (channel) => u.setChannel(channel),
    listAll: () => u.listAll(),
    switchTo: (arg) => u.switchTo(arg),
    install: () => u.install(),
    onStatus: (cb) => u.onStatus(cb),
    // Absent ⇒ no « what's new » after an update.
    ...(u.justUpdated ? { justUpdated: () => u.justUpdated() } : {}),
    // Absent ⇒ "never auto-install" (main fail-closes on silence).
    ...(u.onQuiescenceAsk
      ? {
          onQuiescenceAsk: (cb: (askId: string) => void) => u.onQuiescenceAsk(cb),
          replyQuiescence: (askId: string, busy: boolean) => u.replyQuiescence(askId, busy),
        }
      : {}),
  };
}

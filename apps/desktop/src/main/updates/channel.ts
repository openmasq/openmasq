import { app } from "electron";
import { applyFeed, DEFAULT_CHANNEL, feedBase, getConfig, updateConfig } from "./config";

/** The desktop channels that exist server-side. An ALLOW-list, because the target
 *  comes from the renderer: an unknown value used to be persisted verbatim and
 *  pointed the feed at `<worker>/desktop/<whatever>`.
 *  The PUBLIC names (beta/stable — single artifact: the channel says which BUILDS we
 *  receive, not which environment) AND the historical names, which existing installs
 *  still persist — the Worker aliases both to the same lines
 *  (`apps/updates/src/lib/desktopChannels.ts`). */
const KNOWN_CHANNELS = new Set([
    "desktop-beta",
    "desktop-stable",
    "desktop-staging",
    "desktop-production",
]);

/** …plus whatever channel THIS build was baked with. A dry-run build ships a
 *  channel that deliberately doesn't exist server-side (`desktop-winci`), and it
 *  must still be able to keep — and return to — its own. */
const channelAllowed = (c: string): boolean => KNOWN_CHANNELS.has(c) || c === DEFAULT_CHANNEL;

export type ChannelVerdict =
    | { kind: "refuse"; reason: "unknown_channel" }
    | { kind: "allow"; channel: string }
    | { kind: "needs-permission"; channel: string };

/** PURE decision: may the renderer move this install to `wanted`?
 *
 *  ⚠️ **The channel no longer says the environment** — the sentence that used to live here claimed
 *  the opposite, and it had been stale since the single artifact: addresses are a
 *  baked table resolved at runtime (`src/environments/`), so a beta build points to
 *  PRODUCTION like the others, and "which API am I talking to" changes elsewhere,
 *  under its own right (`../ipc/registerEnvIpc.ts`). Conflating the two makes you
 *  look for the wrong privilege when a switch is refused.
 *
 *  What remains true, and why the gate doesn't move: changing channel decides
 *  which BUILDS this install will receive — an unproven candidate instead of the
 *  stable fleet, on someone's machine. The version picker only offers it to a
 *  device the operator has granted `allow_self_pin`, but an interface gate
 *  is UX (rule 7): an XSS in the renderer would call `updates:set-channel`
 *  directly, and the next unpinned check would simply serve the
 *  last build of the other channel.
 *
 *  Returning to this build's OWN baked channel never needs the permission: it
 *  undoes a switch rather than performing one, and refusing it would strand an
 *  install on a channel it can no longer leave. */
export function classifyChannelChange(args: {
    wanted: unknown;
    current: string;
    baked: string;
}): ChannelVerdict {
    const wanted = typeof args.wanted === "string" ? args.wanted.trim() : "";
    if (!wanted || !channelAllowed(wanted)) return { kind: "refuse", reason: "unknown_channel" };
    if (wanted === args.baked || wanted === args.current) return { kind: "allow", channel: wanted };
    return { kind: "needs-permission", channel: wanted };
}

/** Whether the updates Worker says THIS install may self-pin / switch.
 *
 *  The Worker is the authority (it enforces the same flag on the pinned feed);
 *  main asks it rather than trusting a renderer-supplied answer. Fail-safe to
 *  `false` on any error — an unreachable feed must not read as a grant. */
export async function selfPinAllowed(): Promise<boolean> {
    try {
        const cfg = getConfig();
        const res = await fetch(
            `${feedBase(cfg.channel)}/device/${encodeURIComponent(cfg.installId)}/permissions`,
        );
        if (!res.ok) return false;
        const body = (await res.json()) as { allow_self_pin?: boolean };
        return body?.allow_self_pin === true;
    } catch {
        return false;
    }
}

/** The gate + the effect, in one place so both IPC entry points (`set-channel`
 *  and `switch`) pass through it. Persists the channel and re-points the feed
 *  only once the move is permitted. */
export async function requestChannelChange(
    wanted: unknown,
): Promise<{ ok: boolean; reason?: string; channel: string }> {
    const current = getConfig().channel;
    const verdict = classifyChannelChange({ wanted, current, baked: DEFAULT_CHANNEL });
    if (verdict.kind === "refuse") return { ok: false, reason: verdict.reason, channel: current };
    if (verdict.kind === "needs-permission" && !(await selfPinAllowed())) {
        return { ok: false, reason: "not_privileged", channel: current };
    }
    const next = updateConfig({ channel: verdict.channel });
    if (app.isPackaged) applyFeed(next.channel);
    return { ok: true, channel: next.channel };
}

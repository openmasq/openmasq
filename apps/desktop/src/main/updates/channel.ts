import { app } from "electron";
import { applyFeed, DEFAULT_CHANNEL, feedBase, getConfig, updateConfig } from "./config";

/** The desktop channels that exist server-side. An ALLOW-list, because the target
 *  comes from the renderer: an unknown value used to be persisted verbatim and
 *  pointed the feed at `<worker>/desktop/<whatever>`.
 *  Les noms PUBLICS (beta/stable — artefact unique : le canal dit quels BUILDS on
 *  reçoit, plus quel environnement) ET les noms historiques, que les installs
 *  existantes persistent encore — le Worker aliase les deux sur les mêmes lignes
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
 *  ⚠️ **Le canal ne dit PLUS l'environnement** — la phrase qui vivait ici affirmait
 *  l'inverse, et elle était périmée depuis l'artefact unique : les adresses sont une
 *  table cuite résolue à l'exécution (`src/environments/`), donc un build bêta pointe
 *  la PRODUCTION comme les autres, et « à quelle API je parle » se change ailleurs,
 *  sous son propre droit (`../ipc/registerEnvIpc.ts`). Confondre les deux fait
 *  chercher le mauvais privilège quand une bascule est refusée.
 *
 *  Ce qui reste vrai, et pourquoi la garde ne bouge pas : changer de canal décide
 *  quels BUILDS cette install recevra — un candidat non éprouvé au lieu du parc
 *  stable, sur la machine de quelqu'un. Le sélecteur de versions ne l'offre qu'à un
 *  appareil à qui l'opérateur a accordé `allow_self_pin`, mais une porte d'interface
 *  est de l'UX (règle 7) : un XSS du renderer appellerait `updates:set-channel`
 *  directement, et la prochaine vérification non épinglée servirait simplement le
 *  dernier build de l'autre canal.
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

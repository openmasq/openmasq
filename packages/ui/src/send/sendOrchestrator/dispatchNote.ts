import type { TurnContext } from "./turnSetup";

/**
 * Connectors exist but the MODEL cannot do function calling: the plain stream is the
 * graceful degrade, and the Debug Log says why the connectors are unavailable this turn.
 */
export function plainStreamFallbackNote(ctx: TurnContext, usesTools: boolean): void {
  const { host } = ctx.d;
  if (host.mcp && host.completeTools && !usesTools) {
    ctx.dbg({
      type: "phase",
      scope: "loop",
      label: "outils indisponibles",
      detail: `${ctx.model.id} ne supporte pas l'appel d'outils — envoi simple sans connecteurs`,
    });
  }
}

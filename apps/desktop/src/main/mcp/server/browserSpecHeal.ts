import { addServer, getServer } from "../persist";
import { isBrowserAgentEnabled } from "../browser";
import { BROWSER_ID } from "./types";

/**
 * AUTO-RÉPARATION du spec navigateur, appelée par `setMcpUser` une fois la persistance
 * re-scopée au compte. L'opt-in est un drapeau MACHINE (`browser-agent.on`) mais le spec
 * vit dans le magasin PAR COMPTE — et la pré-connexion du renderer courait avant
 * l'adoption du compte : le drapeau s'écrivait, le spec partait dans un persist sans
 * scope (no-op), et chaque installation restait « optée-in, jamais connectée » (le modèle
 * réclamait « un accès au navigateur » à chaque question d'actualité). Ici on tourne dans
 * le bon scope : un compte auquel le spec manque le reçoit, et `mcpReconnectStored` le
 * connecte comme les autres. L'opt-out explicite (`mcpDisableBrowser`) retire drapeau ET
 * spec, donc il reste respecté ; signé-out (`userId` null) on n'ajoute rien.
 */
export function healBrowserSpec(userId: string | null): void {
  if (!userId || !isBrowserAgentEnabled() || getServer(BROWSER_ID)) return;
  addServer({ id: BROWSER_ID, connectorId: BROWSER_ID, name: "Navigateur", kind: "browser" });
}

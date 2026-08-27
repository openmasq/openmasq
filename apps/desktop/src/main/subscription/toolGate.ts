/**
 * L'ALLOW-LIST des outils d'un tour d'abonnement (règle 7) — et le filet qui la tient
 * quand la CLI de l'utilisateur n'est plus celle qu'on a mesurée.
 *
 * Ce qu'un tour a le droit d'avoir sous la main est EXACTEMENT le pont d'outils de
 * l'app (`toolsBridge.ts`), donc des noms préfixés `mcp__<serveur>__`. Le tour TEXTE
 * n'en a aucun, le tour OUTILLÉ n'a que ceux de son catalogue : dans les deux cas, tout
 * nom qui ne porte pas ce préfixe est un outil que la CLI s'est donné, pas un outil que
 * l'app a offert.
 *
 * ## Pourquoi une porte en plus des drapeaux
 *
 * `--tools ""` est la vraie allow-list de la CLI (mesuré 2.1.247 : `tools: []` au tour
 * texte, `["mcp__openmasq__…"]` au tour outillé) et c'est ELLE qui fait le travail. Mais
 * une liste de drapeaux est une promesse sur la version d'en face : le retrait par NOM
 * (`--disallowed-tools`) qui la précédait laissait 18 outils debout sur cette même
 * version — dont un qui prend une commande shell et rend sa sortie au modèle. Un nom qui
 * change, une capacité qui apparaît, et la garde retombe à zéro sans que rien ne le dise.
 *
 * D'où le filet : l'event `system/init` ANNONCE le périmètre du tour AVANT le premier
 * appel d'outil. On le lit, on le compare au préfixe du pont, et un intrus fait ÉCHOUER
 * le tour au lieu de le laisser courir. C'est la seule forme qui survive à la prochaine
 * version de la CLI, parce qu'elle juge ce qui EST là plutôt que ce qu'on a pensé à
 * retirer.
 *
 * ## La portée exacte de la porte, dite honnêtement
 *
 * Elle juge ce qui est ANNONCÉ. Un `tools` absent ou d'une autre forme ne rend AUCUN
 * verdict et laisse passer : le contrôle premier reste `--tools ""`, et celui-là est
 * auto-vérifiant — la CLI refuse un drapeau inconnu, donc une version qui le retirerait
 * ferait échouer le spawn bruyamment, pas silencieusement. Refuser sur un champ manquant
 * n'achèterait rien et couperait le chat au premier renommage de champ.
 *
 * Vaut pour claude (la seule CLI dont on a mesuré l'annonce). Côté codex l'isolement
 * tient à `CODEX_DISABLED_FEATURES` (`codexEngine.ts`) et son flux n'annonce pas de
 * périmètre : à re-mesurer avant d'y poser le même filet.
 */
import { TOOLS_SERVER_NAME } from "./toolsBridge";

/** Le préfixe que la CLI met devant chaque outil du pont (`mcp__<serveur>__<outil>`). */
const BRIDGE_PREFIX = `mcp__${TOOLS_SERVER_NAME}__`;

/** Combien de noms on cite dans le refus — assez pour diagnostiquer, borné pour rester lisible. */
const NAMED_IN_MESSAGE = 5;

/**
 * Les outils annoncés que l'app n'a PAS offerts. Vide = le périmètre est celui du pont
 * (y compris le tour texte, qui n'annonce rien). Une annonce d'une autre forme rend vide
 * elle aussi — pas de verdict, voir l'en-tête.
 */
export function unexpectedCliTools(announced: unknown): string[] {
  if (!Array.isArray(announced)) return [];
  return announced.filter((t): t is string => typeof t === "string" && !t.startsWith(BRIDGE_PREFIX));
}

/** Le refus, tel que l'utilisateur le lit. Nomme ce qui dépasse (borné) pour que le
 *  diagnostic ne demande pas de relancer avec un flux brut sous les yeux. */
export function cliToolGateMessage(unexpected: string[]): string {
  const shown = unexpected.slice(0, NAMED_IN_MESSAGE).join(", ");
  const rest = unexpected.length - NAMED_IN_MESSAGE;
  const list = rest > 0 ? `${shown} (+${rest})` : shown;
  return (
    "Tour refusé : la CLI expose des outils hors du périmètre de l'app " +
    `(${list}). Mettez l'application à jour, ou choisissez un autre modèle.`
  );
}

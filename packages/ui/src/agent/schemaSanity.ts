import type { McpTool } from "@openmasq/mcp";

/**
 * Assainir un `required` DÉGÉNÉRÉ dans le schéma d'un outil MCP distant.
 *
 * Le cas mesuré (journal du 13/08/2026, Intercom `search_conversations`) : le serveur
 * marque la quasi-totalité de ses ~45 propriétés « required ». Le modèle obéit et remplit
 * TOUT — `""`, `0`, `{">=", 0}` — le serveur traduit chaque champ fourni en clause de
 * requête, et l'API refuse (« composite query > 15 elements »). Six essais, six échecs :
 * irréparable de l'intérieur, parce que notre propre indice correctif (`argErrorHint`)
 * relit le même schéma et répète « (requis) » sur chaque champ.
 *
 * La règle : quand `required` couvre presque toutes les propriétés d'un objet qui en a
 * beaucoup, ce n'est pas une contrainte, c'est un bug de génération côté serveur — aucune
 * API de recherche n'exige 40 filtres. On retire alors la liste ENTIÈRE : le modèle ne
 * renseigne plus que les champs utiles, ce que tous ces serveurs acceptent. Un `required`
 * court et plausible (1-7 champs) n'est jamais touché.
 *
 * Pur, récursif, et paresseux sur l'identité : un schéma sain ressort par la MÊME
 * référence, donc rien n'est recopié sur le chemin nominal.
 */

const DEGENERATE_MIN = 8; // en dessous, une liste required est toujours plausible
const DEGENERATE_RATIO = 0.75; // au-delà de cette couverture des propriétés, c'est du bruit

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function sanitizeNode(node: unknown): unknown {
  if (!isObj(node)) return node;

  let out: Obj = node;
  const set = (key: string, value: unknown): void => {
    if (out === node) out = { ...node };
    out[key] = value;
  };

  const props = isObj(node.properties) ? node.properties : null;
  if (props && Array.isArray(node.required)) {
    const propCount = Object.keys(props).length;
    const req = node.required.filter((k): k is string => typeof k === "string");
    if (req.length >= DEGENERATE_MIN && propCount > 0 && req.length >= propCount * DEGENERATE_RATIO) {
      if (out === node) out = { ...node };
      delete out.required;
    }
  }

  if (props) {
    let nextProps: Obj = props;
    for (const [k, v] of Object.entries(props)) {
      const s = sanitizeNode(v);
      if (s !== v) {
        if (nextProps === props) nextProps = { ...props };
        nextProps[k] = s;
      }
    }
    if (nextProps !== props) set("properties", nextProps);
  }

  if (node.items !== undefined) {
    const s = sanitizeNode(node.items);
    if (s !== node.items) set("items", s);
  }

  return out;
}

/** Le point d'entrée de la boucle : chaque outil au schéma dégénéré ressort avec un
 *  `inputSchema` assaini ; les autres ressortent par la même référence. */
export function sanitizeToolSchemas(tools: McpTool[]): McpTool[] {
  let changed = false;
  const out = tools.map((t) => {
    const s = sanitizeNode(t.inputSchema);
    if (s === t.inputSchema) return t;
    changed = true;
    return { ...t, inputSchema: s as McpTool["inputSchema"] };
  });
  return changed ? out : tools;
}

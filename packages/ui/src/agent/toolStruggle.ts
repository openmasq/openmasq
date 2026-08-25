import { captureEvent } from "../analytics";
import { baseConnector } from "./humanToolLabel";

/**
 * **Who gets blamed when a turn's tool calls go wrong** — extracted from the loop
 * (rule 1) because it is one concern with one rule, and getting it wrong is expensive
 * in a specific way: the caption tells the user what to DO, and three of the four kinds
 * must NOT say « changez de modèle ».
 *
 * Precedence, most-specific first — and each level exists because the one below it was
 * being told in its place:
 *   1. `unknown_tool`  — the model invented a tool. No model can call what doesn't exist.
 *   2. `arg_error`     — it malformed the arguments and never recovered. Genuinely the
 *                        model, and genuinely worth a more capable one.
 *   3. `connector_error` — the connector refused a call whose arguments matched its OWN
 *                        schema (`toolFault.ts`). A capable model sends the same call.
 *   4. `no_tool_used`  — it declined in prose with tools available, even when forced.
 *
 * Fires at most ONCE per turn (`fired`), and never for a tool that also SUCCEEDED — a
 * retry loop that recovered is not a struggle.
 */
export interface ToolStruggle {
  server: string;
  tool: string;
  kind: "arg_error" | "no_tool_used" | "unknown_tool" | "connector_error";
}

/**
 * **Le connecteur fautif se lit du NOM de l'outil, jamais de `serverId`.** Le client MCP
 * n'a qu'UNE connexion et réécrit chaque `serverId` en son id de transport (« ipc ») —
 * la légende annonçait donc « Ipc a refusé l'appel… » et le bouton « Reconnecter »
 * ouvrait la fiche d'un connecteur qui n'existe pas. Le nom porte l'identité (le même
 * pin que `connectorIdsFromTools`), et le suffixe multi-compte tombe avec
 * `baseConnector` : c'est la FICHE qu'on ouvre, pas un compte en particulier.
 *
 * `fallback` sert aux noms nus (nos outils interceptés) : eux n'ont pas de préfixe.
 */
export function connectorOfTool(tool: string, fallback: string): string {
  const i = tool.indexOf("__");
  return i > 0 ? baseConnector(tool.slice(0, i)) : fallback;
}

export interface StruggleReporter {
  /** Tools that returned a good result — read by `exhaustionMessage` too. */
  readonly succeeded: Set<string>;
  /** Tools the model kept malforming — same. */
  readonly argErrored: Set<string>;
  /** Tools that refused a WELL-FORMED call. */
  readonly connectorErrored: Set<string>;
  /** Has a struggle already been reported this turn? */
  readonly fired: boolean;
  /** The model called a tool that does not exist. */
  markUnknownTool(tool: string): void;
  /** It declined in prose with tools available (`tool` is empty by contract). */
  reportNoToolUsed(): void;
  /** Report the most specific struggle that applies, once. */
  emit(): void;
}

export function makeStruggleReporter(p: {
  serverOf: (tool: string) => string;
  onToolStruggle?: (info: ToolStruggle) => void;
  provider: string;
  modelId: string;
  loopId?: string;
}): StruggleReporter {
  const succeeded = new Set<string>();
  const argErrored = new Set<string>();
  const connectorErrored = new Set<string>();
  let fired = false;
  let unknownTool = "";

  const fire = (tool: string, kind: ToolStruggle["kind"], eventTool = tool) => {
    fired = true;
    const server = connectorOfTool(tool, p.serverOf(tool));
    p.onToolStruggle?.({ server, tool, kind });
    captureEvent({
      name: "tool_struggle",
      server,
      tool: eventTool,
      // La moitié actionnable : COMMENT le modèle a peiné — calculée depuis toujours
      // pour l'UI, jamais transmise (audit 13/08).
      kind,
      provider: p.provider,
      model: p.modelId,
      loopId: p.loopId,
    });
  };

  return {
    succeeded,
    argErrored,
    connectorErrored,
    get fired() {
      return fired;
    },
    markUnknownTool: (tool) => {
      unknownTool = tool;
    },
    reportNoToolUsed: () => {
      if (fired) return;
      fired = true;
      p.onToolStruggle?.({ server: "mcp", tool: "", kind: "no_tool_used" });
      captureEvent({
        name: "tool_struggle",
        server: "mcp",
        tool: "(none)",
        kind: "no_tool_used",
        provider: p.provider,
        model: p.modelId,
      loopId: p.loopId,
      });
    },
    emit: () => {
      if (fired) return;
      if (unknownTool) return fire(unknownTool, "unknown_tool");
      for (const [pool, kind] of [
        [argErrored, "arg_error"],
        [connectorErrored, "connector_error"],
      ] as const) {
        for (const tool of pool) {
          if (succeeded.has(tool)) continue;
          return fire(tool, kind);
        }
      }
    },
  };
}

/**
 * Le pont d'outils du tour ABONNEMENT : un serveur MCP minimal, en loopback, que la CLI
 * de l'utilisateur appelle pendant UN tour — et qui ne fait qu'une chose : CAPTURER
 * l'appel d'outil au lieu de l'exécuter.
 *
 * C'est la pièce qui rend le chemin CLI identique au chemin API (exigence produit) :
 * la boucle agentique de OpenMasq reste MAÎTRE. La CLI n'est qu'une primitive de
 * complétion — quand son modèle veut un outil, l'appel est rendu à NOTRE boucle
 * (`mcpAgent`), qui fait exactement ce qu'elle fait pour un modèle API : un-redact
 * les arguments avec le coffre, passer la porte d'écriture, exécuter via le client MCP
 * redacting, re-redact le résultat. Rien de tout cela n'est dupliqué ici (règle 9) ;
 * ce module ne voit passer que des arguments ENCORE redacted.
 *
 * Mesuré (CLI 2.1.246) : un `--mcp-config` de type `http` sur 127.0.0.1 avec en-tête
 * `Authorization: Bearer …` se connecte, liste et appelle — aucun process relais ni
 * asset empaqueté n'est nécessaire. La CLI émet aussi `server/discover` avant
 * `initialize` : toute méthode inconnue portant un id reçoit un résultat vide plutôt
 * qu'une erreur, sinon la connexion échoue.
 *
 * Frontière (règle 7) :
 * - lié à 127.0.0.1 uniquement, port éphémère, UN tour = UN serveur + UN jeton jetable ;
 * - jeton exigé sur CHAQUE requête, vérifié avant toute lecture du corps (fail closed) —
 *   n'importe quel process local peut atteindre un port loopback ;
 * - un nom d'outil hors catalogue est REFUSÉ en erreur JSON-RPC, jamais capturé : le
 *   modèle se corrige dans son tour, et rien d'inconnu n'atteint la boucle ;
 * - `close()` détruit les réponses en attente — la CLI tuée ne laisse aucun socket ouvert.
 */
import { randomBytes } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { ToolDef } from "@openmasq/llm";

/** Un appel capturé — le nom RÉEL (sans le préfixe `mcp__<serveur>__` de la CLI) et des
 *  arguments encore redacted, déjà parsés. */
export interface CapturedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolsBridge {
  /** L'URL à écrire dans le `--mcp-config` de la CLI. */
  url: string;
  /** Le jeton Bearer attendu — à écrire dans le fichier de config (0600), JAMAIS en argv. */
  token: string;
  /** Résout au PREMIER appel d'outil valide. Ne résout jamais si le tour finit en texte. */
  nextCall(): Promise<CapturedToolCall>;
  close(): void;
}

const JSONRPC = "2.0";

function reply(res: ServerResponse, id: unknown, body: Record<string, unknown>): void {
  res
    .writeHead(200, { "content-type": "application/json" })
    .end(JSON.stringify({ jsonrpc: JSONRPC, id, ...body }));
}

/** Démarre le pont pour un tour. `tools` est le catalogue de CE tour, noms réels. */
export function startToolsBridge(tools: ToolDef[]): Promise<ToolsBridge> {
  const token = randomBytes(24).toString("hex");
  const known = new Map(tools.map((t) => [t.name, t]));
  const parked = new Set<ServerResponse>();

  let capture: ((call: CapturedToolCall) => void) | null = null;
  const first = new Promise<CapturedToolCall>((resolve) => {
    let done = false;
    capture = (call) => {
      if (done) return; // un 2ᵉ appel pendant l'arrêt : ignoré, la CLI est déjà condamnée
      done = true;
      resolve(call);
    };
  });

  const server: Server = createServer((req, res) => {
    // Le jeton d'abord, avant de lire quoi que ce soit : un port loopback est joignable
    // par tout process local — sans Bearer valide il n'existe pas de requête.
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end();
      return;
    }
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(body) as Record<string, unknown>;
      } catch {
        res.writeHead(400).end();
        return;
      }
      const params = (msg.params ?? {}) as Record<string, unknown>;
      switch (msg.method) {
        case "initialize":
          reply(res, msg.id, {
            result: {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "openmasq-tools", version: "1" },
            },
          });
          return;
        case "tools/list":
          reply(res, msg.id, {
            result: {
              tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: t.parameters,
              })),
            },
          });
          return;
        case "tools/call": {
          const name = typeof params.name === "string" ? params.name : "";
          if (!known.has(name)) {
            // Refus, pas capture : un nom halluciné revient au modèle comme une erreur
            // d'outil et il se corrige — la boucle ne voit jamais d'inconnu.
            reply(res, msg.id, {
              error: { code: -32602, message: `Outil inconnu : ${name}` },
            });
            return;
          }
          const args =
            params.arguments && typeof params.arguments === "object"
              ? (params.arguments as Record<string, unknown>)
              : {};
          // PARQUÉ : on ne répond pas — le tour v1 tue la CLI sitôt l'appel capturé et
          // la boucle re-soumet l'historique complet au tour suivant (même contrat
          // sans état que tous les autres providers). `close()` détruit la réponse.
          parked.add(res);
          res.on("close", () => parked.delete(res));
          capture?.({ name, arguments: args });
          return;
        }
        default:
          // `server/discover`, `notifications/*`… — un id ⇒ résultat vide (mesuré :
          // une erreur ici fait échouer la connexion), sans id ⇒ 202 nu.
          if (msg.id !== undefined) reply(res, msg.id, { result: {} });
          else res.writeHead(202).end();
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr === null || typeof addr === "string") {
        reject(new Error("port du pont d'outils indisponible"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}/mcp`,
        token,
        nextCall: () => first,
        close: () => {
          for (const res of parked) res.destroy();
          parked.clear();
          server.close();
        },
      });
    });
  });
}

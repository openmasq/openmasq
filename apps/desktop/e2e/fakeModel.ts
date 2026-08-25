import { createServer, type Server } from "node:http";

/** Ce qu'un faux modèle a encaissé, et de quoi le refermer. */
export interface FakeModel {
  /** `baseUrl` à poser dans `openaiCompatBaseUrl` — jamais rien d'autre que 127.0.0.1. */
  url: string;
  /** Les corps de requête bruts reçus, dans l'ordre : LE wire, pas un état du renderer. */
  bodies: string[];
  close: () => Promise<void>;
}

/**
 * Un endpoint OpenAI-compatible minimal, sur la boucle locale : il encaisse la requête et
 * répond du vide. C'est exactement l'usage du provider `openai-compat` (Ollama, LM Studio),
 * donc rien n'est simulé côté app.
 *
 * Pourquoi il existe : juger ce que le pipeline construit APRÈS redaction — le wire réel —
 * sans clé, sans réseau et sans coût. Ce qu'il RÉPOND n'a aucune importance, ce qu'il REÇOIT
 * est tout le sujet. Le `/models` est servi parce que l'app sonde l'accessibilité et grise
 * sinon le modèle (« injoignable »), ce qui ferait échouer l'envoi avant le wire.
 */
export async function startFakeModel(modelId = "llama3.3"): Promise<FakeModel> {
  const bodies: string[] = [];
  const server: Server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (body) bodies.push(body);
      if (req.url?.includes("/models")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: modelId }] }));
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  return {
    url: `http://127.0.0.1:${port}/v1`,
    bodies,
    close: () => new Promise((r) => server.close(() => r())),
  };
}

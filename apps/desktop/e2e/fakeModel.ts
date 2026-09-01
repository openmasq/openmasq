import { createServer, type Server } from "node:http";

/** What a fake model has taken in, and how to close it. */
export interface FakeModel {
  /** `baseUrl` to set in `openaiCompatBaseUrl` — never anything but 127.0.0.1. */
  url: string;
  /** The raw request bodies received, in order: THE wire, not a renderer state. */
  bodies: string[];
  close: () => Promise<void>;
}

/**
 * A minimal OpenAI-compatible endpoint, on the local loop: it takes in the request and
 * answers with nothing. It's exactly the use of the `openai-compat` provider (Ollama, LM Studio),
 * so nothing is simulated app-side.
 *
 * Why it exists: to judge what the pipeline builds AFTER redaction — the real wire —
 * with no key, no network and no cost. What it ANSWERS doesn't matter at all, what it RECEIVES
 * is the whole point. `/models` is served because the app probes reachability and otherwise
 * greys out the model ("unreachable"), which would fail the send before the wire.
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

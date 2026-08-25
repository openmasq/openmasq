// A scripted OpenAI-compatible model server (HTTP, localhost) — the FREE "model".
//
// Both harness levels point `provider: "openai-compat"` + `baseUrl` at it, so the REAL
// provider client (`@openmasq/llm` completeWithTools / streamChat) runs against real
// HTTP — the wiring under test is identical to production, only the intelligence is
// scripted. Deterministic and free: this is what lets the workflow suites run on every
// commit while `*.eval.ts` (a real model) stays env-gated.
//
// A turn is either a static assistant message (`says`/`calls`) or a FUNCTION of the
// request body — for the cases where the script must echo what it was shown (e.g. "reply
// with the fake you received", proving the model only ever holds fakes).

import { createServer } from "node:http";

export type MockRequest = {
  messages: { role: string; content: string | null; tool_call_id?: string }[];
  tools?: { function: { name: string } }[];
  stream?: boolean;
};

/** The concrete assistant message (OpenAI chat.completion `message` shape). */
export type MockMessage = { role: "assistant"; content: string | null; tool_calls?: object[] };
/** One scripted turn: a static message, or a function of the request the "model" saw. */
export type MockTurn = MockMessage | ((req: MockRequest) => MockMessage);

/** A prose turn. */
export const says = (text: string): MockMessage => ({ role: "assistant", content: text });

/** A tool-call turn (one or more calls in the same turn). */
export const calls = (...list: { name: string; args: Record<string, unknown> }[]): MockMessage => ({
  role: "assistant",
  content: null,
  tool_calls: list.map((c, i) => ({
    id: `mock-${i}`,
    type: "function",
    function: { name: c.name, arguments: JSON.stringify(c.args) },
  })),
});

export interface MockModel {
  /** Base URL to hand the provider client (`http://127.0.0.1:<port>/v1`). */
  url: string;
  /** Every request body the "model" received, in order — the model's inbox, as seen
   *  from the OTHER side of the real HTTP client. */
  requests: MockRequest[];
  close: () => void;
}

/**
 * Start the server with a turn script. Turns are consumed in order; past the end it
 * answers a terminal empty stop (so an unscripted extra call ends the loop instead of
 * crashing the suite cryptically). Supports the non-streaming AND the SSE streaming
 * shape — the store's plain path streams, the tool loop may not.
 */
export function mockModel(turns: MockTurn[]): Promise<MockModel> {
  let i = 0;
  const requests: MockRequest[] = [];
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const parsed = JSON.parse(body || "{}") as MockRequest;
        requests.push(parsed);
        const raw = turns[i++] ?? says("");
        const msg = typeof raw === "function" ? raw(parsed) : raw;
        const finish = msg.tool_calls?.length ? "tool_calls" : "stop";
        if (parsed.stream) {
          // Minimal SSE: role delta → content/tool_calls delta → finish → usage → DONE.
          res.writeHead(200, { "content-type": "text/event-stream" });
          const chunk = (delta: object, finish_reason: string | null = null) =>
            res.write(
              `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", model: "mock", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
            );
          chunk({ role: "assistant" });
          if (msg.content) chunk({ content: msg.content });
          if (msg.tool_calls?.length) {
            msg.tool_calls.forEach((tc, idx) => chunk({ tool_calls: [{ index: idx, ...(tc as object) }] }));
          }
          chunk({}, finish);
          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(
            JSON.stringify({
              id: "x",
              object: "chat.completion",
              model: "mock",
              choices: [{ index: 0, message: msg, finish_reason: finish }],
              usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }),
          );
        }
      });
    });
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}/v1`, requests, close: () => srv.close() });
    });
  });
}

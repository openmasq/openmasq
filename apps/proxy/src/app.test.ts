import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "./app";
import { DEFAULTS } from "./config/config";
import { type RequestEvent, silentReporter } from "./lib/ui";
import type { Masker } from "./lib/masker";

// A masker that swaps one name for one fake — the engine is tested in `@openmasq/redact`;
// what is pinned HERE is the wiring: what leaves, what comes back, what is refused.
const REAL = "Camille Roussel";
const FAKE = "Marc Charvet";
const masker: Masker = {
  async mask(text, vault) {
    if (!text.includes(REAL)) return { text, matches: [] };
    vault[FAKE] = REAL;
    return {
      text: text.split(REAL).join(FAKE),
      matches: [{ type: "name", value: REAL, placeholder: FAKE, category: "name" } as never],
    };
  },
  restoreReply: (t, v) => Object.entries(v).reduce((s, [f, r]) => s.split(f).join(r), t),
  restoreArgs: (t, v) => Object.entries(v).reduce((s, [f, r]) => s.split(f).join(r), t),
};

let upstream: Server;
let proxy: Server;
let seen: { path: string; body: string; auth?: string }[] = [];
const port = (s: Server) => (s.address() as AddressInfo).port;

beforeAll(async () => {
  upstream = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ path: req.url ?? "", body, auth: req.headers.authorization });
      if (req.url === "/v1/models")
        return res.writeHead(200, { "content-type": "application/json" }).end('{"data":[]}');
      const parsed = body ? JSON.parse(body) : {};
      if (parsed.stream) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const chunk = (content: string, finish: string | null) =>
          `data: ${JSON.stringify({ id: "c", object: "chat.completion.chunk", choices: [{ index: 0, delta: { content }, finish_reason: finish }] })}\n\n`;
        res.write(chunk("Hello Marc ", null));
        res.write(chunk("Char", null));
        res.write(chunk("vet!", null));
        res.write(chunk("", "stop"));
        res.end("data: [DONE]\n\n");
        return;
      }
      if (req.url?.startsWith("/v1beta/models/")) {
        return res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            candidates: [{ index: 0, content: { role: "model", parts: [{ text: `Hi ${FAKE}` }] } }],
          }),
        );
      }
      if (req.url === "/v1/messages") {
        return res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ content: [{ type: "text", text: `Hi ${FAKE}` }] }));
      }
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          choices: [{ index: 0, message: { role: "assistant", content: `Hi ${FAKE}` } }],
        }),
      );
    });
  });
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${port(upstream)}`;
  const app = createApp({
    config: { ...DEFAULTS, openai: origin, anthropic: origin, gemini: origin, rulesOnly: true },
    masker,
    reporter: { ...silentReporter, request: (e) => reported.push(e) },
  });
  proxy = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => proxy.once("listening", () => r()));
});
afterAll(() => {
  proxy.close();
  upstream.close();
});

const reported: RequestEvent[] = [];
const call = (path: string, init: RequestInit = {}) =>
  fetch(`http://127.0.0.1:${port(proxy)}${path}`, init);
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  call(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("proxy app", () => {
  it("masks what leaves, restores what comes back, and forwards the caller's key untouched", async () => {
    seen = [];
    const res = await post(
      "/v1/chat/completions",
      { messages: [{ role: "user", content: `Write to ${REAL}` }] },
      { authorization: "Bearer sk-caller" },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-openmasq-masked")).toBe("1");
    expect(seen[0].body).toContain(FAKE);
    expect(seen[0].body).not.toContain(REAL);
    expect(seen[0].auth).toBe("Bearer sk-caller");
    const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
    expect(json.choices[0].message.content).toBe(`Hi ${REAL}`);
  });

  it("restores a streamed reply frame by frame, never releasing a half fake", async () => {
    const res = await post("/v1/chat/completions", {
      stream: true,
      messages: [{ role: "user", content: `Hi ${REAL}` }],
    });
    const text = await res.text();
    const pieces = text
      .split("\n\n")
      .filter((f) => f.startsWith("data: ") && !f.includes("[DONE]"))
      .map(
        (f) =>
          (JSON.parse(f.slice(6)) as { choices: Array<{ delta: { content?: string } }> }).choices[0]
            .delta.content ?? "",
      );
    expect(pieces.join("")).toBe(`Hello ${REAL}!`);
    for (const p of pieces) expect(p).not.toMatch(/Marc|Charvet/);
    expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
  });

  it("routes /v1/messages to the Anthropic family, and honours an explicit family prefix", async () => {
    seen = [];
    const res = await post(
      "/v1/messages",
      { messages: [{ role: "user", content: REAL }] },
      { "x-api-key": "k" },
    );
    expect(((await res.json()) as { content: Array<{ text: string }> }).content[0].text).toBe(
      `Hi ${REAL}`,
    );
    expect(seen[0].path).toBe("/v1/messages");
    await post("/anthropic/v1/messages", { messages: [{ role: "user", content: REAL }] });
    expect(seen[1].path).toBe("/v1/messages"); // the prefix never reaches the upstream
  });

  it("routes a Gemini generateContent path (model name with a colon) and restores its candidates", async () => {
    seen = [];
    const res = await post("/v1beta/models/gemini-2.5-pro:generateContent?key=k", {
      contents: [{ role: "user", parts: [{ text: REAL }] }],
    });
    expect(res.status).toBe(200);
    expect(seen[0].path).toBe("/v1beta/models/gemini-2.5-pro:generateContent?key=k");
    // the audit line never carries the query string: a Gemini key travels in `?key=`
    expect(reported.at(-1)).toMatchObject({
      path: "/v1beta/models/gemini-2.5-pro:generateContent",
      family: "gemini",
      status: 200,
    });
    expect(JSON.stringify(reported.at(-1))).not.toContain("key=");
    expect(seen[0].body).toContain(FAKE);
    expect(seen[0].body).not.toContain(REAL);
    expect(
      ((await res.json()) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> })
        .candidates[0].content.parts[0].text,
    ).toBe(`Hi ${REAL}`);
    const noSse = await post("/v1beta/models/gemini-2.5-pro:streamGenerateContent", {
      contents: [],
    });
    expect(noSse.status).toBe(501);
    expect(((await noSse.json()) as { error: { message: string } }).error.message).toMatch(
      /alt=sse/,
    ); // the Gemini command's refusal, not the passthrough's
  });

  it("keeps one vault per x-openmasq-session across requests", async () => {
    const h = { "x-openmasq-session": "abc" };
    await post("/v1/chat/completions", { messages: [{ role: "user", content: REAL }] }, h);
    const res = await post(
      "/v1/chat/completions",
      { messages: [{ role: "user", content: "Anything" }] },
      h,
    );
    // The second turn had nothing to mask, yet the session's vault still restores the reply.
    expect(
      ((await res.json()) as { choices: Array<{ message: { content: string } }> }).choices[0]
        .message.content,
    ).toBe(`Hi ${REAL}`);
  });

  /**
   * ⚠️ REGRESSION. A wrapped client is pointed at `/s/<session>` (`lib/attach.ts`), so it
   * POSTs to `/s/claude-x/v1/messages`. That prefix addresses THIS proxy, never the vendor —
   * forwarded verbatim it is a 404 at the upstream, which a coding agent reads as "the model
   * does not exist". The upstream must receive the bare `/v1/messages`, and the reply must
   * still restore under that session's vault.
   */
  it("strips the /s/<session> prefix before forwarding, and still masks and restores", async () => {
    const before = seen.length;
    const res = await post("/s/claude-7ad2/v1/messages", {
      model: "claude-3-5-haiku-20241022",
      max_tokens: 8,
      messages: [{ role: "user", content: `Bonjour ${REAL}` }],
    });
    expect(res.status).toBe(200); // not the upstream 404 of a path that carries the prefix
    const sent = seen[before];
    expect(sent.path).toBe("/v1/messages"); // the vendor never sees /s/<session>
    expect(sent.body).not.toContain(REAL); // the model saw the fake
    expect(sent.body).toContain(FAKE);
    // …and the reply came back with the real value, under this session's vault.
    const reply = (await res.json()) as { content: Array<{ text: string }> };
    expect(reply.content[0].text).toContain(REAL);
  });

  it("refuses a POST it cannot mask, passes a GET through, and reports health", async () => {
    expect((await post("/v1/files", {})).status).toBe(501);
    expect((await call("/v1/chat/completions", { method: "POST", body: "not json" })).status).toBe(
      400,
    );
    expect((await call("/v1/models")).status).toBe(200);
    // `console: false` is what `openmasq-proxy console` reads before it opens a link: an app
    // built without a console says so.
    expect(await (await call("/healthz")).json()).toMatchObject({
      ok: true,
      ner: false,
      console: false,
      pid: process.pid,
    });
  });

  /** Claude Code asks `HEAD /api/hello` of its base URL before the first call — a question
   *  about THIS endpoint. Relayed, it reached a vendor with no such path, came back 404, and
   *  sat in the journal under a family it never belonged to. */
  it("answers a client's liveness probe itself, and files it as a probe", async () => {
    const before = seen.length;
    expect((await call("/api/hello", { method: "HEAD" })).status).toBe(200);
    expect(seen.length).toBe(before); // never relayed
    expect(reported[reported.length - 1]).toMatchObject({ path: "/api/hello", family: "probe" });
  });
});

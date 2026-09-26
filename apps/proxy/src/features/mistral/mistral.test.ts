import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../app";
import { DEFAULTS } from "../../config/config";
import { silentReporter } from "../../lib/ui";
import type { Masker } from "../../lib/masker";

// Two upstreams on purpose: what is pinned is that `/mistral` reaches MISTRAL's origin and
// nothing else, masked like any chat — and that `/blocked` reaches nobody.
const REAL = "Camille Roussel";
const FAKE = "Marc Charvet";
const masker: Masker = {
  async mask(text, vault) {
    if (!text.includes(REAL)) return { text, matches: [] };
    vault[FAKE] = REAL;
    return {
      text: text.split(REAL).join(FAKE),
      matches: [
        {
          type: "name",
          value: REAL,
          placeholder: FAKE,
          category: "name",
        } as never,
      ],
    };
  },
  restoreReply: (t, v) => Object.entries(v).reduce((s, [f, r]) => s.split(f).join(r), t),
  restoreArgs: (t, v) => Object.entries(v).reduce((s, [f, r]) => s.split(f).join(r), t),
};

const seen: Record<"openai" | "mistral", { path: string; body: string }[]> = {
  openai: [],
  mistral: [],
};
const upstream = (family: "openai" | "mistral") =>
  createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen[family].push({ path: req.url ?? "", body });
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: [
                  {
                    type: "thinking",
                    thinking: [{ type: "text", text: `About ${FAKE}` }],
                  },
                  { type: "text", text: `Hi ${FAKE}` },
                ],
                tool_calls: [
                  {
                    id: "t",
                    function: { name: "mail", arguments: { to: FAKE } },
                  },
                ],
              },
            },
          ],
        }),
      );
    });
  });

let openai: Server, mistral: Server, proxy: Server;
const port = (s: Server) => (s.address() as AddressInfo).port;
const listen = (s: Server) => new Promise<void>((r) => s.listen(0, "127.0.0.1", r));

beforeAll(async () => {
  openai = upstream("openai");
  mistral = upstream("mistral");
  await Promise.all([listen(openai), listen(mistral)]);
  const app = createApp({
    config: {
      ...DEFAULTS,
      openai: `http://127.0.0.1:${port(openai)}`,
      mistral: `http://127.0.0.1:${port(mistral)}`,
      rulesOnly: true,
    },
    masker,
    reporter: silentReporter,
  });
  proxy = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => proxy.once("listening", () => r()));
});
afterAll(() => [proxy, openai, mistral].forEach((s) => s.close()));

const post = (path: string, body: unknown) =>
  fetch(`http://127.0.0.1:${port(proxy)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("the mistral family", () => {
  it("relays /mistral/v1/chat/completions to Mistral's origin — masked, prefix stripped", async () => {
    const res = await post("/s/vibe-1/mistral/v1/chat/completions", {
      messages: [
        { role: "user", content: `Write to ${REAL}` },
        {
          role: "assistant",
          content: [
            {
              type: "thinking",
              thinking: [{ type: "text", text: `${REAL} again` }],
            },
          ],
          tool_calls: [{ id: "t", function: { name: "mail", arguments: { to: REAL } } }],
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(seen.openai).toHaveLength(0);
    expect(seen.mistral.at(-1)?.path).toBe("/v1/chat/completions");
    // The thinking part and the OBJECT arguments are masked like the user text.
    expect(seen.mistral.at(-1)?.body).not.toContain(REAL);
    const json = JSON.stringify(await res.json());
    expect(json).not.toContain(FAKE);
    expect(json).toContain(`About ${REAL}`);
    expect(json).toContain(`"to":"${REAL}"`);
  });

  it("is not served at the root: those paths are OpenAI's", async () => {
    await post("/v1/chat/completions", {
      messages: [{ role: "user", content: "hi" }],
    });
    expect(seen.openai.at(-1)?.path).toBe("/v1/chat/completions");
  });

  it("refuses a Mistral POST it has no masked command for, instead of relaying it", async () => {
    const before = seen.mistral.length;
    const res = await post("/mistral/v1/fim/completions", { prompt: REAL });
    expect(res.status).toBe(501);
    expect(seen.mistral).toHaveLength(before);
  });
});

describe("/blocked", () => {
  it("answers 403 to every method and relays nothing", async () => {
    const before = seen.openai.length + seen.mistral.length;
    for (const [path, method] of [
      ["/s/vibe-1/blocked/tts/mistral/v1/audio/speech", "POST"],
      ["/blocked/provider/openrouter/v1/models", "GET"],
    ] as const) {
      const res = await fetch(`http://127.0.0.1:${port(proxy)}${path}`, {
        method,
        ...(method === "POST"
          ? {
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ input: REAL }),
            }
          : {}),
      });
      expect(res.status).toBe(403);
    }
    expect(seen.openai.length + seen.mistral.length).toBe(before);
  });
});

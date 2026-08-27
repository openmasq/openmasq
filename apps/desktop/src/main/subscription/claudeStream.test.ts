// Formes relevées sur la CLI 2.1.241. Le cas central : la CLI émet les deltas PUIS un
// event `assistant` qui répète toute la réponse — un parser naïf l'affiche en double.
import { describe, expect, it } from "vitest";
import { NdjsonLineBuffer, interpretClaudeEvent, normalizeUsage, toFinish } from "./claudeStream";

const delta = (text: string) => ({
  type: "stream_event",
  event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } },
});

describe("interpretClaudeEvent", () => {
  it("rend le texte d'un content_block_delta", () => {
    expect(interpretClaudeEvent(delta("La"), false)).toEqual({ kind: "text", delta: "La" });
  });

  it("JETTE l'event assistant final quand les deltas ont déjà tout streamé", () => {
    const assistant = {
      type: "assistant",
      message: { content: [{ type: "text", text: "La mer respire." }] },
    };
    expect(interpretClaudeEvent(assistant, true)).toBeNull();
  });

  it("mais l'utilise en FILET si aucun delta n'est passé", () => {
    const assistant = {
      type: "assistant",
      message: { content: [{ type: "text", text: "La mer respire." }] },
    };
    expect(interpretClaudeEvent(assistant, false)).toEqual({
      kind: "text",
      delta: "La mer respire.",
    });
  });

  it("sépare la réflexion du texte", () => {
    const thinking = {
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "hmm" } },
    };
    expect(interpretClaudeEvent(thinking, true)).toEqual({ kind: "reasoning", delta: "hmm" });
  });

  it("remonte le quota d'abonnement, pas comme une erreur", () => {
    const evt = {
      type: "rate_limit_event",
      rate_limit_info: { status: "allowed", resetsAt: 1787608800, rateLimitType: "five_hour" },
    };
    expect(interpretClaudeEvent(evt, true)).toEqual({
      kind: "rateLimit",
      status: "allowed",
      resetsAt: 1787608800,
      windowType: "five_hour",
    });
  });

  it("termine sur result et normalise l'usage", () => {
    const evt = {
      type: "result",
      is_error: false,
      stop_reason: "end_turn",
      usage: {
        input_tokens: 2,
        cache_read_input_tokens: 16024,
        cache_creation_input_tokens: 5197,
        output_tokens: 48,
      },
    };
    expect(interpretClaudeEvent(evt, true)).toEqual({
      kind: "done",
      finish: "stop",
      usage: {
        inputTokens: 21223,
        outputTokens: 48,
        cachedInputTokens: 16024,
        cacheWriteInputTokens: 5197,
      },
    });
  });

  it("rend une erreur quand result est en échec", () => {
    const out = interpretClaudeEvent({ type: "result", is_error: true, result: "boom" }, true);
    expect(out).toEqual({ kind: "error", message: "boom" });
  });

  it("ignore le bruit (init, status, message_start)", () => {
    expect(interpretClaudeEvent({ type: "system", subtype: "status" }, true)).toBeNull();
    expect(
      interpretClaudeEvent({ type: "stream_event", event: { type: "message_start" } }, true),
    ).toBeNull();
  });

  // La PORTE du périmètre (`toolGate.ts`). `system/init` est le seul moment où l'app
  // apprend ce que la CLI s'autorise, et il tombe AVANT le premier appel d'outil : un
  // intrus doit sortir une ERREUR, que `spawnStream` remonte en tuant la CLI.
  describe("périmètre d'outils annoncé à l'init", () => {
    const init = (tools?: unknown) => ({
      type: "system",
      subtype: "init",
      session_id: "6f1a2b3c-0000-4000-8000-000000000000",
      ...(tools === undefined ? {} : { tools }),
    });

    it("ouvre la session quand le périmètre est vide (tour texte)", () => {
      expect(interpretClaudeEvent(init([]), false)).toEqual({
        kind: "session",
        id: "6f1a2b3c-0000-4000-8000-000000000000",
      });
    });

    it("ouvre la session quand le périmètre est le pont (tour outillé)", () => {
      expect(interpretClaudeEvent(init(["mcp__openmasq__recherche"]), false)).toMatchObject({
        kind: "session",
      });
    });

    it("REFUSE le tour dès qu'un outil hors périmètre est annoncé", () => {
      const action = interpretClaudeEvent(init(["mcp__openmasq__recherche", "Monitor"]), false);
      expect(action?.kind).toBe("error");
      expect(action).toMatchObject({ message: expect.stringContaining("Monitor") });
    });

    it("le refus prime sur l'ouverture de session — rien ne continue derrière", () => {
      expect(interpretClaudeEvent(init(["Bash"]), false)?.kind).not.toBe("session");
    });
  });
});

describe("normalizeUsage", () => {
  it("ré-additionne le cache dans inputTokens — sinon un cache qui marche se lit comme une baisse", () => {
    expect(
      normalizeUsage({ input_tokens: 10, cache_read_input_tokens: 90, output_tokens: 5 }),
    ).toEqual({
      inputTokens: 100,
      outputTokens: 5,
      cachedInputTokens: 90,
    });
  });
});

describe("toFinish", () => {
  it("traduit le vocabulaire Anthropic", () => {
    expect(toFinish("end_turn")).toBe("stop");
    expect(toFinish("max_tokens")).toBe("length");
    expect(toFinish("nawak")).toBe("other");
  });
});

describe("NdjsonLineBuffer", () => {
  it("recolle un event coupé entre deux chunks", () => {
    const buf = new NdjsonLineBuffer();
    expect(buf.push('{"a":1}\n{"b":')).toEqual(['{"a":1}']);
    expect(buf.push("2}\n")).toEqual(['{"b":2}']);
  });

  it("rend la dernière ligne sans saut à la fermeture", () => {
    const buf = new NdjsonLineBuffer();
    buf.push('{"a":1}');
    expect(buf.flush()).toEqual(['{"a":1}']);
  });
});

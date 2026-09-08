import { describe, expect, it } from "vitest";
import { unredactArgs, unredactReply } from "@openmasq/redact";
import { ResponsesStreamRewriter } from "./responsesStream";
import type { SseFrame } from "../../lib/sse";

const vault = { "Marc Charvet": "Camille Roussel" };
const fns = {
  reply: (t: string) => unredactReply(t, vault),
  args: (t: string) => unredactArgs(t, vault),
};
const ev = (type: string, body: Record<string, unknown>): SseFrame => ({
  event: type,
  data: JSON.stringify({ type, ...body }),
});
const parse = (f: SseFrame) => JSON.parse(f.data) as Record<string, any>;

describe("Responses stream rewriter", () => {
  it("restores text deltas per item, flushes before the done event, and restores its full text", () => {
    const rw = new ResponsesStreamRewriter(vault, fns);
    const out = [
      ...rw.rewrite(
        ev("response.output_text.delta", {
          item_id: "m1",
          output_index: 0,
          content_index: 0,
          delta: "Dear Marc ",
        }),
      ),
      ...rw.rewrite(
        ev("response.output_text.delta", {
          item_id: "m1",
          output_index: 0,
          content_index: 0,
          delta: "Char",
        }),
      ),
      ...rw.rewrite(
        ev("response.output_text.done", {
          item_id: "m1",
          output_index: 0,
          content_index: 0,
          text: "Dear Marc Charvet",
        }),
      ),
    ];
    const deltas = out
      .filter((f) => parse(f).type === "response.output_text.delta")
      .map((f) => parse(f).delta);
    expect(deltas.join("")).toBe("Dear Camille Roussel");
    for (const d of deltas) expect(d).not.toMatch(/Marc|Charvet/);
    expect(parse(out[out.length - 1])).toMatchObject({
      type: "response.output_text.done",
      text: "Dear Camille Roussel",
    });
  });

  it("restores function-call arguments with the executor's restore, and the completed response whole", () => {
    const rw = new ResponsesStreamRewriter(vault, fns);
    const out = [
      ...rw.rewrite(
        ev("response.function_call_arguments.delta", {
          item_id: "f1",
          output_index: 1,
          delta: '{"who":"Marc ',
        }),
      ),
      ...rw.rewrite(
        ev("response.function_call_arguments.done", {
          item_id: "f1",
          output_index: 1,
          arguments: '{"who":"Marc Charvet"}',
        }),
      ),
      ...rw.rewrite(
        ev("response.completed", {
          response: {
            output: [
              { type: "message", content: [{ type: "output_text", text: "Hi Marc Charvet" }] },
              { type: "function_call", arguments: '{"who":"Marc Charvet"}' },
            ],
          },
        }),
      ),
    ];
    const args = out
      .filter((f) => parse(f).type === "response.function_call_arguments.delta")
      .map((f) => parse(f).delta)
      .join("");
    expect(args).toBe('{"who":"Camille Roussel"}');
    expect(
      out.find((f) => parse(f).type === "response.function_call_arguments.done"),
    ).toBeDefined();
    expect(
      parse(out.find((f) => parse(f).type === "response.function_call_arguments.done")!).arguments,
    ).toBe('{"who":"Camille Roussel"}');
    const completed = parse(out.find((f) => parse(f).type === "response.completed")!).response
      .output;
    expect(completed[0].content[0].text).toBe("Hi Camille Roussel");
    expect(completed[1].arguments).toBe('{"who":"Camille Roussel"}');
  });

  it("restores an output item done event and leaves unknown events untouched", () => {
    const rw = new ResponsesStreamRewriter(vault, fns);
    const item = rw.rewrite(
      ev("response.output_item.done", {
        output_index: 0,
        item: { type: "message", content: [{ type: "output_text", text: "Marc Charvet" }] },
      }),
    );
    expect(parse(item[0]).item.content[0].text).toBe("Camille Roussel");
    const other = ev("response.created", { response: { id: "r" } });
    expect(rw.rewrite(other)).toEqual([other]);
  });
});

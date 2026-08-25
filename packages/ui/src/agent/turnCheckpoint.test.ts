import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@openmasq/llm";
import {
  CHECKPOINT_MAX_AGE_MS,
  INTERRUPTED_TOOL_RESULT,
  hasInterruptedCalls,
  isCheckpointUsable,
  rememberTranscript,
  resumeMessagesFor,
  sealInterruptedCalls,
  trimCheckpoint,
  type TurnCheckpoint,
} from "./turnCheckpoint";

const call = (id: string, name = "gmail__send_email") => ({ id, name, arguments: {} });

const assistantCalling = (...ids: string[]): ChatMessage => ({
  role: "assistant",
  content: "",
  toolCalls: ids.map((id) => call(id)),
});

const toolReply = (id: string, content = "ok"): ChatMessage => ({
  role: "tool",
  content,
  toolCallId: id,
});

describe("sealInterruptedCalls — an unknown outcome must not read as a failure", () => {
  it("answers a dispatched-but-unanswered call with the interrupted marker", () => {
    const sealed = sealInterruptedCalls([
      { role: "user", content: "envoie le devis" },
      assistantCalling("c1"),
    ]);
    expect(sealed).toHaveLength(3);
    expect(sealed[2]).toEqual({ role: "tool", content: INTERRUPTED_TOOL_RESULT, toolCallId: "c1" });
  });

  it("tells the model the action MAY have succeeded — the whole point", () => {
    // If this ever degrades to "the call failed", the model confidently re-sends the email.
    expect(INTERRUPTED_TOOL_RESULT).toMatch(/PEUT-ÊTRE abouti/);
    expect(INTERRUPTED_TOOL_RESULT).toMatch(/Vérifie/);
  });

  it("leaves an already-answered call untouched", () => {
    const messages = [assistantCalling("c1"), toolReply("c1", "envoyé")];
    expect(sealInterruptedCalls(messages)).toEqual(messages);
  });

  it("seals ONLY the unanswered call of a multi-call assistant turn", () => {
    const sealed = sealInterruptedCalls([assistantCalling("c1", "c2"), toolReply("c1")]);
    const replies = sealed.filter((m) => m.role === "tool");
    expect(replies).toHaveLength(2);
    expect(replies.find((m) => m.toolCallId === "c1")!.content).toBe("ok");
    expect(replies.find((m) => m.toolCallId === "c2")!.content).toBe(INTERRUPTED_TOOL_RESULT);
  });

  it("places the reply IMMEDIATELY after its assistant turn (providers validate the pairing)", () => {
    const sealed = sealInterruptedCalls([
      assistantCalling("c1"),
      { role: "user", content: "alors ?" },
    ]);
    expect(sealed.map((m) => m.role)).toEqual(["assistant", "tool", "user"]);
  });

  it("never emits two replies for a duplicated call id", () => {
    const sealed = sealInterruptedCalls([assistantCalling("c1", "c1")]);
    expect(sealed.filter((m) => m.role === "tool")).toHaveLength(1);
  });

  it("is a no-op on a transcript with no tool calls at all", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "bonjour" }];
    expect(sealInterruptedCalls(messages)).toEqual(messages);
  });
});

describe("hasInterruptedCalls", () => {
  it("is true only when a call went unanswered", () => {
    expect(hasInterruptedCalls([assistantCalling("c1")])).toBe(true);
    expect(hasInterruptedCalls([assistantCalling("c1"), toolReply("c1")])).toBe(false);
  });
});

describe("isCheckpointUsable", () => {
  const cp: TurnCheckpoint = { turnId: "t1", at: 1000, messages: [assistantCalling("c1")] };

  it("accepts a fresh checkpoint for the SAME turn", () => {
    expect(isCheckpointUsable(cp, "t1", 1000 + 60_000)).toBe(true);
  });

  it("refuses another turn's checkpoint — a new turn must not inherit an old transcript", () => {
    expect(isCheckpointUsable(cp, "t2", 1000)).toBe(false);
  });

  it("refuses a stale one: the world moved on and the model would reason about a dead state", () => {
    expect(isCheckpointUsable(cp, "t1", 1000 + CHECKPOINT_MAX_AGE_MS + 1)).toBe(false);
  });

  it("refuses an empty or absent one", () => {
    expect(isCheckpointUsable({ ...cp, messages: [] }, "t1", 1000)).toBe(false);
    expect(isCheckpointUsable(undefined, "t1", 1000)).toBe(false);
  });
});

describe("resumeMessagesFor", () => {
  it("prefers the in-session RAM entry (at least as fresh, and already settled)", () => {
    const ram = new Map<string, ChatMessage[]>([["t1", [{ role: "user", content: "ram" }]]]);
    const cp: TurnCheckpoint = { turnId: "t1", at: 0, messages: [{ role: "user", content: "db" }] };
    expect(resumeMessagesFor(ram, cp, "t1", 1000)?.[0]?.content).toBe("ram");
  });

  it("falls back to the persisted checkpoint AND seals it — the restart case", () => {
    const cp: TurnCheckpoint = { turnId: "t1", at: 0, messages: [assistantCalling("c1")] };
    const out = resumeMessagesFor(new Map(), cp, "t1", 1000)!;
    expect(out.at(-1)).toEqual({ role: "tool", content: INTERRUPTED_TOOL_RESULT, toolCallId: "c1" });
  });

  it("returns undefined when neither source applies", () => {
    expect(resumeMessagesFor(new Map(), undefined, "t1", 1000)).toBeUndefined();
  });

  it("seals the RAM copy too — a user Stop checkpoints a transcript cut mid-call (audit 2026-08-10)", () => {
    // `finalizeAborted` now checkpoints on Stop, so a RAM entry can hold an
    // unanswered dispatched call exactly like the persisted one. Unsealed, the
    // retry would replay "the call never happened" and re-emit the write.
    const ram = new Map<string, ChatMessage[]>([["t1", [assistantCalling("c1")]]]);
    const out = resumeMessagesFor(ram, undefined, "t1", 1000)!;
    expect(out.at(-1)).toEqual({ role: "tool", content: INTERRUPTED_TOOL_RESULT, toolCallId: "c1" });
  });
});

describe("rememberTranscript", () => {
  it("returns the checkpoint to persist and keeps the RAM map bounded at 20", () => {
    const ram = new Map<string, ChatMessage[]>();
    for (let i = 0; i < 25; i++) {
      rememberTranscript(ram, `t${i}`, [{ role: "user", content: `m${i}` }], 1000);
    }
    expect(ram.size).toBe(20);
    expect(ram.has("t0")).toBe(false);
    expect(ram.has("t24")).toBe(true);
  });

  it("re-checkpointing an OLD turn keeps it alive (eviction is by last checkpoint, not by age)", () => {
    const ram = new Map<string, ChatMessage[]>();
    rememberTranscript(ram, "keepme", [{ role: "user", content: "a" }], 1000);
    for (let i = 0; i < 19; i++) {
      rememberTranscript(ram, `t${i}`, [{ role: "user", content: "x" }], 1000);
    }
    rememberTranscript(ram, "keepme", [{ role: "user", content: "b" }], 2000);
    rememberTranscript(ram, "new", [{ role: "user", content: "c" }], 3000);
    expect(ram.has("keepme")).toBe(true);
  });
});

describe("trimCheckpoint", () => {
  it("keeps a small transcript whole", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "court" }];
    expect(trimCheckpoint(messages, 1000)).toBe(messages);
  });

  it("drops from the FRONT — a resume needs the recent state", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "x".repeat(100) },
      { role: "assistant", content: "y".repeat(10) },
    ];
    expect(trimCheckpoint(messages, 50).map((m) => m.content[0])).toEqual(["y"]);
  });

  it("never STARTS on an orphan tool reply (its assistant call would be gone)", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "x".repeat(100) },
      assistantCalling("c1"),
      toolReply("c1", "z".repeat(5)),
      { role: "assistant", content: "fini" },
    ];
    expect(trimCheckpoint(messages, 20)[0]!.role).not.toBe("tool");
  });
});

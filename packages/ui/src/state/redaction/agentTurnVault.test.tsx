// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount } from "../../testKit";
import { useChatStore } from "../store";
import type { AuthUser, Host } from "../../host";
import type { Conversation } from "../../types";

/**
 * AN AGENTIC TURN'S VAULT SURVIVES THE TURN'S FAILURE — audit 2026-08-10, high severity.
 *
 * The agentic loop mutates a COPY of the conversation's vault (tool results redacted
 * along the way), and the assistant text is persisted UN-redacted. The history sent
 * back to the model then only REPLAYS the vault (`buildWireHistory` → `applyVault`),
 * never re-detects. So if a Stop or a tool error lost the entries mined during the
 * turn, the REAL value would go out in clear on the next turn — the exact opposite of
 * the product's promise.
 *
 * Three invariants pinned here, against the real `useChatStore` (loop mocked right at
 * the module boundary — it's the store⇄loop contract being tested, not the loop):
 *   1. the ERROR branch commits the vault mined by the turn;
 *   2. a STOP mid-turn commits the vault AND keeps `turnCheckpoint` (the
 *      dispatched-without-response call must stay sealable on retry — `sealInterruptedCalls`);
 *      a COMPLETED turn, in contrast, does clear the checkpoint;
 *   3. the reversibility blob goes to DB IMMEDIATELY (outside the 700 ms debounce) — a
 *      crash during the stream must not lose a vault whose redacted text has already
 *      left the machine.
 */

const { loopMock } = vi.hoisted(() => ({ loopMock: vi.fn() }));

vi.mock("../../agent/mcpAgent", () => ({
  runMcpAgentLoop: loopMock,
  isSearchTool: () => false,
}));

const USER: AuthUser = { id: "uid-vault", email: "v@exemple.fr" } as AuthUser;

function harness() {
  let onChangeCb: ((u: AuthUser | null) => void) | null = null;
  /** Each conversation saved to DB, timestamped at the call — to prove the IMMEDIATE. */
  const dbSaves: { at: number; conv: Conversation }[] = [];

  const host: Partial<Host> = {
    auth: {
      getSession: async () => null,
      onChange: (cb) => {
        onChangeCb = cb;
        return () => {
          onChangeCb = null;
        };
      },
    } as Host["auth"],
    keys: {
      setUser: async () => {},
      configured: async () => ["openai"],
      set: async () => {},
      clear: async () => {},
      importLegacy: async () => {},
    } as Host["keys"],
    db: {
      configured: async () => true,
      setUser: async () => {},
      // `null` = "DB not configured" (dbActive stays false) — an EMPTY DB returns a blob.
      load: async () => ({ conversations: [] }) as never,
      saveConversation: async (c: Conversation) => {
        dbSaves.push({ at: Date.now(), conv: c });
      },
      deleteConversation: async () => {},
    } as unknown as Host["db"],
    mcp: { setUser: async () => {} } as unknown as Host["mcp"],
    // Local engine present (fail-closed otherwise) — no detection: the test's vault
    // is mined by the LOOP (tool results), not by the sent message.
    detectLocalPii: async () => [],
    // Present ⇒ the store takes the AGENTIC path (the loop itself is mocked).
    completeTools: async () => ({ toolCalls: [] }) as never,
  };

  return { host, dbSaves, fire: (u: AuthUser | null) => onChangeCb?.(u) };
}

function Probe({ sink }: { sink: { api: ReturnType<typeof useChatStore> | null } }) {
  sink.api = useChatStore();
  return null;
}

async function mountStore(h: ReturnType<typeof harness>) {
  const sink: { api: ReturnType<typeof useChatStore> | null } = { api: null };
  const m = await mount(<Probe sink={sink} />, { host: h.host });
  const signIn = async (u: AuthUser | null) => {
    await act(async () => {
      h.fire(u);
      await new Promise((r) => setTimeout(r, 0));
    });
  };
  await signIn(null); // the "signed out" adoption the store always plays first
  await signIn(USER);
  return { ...m, store: () => sink.api! };
}

/** Creates a conversation and sends an agentic turn; returns the id + the send's promise. */
async function startTurn(m: Awaited<ReturnType<typeof mountStore>>) {
  let convId = "";
  await act(async () => {
    convId = m.store().createConversation();
  });
  let sendDone!: Promise<void>;
  await act(async () => {
    sendDone = m.store().sendMessage("bonjour", undefined, { convId, modelId: "gpt-4o" });
    await new Promise((r) => setTimeout(r, 0));
  });
  return { convId, sendDone };
}

const convOf = (m: Awaited<ReturnType<typeof mountStore>>, id: string) =>
  m.store().conversations.find((c) => c.id === id)!;

beforeEach(() => {
  localStorage.clear();
  loopMock.mockReset();
});

describe("le vault d'un tour agentique survit à l'échec du tour", () => {
  it("branche d'ERREUR : les entrées minées par les outils sont committées", async () => {
    loopMock.mockImplementation(async (p) => {
      p.vault["Norvik Group"] = "Karl Studio"; // a Gmail/CRM result vaulted a real value
      throw new Error("boom connecteur");
    });

    const h = harness();
    const m = await mountStore(h);
    const { convId, sendDone } = await startTurn(m);
    await act(async () => {
      await sendDone;
    });

    const conv = convOf(m, convId);
    expect(conv.redactionVault).toMatchObject({ "Norvik Group": "Karl Studio" });
    // And the failure is shown, not swallowed (house rule).
    expect(conv.messages.at(-1)?.error).toBe(true);

    await m.unmount();
  });

  it("STOP en plein tour : vault committé ET turnCheckpoint conservé pour le retry", async () => {
    let loopStarted!: () => void;
    const started = new Promise<void>((r) => (loopStarted = r));
    loopMock.mockImplementation(async (p) => {
      p.vault["Norvik Group"] = "Karl Studio";
      // The checkpoint the loop persists on every model response (WIRE transcript).
      p.onResumeTranscript?.([
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "gmail__send_email", arguments: "{}" }],
        },
      ] as never);
      loopStarted();
      // A Stop must RELEASE the loop (raceAbort) — mimicking `finalizeAborted`: true.
      await new Promise<void>((r) => p.signal.addEventListener("abort", () => r(), { once: true }));
      return true;
    });

    const h = harness();
    const m = await mountStore(h);
    const { convId, sendDone } = await startTurn(m);
    await act(async () => {
      await started;
    });
    await act(async () => {
      m.store().stop(convId);
      await sendDone;
    });

    const conv = convOf(m, convId);
    expect(conv.redactionVault).toMatchObject({ "Norvik Group": "Karl Studio" });
    // The dispatched call has no recorded result: the checkpoint MUST survive,
    // otherwise the retry can't seal it ("may have gone through") and re-emits the send.
    expect(conv.turnCheckpoint).toBeDefined();
    expect((conv.turnCheckpoint as { turnId: string }).turnId).toBeTruthy();

    await m.unmount();
  });

  it("tour TERMINÉ (non stoppé) : le checkpoint est bien effacé — rien à reprendre", async () => {
    loopMock.mockImplementation(async (p) => {
      p.vault["Norvik Group"] = "Karl Studio";
      p.onResumeTranscript?.([{ role: "assistant", content: "fini" }] as never);
      return true;
    });

    const h = harness();
    const m = await mountStore(h);
    const { convId, sendDone } = await startTurn(m);
    await act(async () => {
      await sendDone;
    });

    const conv = convOf(m, convId);
    expect(conv.redactionVault).toMatchObject({ "Norvik Group": "Karl Studio" });
    expect(conv.turnCheckpoint).toBeUndefined();

    await m.unmount();
  });

  it("le blob de réversibilité atteint la DB SANS attendre le debounce de 700 ms", async () => {
    loopMock.mockImplementation(async (p) => {
      p.vault["Norvik Group"] = "Karl Studio";
      throw new Error("boom connecteur");
    });

    const h = harness();
    const m = await mountStore(h);
    const t0 = Date.now();
    const { convId, sendDone } = await startTurn(m);
    await act(async () => {
      await sendDone;
      await new Promise((r) => setTimeout(r, 0)); // the mirroring effect runs after the render
    });

    const withVault = h.dbSaves.find(
      (s) => s.conv.id === convId && s.conv.redactionVault?.["Norvik Group"] === "Karl Studio",
    );
    expect(withVault, "le vault doit être écrit en DB immédiatement").toBeDefined();
    // Well BEFORE the debounce: a crash within the 700 ms window no longer loses the vault.
    expect(withVault!.at - t0).toBeLessThan(600);

    await m.unmount();
  });
});

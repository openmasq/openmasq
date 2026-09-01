// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount } from "../testKit";
import { useChatStore } from "./store";
import { settingsKeyFor } from "./storePersistence";
import { DEFAULT_MODEL_ID } from "../prompt/models";
import type { AuthUser, Host } from "../host";
import type { Conversation } from "../types";

/**
 * CREATE THEN SEND IN THE SAME HANDLER KEEPS THE CHOSEN MODEL — reported by a
 * user on 11/08 ("my default model is Opus 4.8, the reply comes from Laguna").
 *
 * `sendMessage` resolves its conversation — hence its MODEL — in `conversationsRef.current`.
 * This ref was only reassigned on RENDER, but a new tab creates the conversation AND
 * sends in A SINGLE handler: the ref was one beat behind, the `??` fell back to
 * `DEFAULT_MODEL_ID`, and the reply came back from a different model than the one
 * displayed, with no error at all. `sendModelResolution.test.ts` pins the READ (the
 * ref, not the captured copy); this test pins the BEHAVIOUR, the only thing able to see a turn's drift.
 */

const { loopMock } = vi.hoisted(() => ({ loopMock: vi.fn() }));

vi.mock("../agent/mcpAgent", () => ({
  runMcpAgentLoop: loopMock,
  isSearchTool: () => false,
}));

const USER: AuthUser = { id: "uid-live", email: "live@exemple.fr" } as AuthUser;
/** A model that is NOT the default: that's the whole point of the test. */
const PICKED = "gpt-4o";

function harness() {
  let onChangeCb: ((u: AuthUser | null) => void) | null = null;
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
      load: async () => ({ conversations: [] }) as never,
      saveConversation: async (_c: Conversation) => {},
      deleteConversation: async () => {},
    } as unknown as Host["db"],
    mcp: { setUser: async () => {} } as unknown as Host["mcp"],
    detectLocalPii: async () => [],
    completeTools: async () => ({ toolCalls: [] }) as never,
  };
  return { host, fire: (u: AuthUser | null) => onChangeCb?.(u) };
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
  await signIn(null);
  await signIn(USER);
  return { ...m, store: () => sink.api! };
}

beforeEach(() => {
  localStorage.clear();
  // The account's default model — the one the composer's chip shows.
  localStorage.setItem(settingsKeyFor(USER.id), JSON.stringify({ defaultModelId: PICKED }));
  loopMock.mockReset();
  loopMock.mockImplementation(async () => true);
});

describe("créer-puis-envoyer dans un seul gestionnaire", () => {
  it("répond avec le modèle de la conversation, pas avec le modèle par défaut", async () => {
    const h = harness();
    const m = await mountStore(h);

    // THE scenario: both calls in the SAME `act`, like ChatPane does when the panel
    // doesn't have a live conversation yet (new tab, welcome screen).
    // No `modelId` in the options — it's the conversation that must decide.
    let convId = "";
    let sendDone!: Promise<void>;
    await act(async () => {
      convId = m.store().createConversation();
      sendDone = m.store().sendMessage("bonjour", undefined, { convId });
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      await sendDone;
    });

    const conv = m.store().conversations.find((c) => c.id === convId)!;
    expect(conv.modelId, "la conversation naît sur le modèle par défaut du compte").toBe(PICKED);
    const assistant = conv.messages.find((x) => x.role === "assistant");
    expect(assistant?.model, "la réponse est estampillée du modèle affiché").toBe(PICKED);
    expect(assistant?.model).not.toBe(DEFAULT_MODEL_ID);

    await m.unmount();
  });

  it("le message part bien SUR cette conversation, une seule est créée", async () => {
    // The corollary: the fallback used to mine a GHOST conversation (`newConversation`),
    // never added to the state. Nothing flagged it — the turn showed up in the right
    // place and only the model changed. So we check that the one conversation does carry the turn.
    const h = harness();
    const m = await mountStore(h);

    let convId = "";
    let sendDone!: Promise<void>;
    await act(async () => {
      convId = m.store().createConversation();
      sendDone = m.store().sendMessage("bonjour", undefined, { convId });
      await new Promise((r) => setTimeout(r, 0));
    });
    await act(async () => {
      await sendDone;
    });

    expect(m.store().conversations.length).toBe(1);
    const conv = m.store().conversations[0];
    expect(conv.id).toBe(convId);
    expect(conv.messages.filter((x) => x.role === "user")).toHaveLength(1);

    await m.unmount();
  });
});

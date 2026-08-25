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
 * CRÉER PUIS ENVOYER DANS LE MÊME GESTIONNAIRE GARDE LE MODÈLE CHOISI — remonté par un
 * utilisateur le 11/08 (« mon modèle par défaut est Opus 4.8, la réponse vient de Laguna »).
 *
 * `sendMessage` résout sa conversation — donc son MODÈLE — dans `conversationsRef.current`.
 * Ce ref n'était réassigné qu'au RENDU, or un nouvel onglet crée la conversation ET envoie
 * dans UN SEUL gestionnaire : le ref était en retard d'un battement, le `??` repliait sur
 * `DEFAULT_MODEL_ID` et la réponse revenait d'un autre modèle que celui affiché, sans la
 * moindre erreur. `sendModelResolution.test.ts` épingle la LECTURE (le ref, pas la copie
 * capturée) ; ce test-ci épingle le COMPORTEMENT, seul capable de voir le décalage d'un tour.
 */

const { loopMock } = vi.hoisted(() => ({ loopMock: vi.fn() }));

vi.mock("../agent/mcpAgent", () => ({
  runMcpAgentLoop: loopMock,
  isSearchTool: () => false,
}));

const USER: AuthUser = { id: "uid-live", email: "live@exemple.fr" } as AuthUser;
/** Un modèle qui n'est PAS le défaut : c'est tout l'objet du test. */
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
  // Le modèle par défaut du compte — celui que la puce du composeur affiche.
  localStorage.setItem(settingsKeyFor(USER.id), JSON.stringify({ defaultModelId: PICKED }));
  loopMock.mockReset();
  loopMock.mockImplementation(async () => true);
});

describe("créer-puis-envoyer dans un seul gestionnaire", () => {
  it("répond avec le modèle de la conversation, pas avec le modèle par défaut", async () => {
    const h = harness();
    const m = await mountStore(h);

    // LE scénario : les deux appels dans le MÊME `act`, comme ChatPane le fait quand le
    // panneau n'a pas encore de conversation vivante (nouvel onglet, écran d'accueil).
    // Aucun `modelId` dans les options — c'est la conversation qui doit décider.
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
    // Le corollaire : le repli minait une conversation FANTÔME (`newConversation`), jamais
    // ajoutée à l'état. Rien ne le signalait — le tour s'affichait au bon endroit et seul
    // le modèle changeait. On vérifie donc que l'unique conversation porte bien le tour.
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

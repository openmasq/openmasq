// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { mount } from "../testKit";
import { useChatStore } from "./store";
import type { AuthUser, Host } from "../host";
import type { Conversation } from "../types";

/**
 * LE VAULT D'UN TOUR AGENTIQUE SURVIT À L'ÉCHEC DU TOUR — audit 2026-08-10, sévérité haute.
 *
 * La boucle agentique mute une COPIE du vault de la conversation (résultats d'outils
 * redacted au fil de l'eau), et le texte assistant est persisté UN-redacted. L'historique
 * renvoyé au modèle ne fait ensuite que REJOUER le vault (`buildWireHistory` → `applyVault`),
 * jamais re-détecter. Donc si un Stop ou une erreur d'outil perdait les entrées minées
 * pendant le tour, la VRAIE valeur repartait en clair au tour suivant — l'inverse exact de
 * la promesse du produit.
 *
 * Trois invariants épinglés ici, contre le vrai `useChatStore` (boucle mockée au ras du
 * module — c'est le contrat store⇄boucle qu'on teste, pas la boucle) :
 *   1. la branche d'ERREUR committe le vault miné par le tour ;
 *   2. un STOP en plein tour committe le vault ET conserve `turnCheckpoint` (l'appel
 *      dispatché-sans-réponse doit rester scellable au retry — `sealInterruptedCalls`) ;
 *      un tour TERMINÉ, lui, efface bien le checkpoint ;
 *   3. le blob de réversibilité part en DB IMMÉDIATEMENT (hors debounce 700 ms) — un
 *      crash pendant le stream ne doit pas perdre un vault dont le texte redacted est
 *      déjà sorti de la machine.
 */

const { loopMock } = vi.hoisted(() => ({ loopMock: vi.fn() }));

vi.mock("../agent/mcpAgent", () => ({
  runMcpAgentLoop: loopMock,
  isSearchTool: () => false,
}));

const USER: AuthUser = { id: "uid-vault", email: "v@exemple.fr" } as AuthUser;

function harness() {
  let onChangeCb: ((u: AuthUser | null) => void) | null = null;
  /** Chaque conversation sauvée en DB, horodatée à l'appel — pour prouver l'IMMÉDIAT. */
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
      // `null` = « DB non configurée » (dbActive reste faux) — une DB VIDE renvoie un blob.
      load: async () => ({ conversations: [] }) as never,
      saveConversation: async (c: Conversation) => {
        dbSaves.push({ at: Date.now(), conv: c });
      },
      deleteConversation: async () => {},
    } as unknown as Host["db"],
    mcp: { setUser: async () => {} } as unknown as Host["mcp"],
    // Moteur local présent (fail-closed sinon) — aucune détection : le vault du test
    // est miné par la BOUCLE (résultats d'outils), pas par le message envoyé.
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
  await signIn(null); // l'adoption « déconnecté » que le store joue toujours en premier
  await signIn(USER);
  return { ...m, store: () => sink.api! };
}

/** Crée une conversation et envoie un tour agentique ; renvoie l'id + la promesse du send. */
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
      p.vault["Norvik Group"] = "Karl Studio"; // un résultat Gmail/CRM a vaulté une vraie valeur
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
    // Et l'échec est montré, pas avalé (règle maison).
    expect(conv.messages.at(-1)?.error).toBe(true);

    await m.unmount();
  });

  it("STOP en plein tour : vault committé ET turnCheckpoint conservé pour le retry", async () => {
    let loopStarted!: () => void;
    const started = new Promise<void>((r) => (loopStarted = r));
    loopMock.mockImplementation(async (p) => {
      p.vault["Norvik Group"] = "Karl Studio";
      // Le checkpoint que la boucle persiste à chaque réponse modèle (transcript WIRE).
      p.onResumeTranscript?.([
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call-1", name: "gmail__send_email", arguments: "{}" }],
        },
      ] as never);
      loopStarted();
      // Un Stop doit LIBÉRER la boucle (raceAbort) — on mime `finalizeAborted` : true.
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
    // L'appel dispatché n'a pas de résultat enregistré : le checkpoint DOIT survivre,
    // sinon le retry ne peut pas le sceller (« a PEUT-ÊTRE abouti ») et ré-émet l'envoi.
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
      await new Promise((r) => setTimeout(r, 0)); // l'effet de mirroring joue après le rendu
    });

    const withVault = h.dbSaves.find(
      (s) => s.conv.id === convId && s.conv.redactionVault?.["Norvik Group"] === "Karl Studio",
    );
    expect(withVault, "le vault doit être écrit en DB immédiatement").toBeDefined();
    // Bien AVANT le debounce : un crash dans la fenêtre de 700 ms ne perd plus le vault.
    expect(withVault!.at - t0).toBeLessThan(600);

    await m.unmount();
  });
});

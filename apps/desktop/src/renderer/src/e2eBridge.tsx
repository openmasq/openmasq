import { useEffect, useRef } from "react";
import {
  findModelAny,
  getDebugLog,
  isEntryVisibleIn,
  setDebugCapture,
  type ChatStore,
  type DebugEntry,
} from "@openmasq/ui";

/**
 * TEST-ONLY driver for the agentic loop — the seam that makes real-connector
 * iteration practical.
 *
 * Why it exists: the interesting signal when tuning agentic reliability (tool
 * routing, retries, loops, PII on the wire) is produced by ONE app launch and N
 * turns; driving those turns through the composer is serial, slow and flaky, and
 * a per-test app launch costs ~40 s before a single token is spent. This exposes
 * the store's OWN `sendMessage` so a spec can fire N CONCURRENT turns into N
 * conversations of a SINGLE app — turns already run concurrently per tab (the
 * cancel/finish registries are keyed by `convId`; `isStreaming` is only a display
 * flag), so this adds no new concurrency, just a programmatic entry point.
 *
 * ⚠️ It is the SAME pipeline, not a replica: redaction, wire assembly, `mcpAgent`,
 * the real MCP connectors and BOTH write gates are untouched. The only thing it
 * substitutes is the two callbacks ChatView would supply from the UI —
 * `confirmToolWrite` (the in-conversation card) and `reviewWebNav` (the reveal
 * card) — with a DECLARED, deterministic answer, exactly as a user clicking would.
 * Main's un-spoofable window still gates every risky write on its own, so what a
 * test can approve here is bounded by the same policy a user faces.
 *
 * Gating: `window.openmasq.e2e`, which mirrors main's LAUNCH-TIME `OPENMASQ_E2E`
 * (a renderer cannot set main's env). Inert in every shipped build — and it grants
 * no authority a renderer doesn't already have (it can call the IPC directly).
 */

export interface E2eTurn {
  convId: string;
  done: boolean;
  /** Reply text as SHOWN (un-redacted) — what the user would read. */
  text: string;
  error: boolean;
  /** Le message d'échec persisté (« ENVOI IMPOSSIBLE … ») — LE diagnostic. */
  errorText: string;
  /** Tool calls seen on the turn's messages, in order (`connector__tool`). */
  tools: string[];
  /** LE JOURNAL DE REDACTION de la conversation : faux → réel (`redactionVault`).
   *  Sans lui, une boucle « le modèle rejoue le même outil » peut CACHER une boucle
   *  « le NER a redacted un NOM D'OUTIL » (`execute-sql → jade-tom`) qui casse la
   *  découverte : le bench doit pouvoir distinguer les deux. */
  redactions: Record<string, string>;
  ms: number;
}

declare global {
  interface Window {
    __openmasqE2E?: {
      /** Fire a turn WITHOUT awaiting it — returns the conversation id at once. */
      send: (
        text: string,
        opts?: { approveWrites?: boolean; revealForWeb?: boolean; modelId?: string },
      ) => string;
      /** Un id de modèle est-il RÉSOLVABLE ? Un slug OpenRouter dynamique
       *  (`poolside/laguna-xs-2.1`) n'entre au registre qu'après le fetch du
       *  catalogue au montage ; envoyer avant, c'est partir sur le modèle d'USINE
       *  (mesuré : « … tools request failed (401) »). Le spec attend ceci. */
      modelReady: (id: string) => boolean;
      /** Snapshot of a turn (poll this from the spec). */
      turn: (convId: string) => E2eTurn | null;
      /** Every write the loop asked to confirm, in order — the anti-double-send probe. */
      confirms: () => {
        tool: string;
        convId: string;
        approved: boolean;
        at: number;
        /** Les args RÉELS (un-redacted) soumis à confirmation — ce que le
         *  connecteur recevra. Permet au spec de vérifier un destinataire. */
        args: Record<string, unknown>;
      }[];
      /** LE JOURNAL DE DÉBOGAGE d'une conversation : les entrées wire/turn/tool/phase
       *  avec leurs correspondances redacted↔original — ce qu'affiche le Debug Log de
       *  l'app. C'est ce qui permet d'ITÉRER : voir qu'un nom d'outil a été redacted,
       *  quel tour a bouclé, quel wire est parti. Bornée au buffer de l'app (200). */
      journal: (convId: string) => DebugEntry[];
      /** Diagnostic ciblé : les correspondances où l'ORIGINAL ressemble à un NOM
       *  D'OUTIL ou un terme technique (kebab-case, PascalCase mono-mot) redacted par
       *  erreur — la cause racine des boucles posthog (`execute-sql → jade-tom`). */
      toolNameRedactions: (convId: string) => { fake: string; real: string }[];
    };
  }
}

/** Un ORIGINAL qui ressemble à une API/un nom d'outil plutôt qu'à de la PII :
 *  kebab-case (`execute-sql`), un mot technique connu, ou un slug de commande. Ce
 *  sont ceux que le NER n'aurait jamais dû redact dans un résultat de découverte. */
const TOOLISH = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$|^(ClickHouse|HogQL|MCP|SQL|OAuth|API|SDK|JSON|HTTP)$/;

export function E2eBridge({ store }: { store: ChatStore }) {
  const ref = useRef(store);
  ref.current = store;

  useEffect(() => {
    let disposed = false;
    const started = new Map<string, number>();
    const confirms: {
      tool: string;
      convId: string;
      approved: boolean;
      at: number;
      args: Record<string, unknown>;
    }[] = [];

    const bridge: NonNullable<Window["__openmasqE2E"]> = {
      send: (text, opts = {}) => {
        const convId = ref.current.createConversation();
        started.set(convId, Date.now());
        // Fire-and-forget: the spec polls `turn()`. Awaiting here would serialise
        // the very concurrency this bridge exists to provide.
        void ref.current.sendMessage(text, undefined, {
          convId,
          // Modèle EXPLICITE par tour : `createConversation` retomberait sur le
          // défaut d'usine si `defaultModelId` n'est pas résolvable. Permet aussi
          // de comparer deux modèles dans le MÊME lot.
          ...(opts.modelId ? { modelId: opts.modelId } : {}),
          // The in-conversation confirmation card's answer, declared up front.
          // Recorded FIRST so a double-ask is visible even when both are approved.
          confirmToolWrite: async (info, cid) => {
            // FAIL-CLOSED, comme la porte de révélation juste en dessous : une écriture
            // n'est approuvée que si le tour la DEMANDE explicitement. Le défaut inverse
            // (`!== false`) approuvait tout ce que le modèle décidait d'écrire sur les
            // vrais comptes du compte dev, y compris sur un scénario de LECTURE — un
            // événement fantôme est bien arrivé dans l'agenda réel (journal 27/07/2026),
            // et le banc l'a compté comme un succès.
            const approved = opts.approveWrites === true;
            confirms.push({ tool: info.tool, convId: cid, approved, at: Date.now(), args: info.args });
            return approved;
          },
          // The pre-search reveal gate: `[]` (reveal nothing) is the product's
          // fail-closed default, so that is this bridge's default too.
          reviewWebNav: async (categories) => (opts.revealForWeb ? categories : []),
        });
        return convId;
      },

      modelReady: (id) => !!findModelAny(id),

      turn: (convId) => {
        const conv = ref.current.conversations.find((c) => c.id === convId);
        if (!conv) return null;
        const last = [...conv.messages].reverse().find((m) => m.role === "assistant");
        // `toolCalls` = la trace persistée du tour (schema `Message`) : l'outil,
        // son serveur et son issue — la matière première du diagnostic de boucle.
        const tools = conv.messages.flatMap((m) => (m.toolCalls ?? []).map((t) => t.tool));
        return {
          convId,
          done: !!last && !last.pending,
          text: last?.content ?? "",
          error: !!last?.error,
          errorText: last?.errorText ?? "",
          tools,
          // Le journal complet faux→réel accumulé sur la conversation (vault).
          redactions: { ...(conv.redactionVault ?? {}) },
          ms: Date.now() - (started.get(convId) ?? Date.now()),
        };
      },

      confirms: () => [...confirms],

      // La portée est LA règle du paquet (`isEntryVisibleIn`), pas une copie : celle qui
      // vivait ici acceptait `conv === undefined`, donc le journal d'une conversation
      // emportait les entrées d'une autre — le bug même que le banc doit pouvoir voir.
      journal: (convId) => getDebugLog().filter((e) => isEntryVisibleIn(e, convId)) as DebugEntry[],

      toolNameRedactions: (convId) => {
        const seen = new Map<string, string>();
        for (const e of getDebugLog()) {
          if (!isEntryVisibleIn(e, convId)) continue;
          // Les `pairs` (tool) et le `vault` (wire/turn) portent le mapping faux→réel.
          const vault = "vault" in e ? e.vault : undefined;
          if (vault) for (const [fake, real] of Object.entries(vault)) if (TOOLISH.test(real)) seen.set(fake, real);
          const pairs = "pairs" in e ? e.pairs : undefined;
          if (pairs) for (const p of pairs) if (TOOLISH.test(p.original)) seen.set(p.token, p.original);
        }
        return [...seen].map(([fake, real]) => ({ fake, real }));
      },
    };

    // Le drapeau vient de MAIN (env de lancement) : le preload est sandboxé, il n'a
    // pas `process.env`. Asynchrone, donc le spec attend l'apparition du pont.
    void window.openmasq.env.isE2e().then((on) => {
      if (on && !disposed) {
        setDebugCapture(true); // le journal alimente le bench ; inerte hors e2e
        window.__openmasqE2E = bridge;
      }
    });

    return () => {
      disposed = true;
      delete window.__openmasqE2E;
    };
  }, []);

  return null;
}

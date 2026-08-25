import type { Page } from "@playwright/test";

/** L'identifiant du compte simulé. Tout est SCOPÉ dessus côté app (`…:u1`). */
export const UID = "u1";
/** La clé de session Supabase que le renderer lit au démarrage. */
import { supabaseAuthStorageKey } from "../supabaseAuthKey";
const AUTH_KEY = supabaseAuthStorageKey();

export interface SeedOptions {
  /** `openaiCompatBaseUrl` — l'endpoint bidon local. */
  baseUrl?: string;
  /** id du modèle servi par cet endpoint. */
  modelId?: string;
  /** Champs de `Settings` à poser par-dessus le socle (coffre, compétences, thème…). */
  settings?: Record<string, unknown>;
  /** Conversations à pré-poser (clé SCOPÉE `openmasq.conversations:u1`). */
  conversations?: unknown[];
  /** `false` pour rejouer l'onboarding : le socle ne pose alors PAS `onboarded`. */
  onboarded?: boolean;
}

/**
 * Pose, dans le `localStorage` du renderer, l'état de départ d'un parcours : une session
 * signée, des réglages, des conversations.
 *
 * ⚠️ Trois pièges que ce module existe pour ne plus laisser payer, chacun silencieux :
 *  - la session doit être COMPLÈTE (une forme minimale rouvre la modale de connexion) ;
 *  - conversations et réglages sont SCOPÉS au compte — la clé nue `openmasq.conversations`
 *    est ignorée, et `openmasq.activeId:u1` se lit BRUT, pas en JSON ;
 *  - coffre, compétences et workflows sont des CHAMPS de `Settings`, pas des clés à eux ;
 *    une liste vide ne rend aucun sélecteur, ce qui ressemble à un bug.
 *
 * L'appelant doit `page.reload()` derrière : l'app a déjà lu le storage au premier rendu.
 */
export async function seedSession(page: Page, opts: SeedOptions = {}): Promise<void> {
  await page.evaluate(
    ({ uid, authKey, o }) => {
      const now = Date.now();
      localStorage.setItem(
        authKey,
        JSON.stringify({
          access_token: "t",
          refresh_token: "r",
          token_type: "bearer",
          expires_in: 999999,
          expires_at: Math.floor(now / 1000) + 999999,
          user: { id: uid, email: "parcours@local", aud: "authenticated", role: "authenticated" },
        }),
      );
      const base: Record<string, unknown> = {
        redactRulesSeen: true,
        redactEngine: "patterns",
        ...(o.onboarded === false ? {} : { onboarded: true }),
        ...(o.baseUrl
          ? { defaultModelId: o.modelId ?? "llama3.3", openaiCompatBaseUrl: o.baseUrl }
          : {}),
        ...(o.settings ?? {}),
      };
      const blob = JSON.stringify(base);
      // La clé NUE sert le rendu pré-auth ; la SCOPÉE est celle que le compte relit.
      localStorage.setItem("openmasq.settings", blob);
      localStorage.setItem(`openmasq.settings:${uid}`, blob);
      const convs = (o.conversations ?? []) as { id: string }[];
      if (convs.length) {
        localStorage.setItem(`openmasq.conversations:${uid}`, JSON.stringify(convs));
        localStorage.setItem(`openmasq.activeId:${uid}`, convs[0].id); // BRUT, pas du JSON
      }
    },
    { uid: UID, authKey: AUTH_KEY, o: opts as Record<string, unknown> },
  );
}

/** Une conversation vide, prête à recevoir un envoi. */
export function emptyConversation(id = "c1", modelId = "llama3.3") {
  const now = Date.now();
  return { id, title: "Parcours", modelId, createdAt: now, updatedAt: now, messages: [] };
}

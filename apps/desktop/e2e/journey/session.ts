import type { Page } from "@playwright/test";

/** The simulated account's identifier. Everything is SCOPED to it app-side (`…:u1`). */
export const UID = "u1";
/** The Supabase session key the renderer reads at startup. */
import { supabaseAuthStorageKey } from "../supabaseAuthKey";
const AUTH_KEY = supabaseAuthStorageKey();

export interface SeedOptions {
  /** `openaiCompatBaseUrl` — the local dummy endpoint. */
  baseUrl?: string;
  /** id of the model served by this endpoint. */
  modelId?: string;
  /** `Settings` fields to set on top of the base (coffre, compétences, theme…). */
  settings?: Record<string, unknown>;
  /** Conversations to pre-seed (SCOPED key `openmasq.conversations:u1`). */
  conversations?: unknown[];
  /** `false` to replay onboarding: the base then does NOT set `onboarded`. */
  onboarded?: boolean;
}

/**
 * Sets, in the renderer's `localStorage`, a run's starting state: a signed-in
 * session, settings, conversations.
 *
 * ⚠️ Three traps this module exists to stop making people pay for, each silent:
 *  - the session must be COMPLETE (a minimal shape reopens the sign-in modal);
 *  - conversations and settings are SCOPED to the account — the bare
 *    `openmasq.conversations` key is ignored, and `openmasq.activeId:u1` is read RAW, not as JSON;
 *  - coffre, compétences and workflows are FIELDS of `Settings`, not keys of their own;
 *    an empty list renders no selector, which looks like a bug.
 *
 * The caller must `page.reload()` afterward: the app has already read storage on first render.
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
      // The BARE key serves the pre-auth render; the SCOPED one is what the account re-reads.
      localStorage.setItem("openmasq.settings", blob);
      localStorage.setItem(`openmasq.settings:${uid}`, blob);
      const convs = (o.conversations ?? []) as { id: string }[];
      if (convs.length) {
        localStorage.setItem(`openmasq.conversations:${uid}`, JSON.stringify(convs));
        localStorage.setItem(`openmasq.activeId:${uid}`, convs[0].id); // RAW, not JSON
      }
    },
    { uid: UID, authKey: AUTH_KEY, o: opts as Record<string, unknown> },
  );
}

/** An empty conversation, ready to receive a send. */
export function emptyConversation(id = "c1", modelId = "llama3.3") {
  const now = Date.now();
  return { id, title: "Parcours", modelId, createdAt: now, updatedAt: now, messages: [] };
}

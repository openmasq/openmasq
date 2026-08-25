import { useEffect, useMemo, useState } from "react";
import { useHost } from "../../../host";
import { analyticsDistinctId } from "../../../analytics";
import { levelOf } from "../../../privacy/privacyLevel";
import type { AvisOpenApi } from "../../providers/avisOpen";
import type { FeedbackContext, FeedbackDraft } from "../../../avis/avis";
import type { ChatStore } from "../../../state/store";
import type { Section, Settings } from "../../../types";

/**
 * "Votre avis" — only offered where there is somewhere to send it (`host.avis`).
 * `open` non-null = the modal is up; its `prefill` seeds the draft when a
 * « Signaler » affordance (redaction-mark popover, document viewers) opened it,
 * never the rail button. Those deep surfaces reach the modal through `api`
 * (the `AvisOpenProvider` value) — undefined without `host.avis`, which hides
 * their affordance entirely.
 *
 * This hook also assembles the avis' TECHNICAL CONTEXT, because it is the one place
 * that already sees both halves of it: what the host knows about the build (version,
 * OS, channel) and what the app knows about the moment (screen, model, protection
 * level). `buildFeedback` remains the choke point that decides what of it is sent.
 *
 * Every field is best-effort and INDEPENDENT: a host slot may be absent (the browser
 * preview has no `app`, an un-restarted preload no `updates`), and an avis missing one
 * line is still worth infinitely more than no avis.
 */
export function useAvis({ chat, section }: { chat: ChatStore; section: Section }): {
  open: { prefill?: FeedbackDraft } | null;
  setOpen: (v: { prefill?: FeedbackDraft } | null) => void;
  api: AvisOpenApi;
  context: FeedbackContext;
} {
  const host = useHost();
  const [open, setOpen] = useState<{ prefill?: FeedbackDraft } | null>(null);
  const api = useMemo<AvisOpenApi>(
    () => (host.avis ? { openAvis: (prefill) => setOpen({ prefill }) } : {}),
    [host.avis],
  );

  // Read once: the build cannot change under a running app. `channel` is what tells a
  // staging report from a real user's — the version alone does not, the two ship the
  // same number. `analyticsId` est l'identité PostHog de l'installation — LE champ qui
  // permet de joindre la fiche à la télémétrie du poste ; même résolution que le sink
  // (une seule identité par session), et même posture best-effort que le reste.
  const [build, setBuild] = useState<{
    version?: string;
    os?: string;
    channel?: string;
    analyticsId?: string;
  }>({});
  useEffect(() => {
    let alive = true;
    void Promise.all([
      host.app?.versions().catch(() => undefined),
      host.updates?.current().catch(() => undefined),
      analyticsDistinctId().catch(() => undefined),
    ]).then(([v, u, aid]) => {
      if (alive) setBuild({ version: v?.app, os: v?.os, channel: u?.channel, analyticsId: aid });
    });
    return () => {
      alive = false;
    };
  }, [host.app, host.updates]);

  const conv = chat.conversations.find((c) => c.id === chat.activeId);
  const context = useMemo<FeedbackContext>(
    () => ({
      ...build,
      section,
      // The model of the conversation the user is looking at, else the default they
      // would send with — an id, never a message.
      model: conv?.modelId || chat.settings.defaultModelId,
      // The level ACTUALLY in force here: the conversation's override over the global
      // map, org-forced categories excluded exactly as the settings screen does it, so
      // a card never reads « custom » for a policy the member did not choose.
      level: levelOf(
        { ...chat.settings.redactCategories, ...(conv?.redactCategories ?? {}) } as Settings["redactCategories"],
        chat.orgProfile?.forcedCategories,
      ),
    }),
    [
      build,
      section,
      conv?.modelId,
      conv?.redactCategories,
      chat.settings.defaultModelId,
      chat.settings.redactCategories,
      chat.orgProfile?.forcedCategories,
    ],
  );

  return { open, setOpen, api, context };
}

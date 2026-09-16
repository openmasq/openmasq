import { useCallback, type MutableRefObject } from "react";
import { pseudonymize, redactionCategory, type RedactionMatch } from "@openmasq/redact";
import type { Host, OrgProfileInfo } from "../../host";
import type { Conversation, Settings } from "../../types";
import { levelOf, notorietyForLevel } from "../../privacy/privacyLevel";
import { redactNumbersOn } from "../../send/redactNumbers";
import { disabledKindsOf, effectiveRedactCategories } from "../../send/redactionOptions";

export interface PiiPreview {
  matches: { value: string; category: string; uncertain?: boolean }[];
  engine: Settings["redactEngine"];
  error?: string;
}

/**
 * READ-ONLY live PII detection for the composer preview. Same engine as the send, but
 * against a THROWAWAY vault and without the debug/analytics pipelines (it fires per
 * keystroke debounce). Only a preview: `sendMessage` re-runs redaction and FAIL-CLOSES
 * before anything leaves the machine, so a failed or stale preview can never leak.
 * Render-stable (deps `[]`, volatile state via refs) so the composer's debounce settles.
 */
export function useDetectPii({
  settingsRef,
  hostRef,
  conversationsRef,
  activeIdRef,
  orgProfileRef,
  keepListRef,
}: {
  settingsRef: MutableRefObject<Settings>;
  hostRef: MutableRefObject<Host>;
  conversationsRef: MutableRefObject<Conversation[]>;
  activeIdRef: MutableRefObject<string | null>;
  orgProfileRef: MutableRefObject<OrgProfileInfo | null>;
  keepListRef: MutableRefObject<string[]>;
}) {
  return useCallback(
    // `convId` = the CALLER'S pane, not the store's global `activeId`: in the split
    // workspace each pane resolves its own conversation's rules.
    async (text: string, signal?: AbortSignal, convId?: string | null): Promise<PiiPreview> => {
      const settings = settingsRef.current;
      const host = hostRef.current;
      const engine = settings.redactEngine;
      const throwIfAborted = () => {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      };
      if (!text.trim()) return { matches: [], engine };

      // `redactEngine` is only ever "local" or "patterns" here: `normalizeSettings`
      // coerces retired engines to "local". Never reintroduce a remote branch.
      const useLocal = engine === "local" && !!host.detectLocalPii;

      // The SAME effective-categories function the send calls, so the preview highlights
      // exactly what will be redacted, notoriety exemption included.
      const conv = conversationsRef.current.find((c) => c.id === (convId ?? activeIdRef.current));
      const effective = effectiveRedactCategories(
        settings.redactCategories,
        conv?.redactCategories,
        orgProfileRef.current?.forcedCategories,
      );
      const { commercial: commercialNotoriety, people: peopleNotoriety } = notorietyForLevel(
        levelOf(effective, orgProfileRef.current?.forcedCategories),
      );
      // Connected-integration names are never flagged, like the send. The CACHED list —
      // never re-query the MCP servers per keystroke.
      const keep = keepListRef.current;
      const detectLocalFn = useLocal && host.detectLocalPii ? (t: string) => host.detectLocalPii!({ text: t }) : undefined;

      try {
        const res = await pseudonymize(text, {
          vault: {},
          numbers: useLocal ? redactNumbersOn(settings) : false,
          detectLocal: detectLocalFn,
          disabledKinds: disabledKindsOf(effective),
          keep,
          commercialNotoriety,
          peopleNotoriety,
        });
        throwIfAborted();
        return {
          matches: (res.matches as RedactionMatch[]).map((m) => ({
            value: m.value,
            category: redactionCategory(m.category ?? m.type),
            uncertain: m.uncertain,
          })),
          engine,
        };
      } catch (e) {
        if (signal?.aborted) throw e; // let the composer drop a superseded call
        return { matches: [], engine, error: e instanceof Error ? e.message : String(e) };
      }
    },
    [],
  );
}

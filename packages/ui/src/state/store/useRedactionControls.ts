import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { redactionCategory } from "@openmasq/redact";
import type { OrgProfileInfo } from "../../host";
import type { Conversation, Settings, VaultTerm } from "../../types";
import { makeVaultTerm, vaultHasValue } from "../../send/vaultTerms";

type Patch = (id: string, patch: (c: Conversation) => Conversation) => void;

/**
 * Per-conversation un-redaction (reveal / force) and the COFFRE (values always redacted,
 * across every conversation and model, persisted in `Settings.coffre`). An org-FORCED
 * category can never be revealed: the reveal actions no-op and the UI shows a lock.
 */
export function useRedactionControls({
  active,
  activeId,
  patchConversation,
  orgProfileRef,
  coffre,
  setSettings,
}: {
  active: Conversation | null;
  activeId: string | null;
  patchConversation: Patch;
  orgProfileRef: MutableRefObject<OrgProfileInfo | null>;
  coffre: VaultTerm[] | undefined;
  setSettings: Dispatch<SetStateAction<Settings>>;
}) {
  const isRevealForced = useCallback(
    (value: string): boolean => {
      const forced = orgProfileRef.current?.forcedCategories;
      if (!forced?.length) return false;
      const kind = active?.redactionKinds?.[value];
      const cat = kind ? redactionCategory(kind) : undefined;
      return !!cat && forced.includes(cat);
    },
    [active],
  );

  /** `suspend` keeps the vault mapping (reversible via `reRedact`); `delete` also drops
   *  it. Both add the value to `revealedValues` so the NEXT send keeps it in clear, and
   *  un-force it (the manual-redaction undo path). */
  const revealRedaction = useCallback(
    (value: string, mode: "suspend" | "delete"): boolean => {
      const id = activeId;
      if (!id || isRevealForced(value)) return false;
      patchConversation(id, (c) => {
        const revealed = new Set(c.revealedValues ?? []);
        revealed.add(value);
        let redactionVault = c.redactionVault;
        let redactionKinds = c.redactionKinds;
        if (mode === "delete") {
          const ph = redactionVault ? Object.entries(redactionVault).find(([, v]) => v === value)?.[0] : undefined;
          if (ph && redactionVault) {
            redactionVault = { ...redactionVault };
            delete redactionVault[ph];
          }
          if (redactionKinds && value in redactionKinds) {
            redactionKinds = { ...redactionKinds };
            delete redactionKinds[value];
          }
        }
        const forcedRedactions = (c.forcedRedactions ?? []).filter((f) => f.value !== value);
        return { ...c, revealedValues: [...revealed], forcedRedactions, redactionVault, redactionKinds, updatedAt: Date.now() };
      });
      return true;
    },
    [activeId, patchConversation, isRevealForced],
  );

  /** Manually FORCE a value to be redacted for a conversation, AS `category`; also drops
   *  it from `revealedValues` (the opposite action). */
  const forceRedact = useCallback(
    (value: string, category: string, convId?: string) => {
      const id = convId ?? activeId;
      const v = value.trim();
      if (!id || !v) return;
      patchConversation(id, (c) => {
        const forced = (c.forcedRedactions ?? []).filter((f) => f.value !== v);
        forced.push({ value: v, category });
        return {
          ...c,
          forcedRedactions: forced,
          revealedValues: (c.revealedValues ?? []).filter((x) => x !== v),
          updatedAt: Date.now(),
        };
      });
    },
    [activeId, patchConversation],
  );

  const unforceRedact = useCallback(
    (value: string, convId?: string) => {
      const id = convId ?? activeId;
      if (!id) return;
      patchConversation(id, (c) => ({
        ...c,
        forcedRedactions: (c.forcedRedactions ?? []).filter((f) => f.value !== value),
        updatedAt: Date.now(),
      }));
    },
    [activeId, patchConversation],
  );

  /** Undo a "suspend": re-redact the value on the next send. */
  const reRedact = useCallback(
    (value: string) => {
      const id = activeId;
      if (!id) return;
      patchConversation(id, (c) => ({
        ...c,
        revealedValues: (c.revealedValues ?? []).filter((v) => v !== value),
        updatedAt: Date.now(),
      }));
    },
    [activeId, patchConversation],
  );

  /** Add to the coffre (deduped case-insensitively); returns the new or existing entry.
   *  `token` = a canonical pseudonymize category (`NAME`/`ORG`/`IBAN`…). */
  const addVaultTerm = useCallback((value: string, token: string, note?: string): VaultTerm | null => {
    const v = value.trim();
    if (!v) return null;
    let entry: VaultTerm | null = null;
    setSettings((s) => {
      const vaultTerms = s.coffre ?? [];
      const existing = vaultTerms.find((t) => t.value.trim().toLowerCase() === v.toLowerCase());
      if (existing) {
        entry = existing;
        return s;
      }
      entry = makeVaultTerm(v, token, note);
      return { ...s, coffre: [entry, ...vaultTerms] };
    });
    return entry;
  }, []);
  const removeVaultTerm = useCallback((id: string) => {
    setSettings((s) => ({ ...s, coffre: (s.coffre ?? []).filter((t) => t.id !== id) }));
  }, []);
  const updateVaultTerm = useCallback((id: string, patch: Partial<Omit<VaultTerm, "id">>) => {
    setSettings((s) => ({ ...s, coffre: (s.coffre ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }, []);
  const vaultHas = useCallback((value: string) => vaultHasValue(coffre, value), [coffre]);

  return {
    isRevealForced,
    revealRedaction,
    forceRedact,
    unforceRedact,
    reRedact,
    addVaultTerm,
    removeVaultTerm,
    updateVaultTerm,
    vaultHas,
  };
}

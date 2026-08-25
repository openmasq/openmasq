import { AnimatePresence } from "framer-motion";
import { PROVIDERS, type ProviderId } from "@openmasq/llm";
import { ApiKeyModal, ModelAccessModal } from "../../../containers/modals";

/**
 * The two modals the Modèles tab can open — the free-models explainer (from a card's
 * badge) and a provider's API-key form (from its gear). Peeled off `ModelsTab` so that
 * file stays about the page's structure rather than its overlays.
 */
export function ModelsTabModals({
  freeInfoOpen,
  onCloseFreeInfo,
  onSubscribe,
  keyProvider,
  onCloseKey,
  onSetApiKey,
  onClearApiKey,
  keyConfigured,
  onConnectOpenRouter,
}: {
  freeInfoOpen: boolean;
  onCloseFreeInfo: () => void;
  /** Omitted for an account that already pays (or has no billing path): the modal then
   *  states premium is covered instead of pitching it. */
  onSubscribe?: () => void;
  keyProvider: ProviderId | null;
  onCloseKey: () => void;
  onSetApiKey: (id: string, value: string) => void | Promise<void>;
  /** Retirer la clé d'un fournisseur. Absent ⇒ la modale n'offre pas le retrait. */
  onClearApiKey?: (id: string) => void | Promise<void>;
  /** Les fournisseurs qui ont DÉJÀ une clé : la modale doit dire lequel des deux cas
   *  elle est en train de jouer (ajouter / remplacer). */
  keyConfigured?: ReadonlySet<string>;
  /** OAuth PKCE — offered INSIDE the key modal, for the provider that has it. */
  onConnectOpenRouter?: () => Promise<boolean>;
}) {
  return (
    <>
      <AnimatePresence>
        {freeInfoOpen && (
          // No onOwnKeys: the user is ALREADY on the keys page — the card points at the
          // gears instead of navigating in a circle.
          <ModelAccessModal onClose={onCloseFreeInfo} onSubscribe={onSubscribe} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {keyProvider && (
          <ApiKeyModal
            provider={keyProvider}
            label={PROVIDERS[keyProvider].label}
            keyUrl={PROVIDERS[keyProvider].keyUrl}
            saveLabel="Enregistrer"
            hasKey={!!keyConfigured?.has(keyProvider)}
            onClear={onClearApiKey ? () => onClearApiKey(keyProvider) : undefined}
            onSave={(v) => onSetApiKey(keyProvider, v)}
            onConnect={keyProvider === "openrouter" ? onConnectOpenRouter : undefined}
            onClose={onCloseKey}
          />
        )}
      </AnimatePresence>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useHost } from "../../host";
import { ModalShell } from "./ModalShell";

type Choice = "account" | "anonymous";
type Pending = { id: string; name: string; resolve: (choice: Choice) => void };

/**
 * Replaces the ugly NATIVE Electron popup that used to ask, when connecting a
 * connector that allows both signed-in and anonymous access (Firecrawl…), whether
 * to use the user's own account (their credits/quotas/scope) or anonymous, limited
 * access. The desktop main process now asks the renderer over `mcp.onAuthChoice`
 * and awaits this styled in-app modal instead of `dialog.showMessageBox`.
 *
 * Escape / scrim / closing resolves to "anonymous" — the safe default (matching the
 * old dialog's cancel button), never blocking the connect.
 */
export function McpAuthChoiceModal() {
  const host = useHost();
  const [pending, setPending] = useState<Pending | null>(null);
  // Guards against a resolve firing twice (choose then unmount-close).
  const answered = useRef(false);

  useEffect(() => {
    const onAuthChoice = host.mcp?.onAuthChoice;
    if (!onAuthChoice) return;
    return onAuthChoice(
      (req) =>
        new Promise<Choice>((resolve) => {
          answered.current = false;
          setPending({ id: req.id, name: req.name, resolve });
        }),
    );
  }, [host]);

  const answer = (choice: Choice) => {
    if (!pending) return;
    if (!answered.current) {
      answered.current = true;
      pending.resolve(choice);
    }
    setPending(null);
  };

  return (
    <AnimatePresence>
      {pending && (
        <ModalShell onClose={() => answer("anonymous")} width="480px">
          <div className="confirm-body">
            <h2 className="cv-display confirm-title">Se connecter à {pending.name}</h2>
            <p className="confirm-text">
              {pending.name} peut être utilisé avec votre compte ou en accès anonyme. Vous pourrez
              changer plus tard en le reconnectant.
            </p>
          </div>

          <div className="sendmode-options">
            <button className="sendmode-opt sendmode-opt--accent" onClick={() => answer("account")}>
              <span className="sendmode-opt-title">Se connecter avec mon compte</span>
              <span className="sendmode-opt-desc">
                Utilise vos crédits, quotas et accès — comme sur {pending.name}.
              </span>
            </button>

            <button className="sendmode-opt" onClick={() => answer("anonymous")}>
              <span className="sendmode-opt-title">Utiliser sans compte</span>
              <span className="sendmode-opt-desc">
                Accès anonyme, limité — aucun identifiant, quotas partagés.
              </span>
            </button>
          </div>

          <div className="confirm-footer">
            <button className="btn-ghost" onClick={() => answer("anonymous")}>
              Annuler
            </button>
          </div>
        </ModalShell>
      )}
    </AnimatePresence>
  );
}

import { useRef, useState } from "react";
import { ModalShell, ModalTitle } from "../../../containers/modals";
import { ModelLogo, ShieldIcon } from "../../../components/brand";
import { BrandLoader } from "../../../components/media/BrandLogo";
import type { Conversation } from "../../../types";
import type { ImportOutcome, ImportProvider } from "../../../import";
import { runImport, PROVIDER_LABEL } from "./importRunner";

/** Where each provider's official export lives — shown under the selected tile. */
const PROVIDER_HINT: Record<ImportProvider, string> = {
  chatgpt:
    "chatgpt.com → Réglages → Contrôles des données → Exporter. Déposez ici le .zip reçu par e-mail.",
  claude:
    "claude.ai → Réglages → Confidentialité → Exporter. Déposez ici l'archive reçue par e-mail.",
};

type Phase =
  | { step: "pick" }
  | { step: "working"; done: number; total: number }
  | { step: "done"; outcome: ImportOutcome };

/**
 * « Importer des conversations » (BÊTA) — Réglages → Compte. The user picks the
 * source assistant, drops its OFFICIAL export (zip/json), and everything happens
 * on-device: parse → import-time redaction (vault per conversation) → merge with
 * dedup. Gemini is greyed: Google Takeout doesn't preserve thread structure.
 */
export function ImportModal({
  defaultModelId,
  disabledKinds,
  wireTokens,
  onImport,
  onClose,
}: {
  defaultModelId: string;
  disabledKinds: string[];
  /** Le réglage « le modèle ne voit que des jetons » : le coffre de ces conversations est
   *  constitué à l'import, donc le mode y est figé une fois pour toutes. */
  wireTokens?: boolean;
  onImport: (convs: Conversation[]) => ImportOutcome;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<ImportProvider>("chatgpt");
  const [phase, setPhase] = useState<Phase>({ step: "pick" });
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File) {
    setError(null);
    setPhase({ step: "working", done: 0, total: 0 });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const convs = await runImport({
        bytes,
        provider,
        modelId: defaultModelId,
        disabledKinds,
        mode: wireTokens ? "token" : "fake",
        onProgress: (done, total) => setPhase({ step: "working", done, total }),
      });
      setPhase({ step: "done", outcome: onImport(convs) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'import a échoué. Réessayez.");
      setPhase({ step: "pick" });
    }
  }

  return (
    <ModalShell onClose={onClose} width="560px">
      {/* `.modal-panel` carries no padding — every modal pads its own content (house
          measure: 26px sides, matching `.rrm-head`/`.rrm-body`). */}
      <div className="px-[26px] pt-[22px] pb-[22px]">
      <div className="flex items-center gap-2.5 mb-1">
        <ModalTitle>Importer des conversations</ModalTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] rounded-[3px] px-1.5 py-0.5 bg-[var(--hl-violet)] text-[color:var(--ink-on-hl)]">
          Bêta
        </span>
      </div>
      <p className="text-sm text-muted mb-4">
        Récupérez vos fils depuis un autre assistant via son export officiel. Tout se passe sur
        votre appareil : le fichier n'est envoyé nulle part.
      </p>

      {phase.step === "pick" && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(["chatgpt", "claude"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className={`flex flex-col items-center gap-2 py-3.5 rounded-[var(--radius-md)] bg-surface-card border-[1.5px] cursor-pointer transition-colors ${
                  provider === p ? "border-[var(--text-strong)]" : "border-border-default"
                }`}
              >
                <ModelLogo provider={p === "chatgpt" ? "openai" : "anthropic"} size={22} />
                <span className="text-sm font-semibold text-strong">{PROVIDER_LABEL[p]}</span>
              </button>
            ))}
            <div
              className="flex flex-col items-center gap-2 py-3.5 rounded-[var(--radius-md)] bg-surface-sunken border-[1.5px] border-border-subtle opacity-55"
              title="Google Takeout ne préserve pas la structure des fils — bientôt."
            >
              <ModelLogo provider="google" size={22} />
              <span className="text-sm font-semibold text-muted">Gemini · bientôt</span>
            </div>
          </div>

          <p className="text-xs text-muted leading-relaxed mb-3">{PROVIDER_HINT[provider]}</p>

          {error && (
            <div role="alert" className="mb-3 text-sm text-[var(--red-500,#d4493f)]">
              {error}
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".zip,.json,application/zip,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ""; // allow re-picking the same file after an error
              if (f) void onFile(f);
            }}
          />
          <button type="button" className="btn-primary w-full justify-center" onClick={() => fileRef.current?.click()}>
            Choisir le fichier d'export {PROVIDER_LABEL[provider]}…
          </button>

          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted">
            <ShieldIcon size={13} />
            Les valeurs sensibles détectées sont redacted dès l'import : si vous poursuivez un fil
            ici, son historique part masqué.
          </div>
        </>
      )}

      {phase.step === "working" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <BrandLoader size={30} mono />
          <span className="text-sm text-muted">
            {phase.total > 0
              ? `Redaction des conversations… ${phase.done} / ${phase.total}`
              : "Lecture de l'export…"}
          </span>
        </div>
      )}

      {phase.step === "done" && (
        <div className="flex flex-col gap-3 py-2">
          <div className="text-base text-strong font-semibold">
            {phase.outcome.added.toLocaleString("fr-FR")} conversation
            {phase.outcome.added === 1 ? "" : "s"} importée{phase.outcome.added === 1 ? "" : "s"}
            {phase.outcome.skipped > 0 &&
              ` · ${phase.outcome.skipped.toLocaleString("fr-FR")} déjà présente${phase.outcome.skipped === 1 ? "" : "s"} (ignorée${phase.outcome.skipped === 1 ? "" : "s"})`}
          </div>
          <p className="text-sm text-muted m-0">
            Retrouvez-les dans vos conversations. Fonctionnalité en bêta : la détection à l'import
            utilise le moteur standard ; vos nouveaux messages bénéficient de la détection complète
            à l'envoi.
          </p>
          <button type="button" className="btn-primary self-start" onClick={onClose}>
            Fermer
          </button>
        </div>
      )}
      </div>
    </ModalShell>
  );
}

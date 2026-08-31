import { useRef, useState } from "react";
import { ModalShell, ModalTitle } from "../../../containers/modals";
import { ModelLogo, ShieldIcon } from "../../../components/brand";
import { BrandLoader } from "../../../components/media/BrandLogo";
import type { Conversation } from "../../../types";
import type { ImportOutcome, ImportProvider } from "../../../import";
import { runImport, PROVIDER_LABEL } from "./importRunner";

import { useT } from "../../../i18n";
/** Where each provider's official export lives — shown under the selected tile. */

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
  /** The "the model only ever sees tokens" setting: these conversations' vault is
   *  built at import time, so the mode is frozen there once and for all. */
  wireTokens?: boolean;
  onImport: (convs: Conversation[]) => ImportOutcome;
  onClose: () => void;
}) {
  const [provider, setProvider] = useState<ImportProvider>("chatgpt");
  const t = useT();
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
      setError(e instanceof Error ? e.message : t.importModal.failed);
      setPhase({ step: "pick" });
    }
  }

  return (
    <ModalShell onClose={onClose} width="560px">
      {/* `.modal-panel` carries no padding — every modal pads its own content (house
          measure: 26px sides, matching `.rrm-head`/`.rrm-body`). */}
      <div className="px-[26px] pt-[22px] pb-[22px]">
      <div className="flex items-center gap-2.5 mb-1">
        <ModalTitle>{t.importModal.title}</ModalTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] rounded-[3px] px-1.5 py-0.5 bg-[var(--hl-violet)] text-[color:var(--ink-on-hl)]">
          {t.importModal.beta}
        </span>
      </div>
      <p className="text-sm text-muted mb-4">
        {t.importModal.sub}
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
              title={t.importModal.geminiSoonTip}
            >
              <ModelLogo provider="google" size={22} />
              <span className="text-sm font-semibold text-muted">{t.importModal.geminiSoon}</span>
            </div>
          </div>

          <p className="text-xs text-muted leading-relaxed mb-3">{provider === "chatgpt" ? t.importModal.hintChatgpt : t.importModal.hintClaude}</p>

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
            {t.importModal.choose(PROVIDER_LABEL[provider])}
          </button>

          <div className="flex items-center gap-1.5 mt-3 text-xs text-muted">
            <ShieldIcon size={13} />
            {t.importModal.maskedNote}
          </div>
        </>
      )}

      {phase.step === "working" && (
        <div className="flex flex-col items-center gap-3 py-8">
          <BrandLoader size={30} mono />
          <span className="text-sm text-muted">
            {phase.total > 0
              ? t.importModal.redacting(phase.done, phase.total)
              : t.importModal.reading}
          </span>
        </div>
      )}

      {phase.step === "done" && (
        <div className="flex flex-col gap-3 py-2">
          <div className="text-base text-strong font-semibold">
            {t.importModal.imported(phase.outcome.added)}
            {phase.outcome.skipped > 0 && t.importModal.skipped(phase.outcome.skipped)}
          </div>
          <p className="text-sm text-muted m-0">
            {t.importModal.doneNote}
          </p>
          <button type="button" className="btn-primary self-start" onClick={onClose}>
            {t.importModal.close}
          </button>
        </div>
      )}
      </div>
    </ModalShell>
  );
}

import { useT } from "../../../i18n";

/** The two local-model fields, as one prop so the tab passes one thing. */
export interface LocalModelProps {
  url: string;
  onUrl: (url: string) => void;
  /** Free text: ids the server does not list (`Settings.openaiCompatModelIds`). */
  ids: string;
  onIds: (ids: string) => void;
}

/**
 * « Modèle sur votre ordinateur » — the OpenAI-compatible endpoint (Ollama, LM Studio, a
 * LAN box…) and, under it, the ids to offer on top of what that server lists itself.
 *
 * It lives on the Modèles tab because a local model IS a model choice, and in its own
 * file because it shares nothing with the catalogue above it. The picker's local group is
 * NOT edited here: it is read from the server (`hooks/useLocalModels.ts`) — this section
 * only says where the server is, and what to add to its answer.
 */
export function LocalModelSection({ url, onUrl, ids, onIds }: LocalModelProps) {
  const t = useT();
  return (
    <section className="settings-section">
      <div className="cv-eyebrow">{t.modelPicker.local.eyebrow}</div>
      <p className="modal-note">{t.modelPicker.local.note}</p>
      <div className="settings-card pad">
        <label className="field">
          <span className="field-label">{t.modelPicker.local.label}</span>
          <input
            type="text"
            placeholder="http://localhost:11434/v1"
            value={url}
            onChange={(e) => onUrl(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">{t.modelPicker.local.idsLabel}</span>
          <input
            type="text"
            placeholder={t.modelPicker.local.idsPlaceholder}
            value={ids}
            onChange={(e) => onIds(e.target.value)}
          />
          <span className="field-hint">{t.modelPicker.local.idsHint}</span>
        </label>
      </div>
    </section>
  );
}

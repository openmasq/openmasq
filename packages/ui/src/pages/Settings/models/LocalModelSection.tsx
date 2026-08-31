import { useT } from "../../../i18n";
/**
 * « Modèle sur votre ordinateur » — the OpenAI-compatible endpoint (Ollama, LM Studio…).
 *
 * It lives on the Modèles tab because a local model IS a model choice, and in its own
 * file because it shares nothing with the catalogue above it: one field, one concern.
 */
export function LocalModelSection({
  url,
  onUrl,
}: {
  url: string;
  onUrl: (url: string) => void;
}) {
  const t = useT();
  return (
    <section className="settings-section">
      <div className="cv-eyebrow">{t.modelPicker.local.eyebrow}</div>
      <p className="modal-note">
        {t.modelPicker.local.note}
      </p>
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
      </div>
    </section>
  );
}

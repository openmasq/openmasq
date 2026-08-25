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
  return (
    <section className="settings-section">
      <div className="cv-eyebrow">Modèle sur votre ordinateur</div>
      <p className="modal-note">
        Si vous faites tourner un modèle d'IA sur votre propre ordinateur (avec Ollama,
        LM Studio…), indiquez son adresse ici.
      </p>
      <div className="settings-card pad">
        <label className="field">
          <span className="field-label">Adresse du modèle</span>
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

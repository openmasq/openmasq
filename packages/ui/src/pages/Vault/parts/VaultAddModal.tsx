import { useState, type CSSProperties } from "react";
import { hueForKind } from "@openmasq/redact";
import { ModalShell } from "../../../containers/modals/ModalShell";
import { CheckIcon, LockIcon } from "../../../components/brand";
import { REDACT_TYPES } from "@openmasq/redact";

/**
 * The Coffre's ADD modal (design-kit `VaultAddModal`): term + type chips + an
 * optional note, under a head band tinted live by the chosen type's hue. Pure —
 * the page owns the list; this collects one `{value, token, note}` and hands it
 * to `onAdd`.
 */
export function VaultAddModal({
  onClose,
  onAdd,
}: {
  onClose: () => void;
  onAdd: (value: string, token: string, note?: string) => void;
}) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [token, setToken] = useState(REDACT_TYPES[0].token);
  const tone = hueForKind(token);
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v, token, note.trim() || undefined);
  };
  return (
    <ModalShell onClose={onClose} width="540px" maxHeight="88vh">
      {/* Head band wears the SELECTED type's hue (runtime data → inline var). */}
      <div
        className="om-vault-addm-head"
        style={{ "--addm-tone": `var(--hl-${tone})` } as CSSProperties}
      >
        <span className="om-vault-addm-tile">
          <LockIcon size={20} />
        </span>
        <div className="om-vault-addm-titles">
          <div className="cv-display om-vault-addm-title">
            <span className="om-mark">Ajouter au coffre</span>
          </div>
          <div className="om-vault-addm-sub">
            Ce terme sera masqué avant chaque envoi, quel que soit le modèle.
          </div>
        </div>
      </div>

      <div className="om-vault-addm-body">
        <div>
          <label className="cv-eyebrow om-vault-addm-label" htmlFor="om-vault-addm-term">
            Terme à redact
          </label>
          <input
            id="om-vault-addm-term"
            className="om-vault-addm-term"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="ex. Projet Northwind, FR76 3000…"
            autoFocus
          />
        </div>

        <div>
          <div className="cv-eyebrow om-vault-addm-label">Type de donnée</div>
          <div className="om-vault-addm-types">
            {REDACT_TYPES.map((t) => {
              const on = t.token === token;
              const h = hueForKind(t.token);
              return (
                <button
                  key={t.token}
                  type="button"
                  className={`om-vault-addm-type${on ? " on" : ""}`}
                  onClick={() => setToken(t.token)}
                  aria-pressed={on}
                  style={{ "--addm-tone": `var(--hl-${h})` } as CSSProperties}
                >
                  <span className="om-vault-addm-type-dot" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="cv-eyebrow om-vault-addm-label" htmlFor="om-vault-addm-note">
            Note (optionnel)
          </label>
          <input
            id="om-vault-addm-note"
            className="om-vault-addm-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="ex. Nom de code interne"
          />
        </div>
      </div>

      <div className="om-vault-addm-foot">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="btn-primary" onClick={submit} disabled={!value.trim()}>
          <CheckIcon size={15} /> Ajouter au coffre
        </button>
      </div>
    </ModalShell>
  );
}

import { useMemo, useState, type CSSProperties } from "react";
import { hueForKind } from "@openmasq/redact";
import { ModalShell } from "../../../containers/modals/ModalShell";
import { CheckIcon, ChevDownIcon, LockIcon } from "../../../components/brand";
import { REDACT_TYPES } from "@openmasq/redact";
import type { VaultTerm } from "../../../types";
import { DEFAULT_TOKEN, FREQUENT_TYPE_KEYS, guessVaultToken, vaultTokenLabel } from "../vaultTypes";

import { useT } from "../../../i18n";
/**
 * The Coffre's ADD / EDIT modal (design-kit `VaultAddModal`): term + category chips +
 * an optional note, under a head band tinted live by the category's hue. Pure — the
 * page owns the list; this collects one `{value, token, note}` and hands it to
 * `onSubmit`.
 *
 * The category is INFERRED from the value (`guessVaultToken`, the engine's own
 * detectors) until the person picks one — so the daily gesture is paste + Enter. Only
 * the five frequent categories show; the other nine unfold on demand, or by
 * themselves when the guess (or the edited term) lands among them.
 */
export function VaultAddModal({
  onClose,
  onSubmit,
  initial,
}: {
  onClose: () => void;
  onSubmit: (value: string, token: string, note?: string) => void;
  /** Present ⇒ EDIT an existing term (title, button and category follow). */
  initial?: VaultTerm;
}) {
  const t = useT();
  const [value, setValue] = useState(initial?.value ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  // `null` = nothing picked yet: the category follows the value's shape.
  const [picked, setPicked] = useState<string | null>(initial?.token ?? null);
  const guessed = useMemo(() => guessVaultToken(value), [value]);
  const token = picked ?? guessed ?? DEFAULT_TOKEN;
  const detected = picked === null && guessed !== null;
  const tone = hueForKind(token);
  const frequent = REDACT_TYPES.filter((x) => FREQUENT_TYPE_KEYS.includes(x.key));
  const [showAll, setShowAll] = useState(false);
  const expanded = showAll || !frequent.some((x) => x.token === token);
  const types = expanded ? REDACT_TYPES : frequent;
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v, token, note.trim() || undefined);
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
            <span className="om-mark">{initial ? t.lists.vault.add.titleEdit : t.lists.vault.add.title}</span>
          </div>
          <div className="om-vault-addm-sub">
            {initial ? t.lists.vault.add.subEdit : t.lists.vault.add.sub}
          </div>
        </div>
      </div>

      <div className="om-vault-addm-body">
        <div>
          <label className="cv-eyebrow om-vault-addm-label" htmlFor="om-vault-addm-term">
            {t.lists.vault.add.term}
          </label>
          <input
            id="om-vault-addm-term"
            className="om-vault-addm-term"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t.lists.vault.add.termPlaceholder}
            autoFocus
          />
        </div>

        <div>
          <div className="cv-eyebrow om-vault-addm-label">
            {t.lists.vault.add.type}
            {detected && <span className="om-vault-addm-detected"> · {t.lists.vault.add.detected}</span>}
          </div>
          <div className="om-vault-addm-types">
            {types.map((x) => {
              const on = x.token === token;
              return (
                <button
                  key={x.token}
                  type="button"
                  className={`om-vault-addm-type${on ? " on" : ""}`}
                  onClick={() => setPicked(x.token)}
                  aria-pressed={on}
                  style={{ "--addm-tone": `var(--hl-${hueForKind(x.token)})` } as CSSProperties}
                >
                  <span className="om-vault-addm-type-dot" />
                  {vaultTokenLabel(x.token, t)}
                </button>
              );
            })}
            <button
              type="button"
              className={`om-vault-addm-more${expanded ? " on" : ""}`}
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={expanded}
            >
              <ChevDownIcon size={13} />
              {expanded ? t.lists.vault.add.fewerTypes : t.lists.vault.add.moreTypes}
            </button>
          </div>
        </div>

        <div>
          <label className="cv-eyebrow om-vault-addm-label" htmlFor="om-vault-addm-note">
            {t.lists.vault.add.note}
          </label>
          <input
            id="om-vault-addm-note"
            className="om-vault-addm-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={t.lists.vault.add.notePlaceholder}
          />
        </div>
      </div>

      <div className="om-vault-addm-foot">
        <button type="button" className="btn-ghost" onClick={onClose}>
          {t.common.cancel}
        </button>
        <button type="button" className="btn-primary btn-inline" onClick={submit} disabled={!value.trim()}>
          <CheckIcon size={15} /> {initial ? t.common.save : t.lists.vault.add.submit}
        </button>
      </div>
    </ModalShell>
  );
}

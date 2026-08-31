import { useState } from "react";
import { useT } from "../../i18n";
import { PROVIDERS, type ProviderId } from "@openmasq/llm";
import { CheckIcon } from "../../components/brand";
import { providerKeyHelp, providerKeyIssue } from "../../containers/modals/providerKeyHelp";

/**
 * « Où trouver votre clé », puis le champ où la coller — la moitié manuelle de l'étape
 * d'accès du premier lancement.
 *
 * Trois choses qu'une ligne « votre clé se crée sur X » ne fait pas, et que cet écran
 * doit faire parce qu'on n'y passe qu'une fois :
 *
 * - **Les étapes sont une CHECKLIST cochable**, toutes visibles. Le coût ici n'est pas
 *   la lecture : c'est qu'on QUITTE l'app plusieurs fois (console du fournisseur, page
 *   des clés, création) et qu'on revient sans savoir où l'on en était. La coche est le
 *   marque-page. Même geste, mêmes classes que la connexion d'un connecteur MCP
 *   (`Settings/byo/ByoKeysModal.tsx`) — un seul foyer pour cette forme.
 * - **La valeur est jugée au collage** (`providerKeyIssue`), là où le mauvais copier-
 *   coller se répare en trois secondes, plutôt qu'au premier envoi sous la forme d'une
 *   erreur du fournisseur qui ne nomme pas sa cause. Le verdict n'empêche jamais
 *   d'enregistrer : voir le pourquoi dans `providerKeyHelp.ts`.
 * - **Le lien officiel est celui du registre**, jamais une adresse retapée ici.
 *
 * Les étapes, le placeholder, la note et le lien viennent tous de `PROVIDER_KEY_HELP`
 * (règle 9) : un fournisseur non documenté dégrade en champ simple, il ne disparaît pas.
 *
 * Les coches sont l'état d'UN fournisseur : le parent monte ce composant avec
 * `key={provider}`, donc changer de fournisseur repart d'une liste vierge.
 */
export function KeySteps({
  provider,
  onSave,
  saving,
}: {
  provider: ProviderId;
  /** Enregistre la clé. Résout `true` quand elle est bien posée — le champ ne se vide
   *  qu'à ce moment-là, sinon un échec effacerait ce qu'il faut réessayer. */
  onSave: (value: string) => Promise<boolean>;
  saving: boolean;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [done, setDone] = useState<Set<number>>(() => new Set());

  const help = providerKeyHelp(provider, t);
  const label = PROVIDERS[provider].label;
  const issue = providerKeyIssue(provider, value, t);

  const toggleStep = (i: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });

  const save = async () => {
    if (!value.trim() || saving) return;
    if (await onSave(value.trim())) setValue("");
  };

  return (
    <>
      {help && (
        <>
          <ol className="byo-steps">
            {help.steps?.map((s, i) => (
              <li key={i} className={done.has(i) ? "done" : undefined}>
                <button
                  type="button"
                  className="byo-tick"
                  onClick={() => toggleStep(i)}
                  aria-pressed={done.has(i)}
                  aria-label={
                    done.has(i) ? `Étape ${i + 1} : à refaire` : `Étape ${i + 1} : c'est fait`
                  }
                  title={t.onboarding.keySteps.markDone}
                >
                  {done.has(i) && <CheckIcon size={11} />}
                </button>
                <span className="byo-step-text">{s}</span>
              </li>
            ))}
          </ol>
          <a className="byo-link" href={help.keyUrl} target="_blank" rel="noreferrer">
            {t.onboarding.keySteps.openHost(new URL(help.keyUrl).host)}
          </a>
        </>
      )}

      <div className="ob-access-row">
        <input
          type="password"
          className="ob-access-input"
          placeholder={
            help?.placeholder
              ? t.onboarding.keySteps.placeholder(label, help.placeholder)
              : t.onboarding.keySteps.placeholderPlain(label)
          }
          value={value}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <button
          type="button"
          className="ob-access-save"
          disabled={!value.trim() || saving}
          onClick={() => void save()}
        >
          {saving ? t.onboarding.keySteps.saving : t.onboarding.keySteps.save}
        </button>
      </div>
      {issue && <p className={`byo-issue ${issue.level}`}>{issue.message}</p>}
      {help?.note && <p className="byo-hint">{help.note}</p>}
    </>
  );
}

import { useState } from "react";
import { useT } from "../../i18n";
import { PROVIDERS, type ProviderId } from "@openmasq/llm";
import { CheckIcon } from "../../components/brand";
import { providerKeyHelp, providerKeyIssue } from "../../containers/modals/providerKeyHelp";

/**
 * "Où trouver votre clé", then the field to paste it in — the manual half of the first-launch
 * access step.
 *
 * Three things a "your key is created on X" line doesn't do, and that this screen
 * must do because you go through it only once:
 *
 * - **The steps are a checkable CHECKLIST**, all visible. The cost here isn't
 *   reading: it's that you LEAVE the app several times (the provider's console, the
 *   keys page, creation) and come back not knowing where you were. The tick is the
 *   bookmark. Same action, same classes as connecting an MCP connector
 *   (`Settings/byo/ByoKeysModal.tsx`) — one single home for this shape.
 * - **The value is judged at paste time** (`providerKeyIssue`), where a bad copy-
 *   paste is fixed in three seconds, rather than on the first send as a
 *   provider error that doesn't name its cause. The verdict never blocks
 *   saving: see why in `providerKeyHelp.ts`.
 * - **The official link is the registry's**, never an address retyped here.
 *
 * The steps, the placeholder, the note and the link all come from `PROVIDER_KEY_HELP`
 * (rule 9): an undocumented provider degrades to a plain field, it doesn't disappear.
 *
 * The ticks are the state of ONE provider: the parent mounts this component with
 * `key={provider}`, so switching provider starts over from a blank list.
 */
export function KeySteps({
  provider,
  onSave,
  saving,
}: {
  provider: ProviderId;
  /** Saves the key. Resolves `true` when it's actually set — the field only clears
   *  at that point, otherwise a failure would erase what needs to be retried. */
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

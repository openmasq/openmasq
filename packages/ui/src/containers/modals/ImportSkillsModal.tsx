import { useEffect, useState, type DragEvent } from "react";
import { ModalShell } from "./ModalShell";
import { ModalTitle } from "./ModalTitle";
import { useHost } from "../../host";
import { AlertIcon, CheckIcon, FolderIcon, SparklesIcon, WorkflowIcon } from "../../components/brand";
import { BrandLoader } from "../../components/media/BrandLogo";
import { parseSkills, type ParsedSkill } from "../../import/claudeSkills";
import { skillsFromDrop } from "../../import/dropSkills";
import { BRAND } from "@openmasq/branding";

import { useT } from "../../i18n";
/** What the screen returns: a compétence, or a workflow, the user's choice. */
export interface SkillImportChoice {
  name: string;
  desc: string;
  prompt: string;
  asWorkflow: boolean;
}

/**
 * « Importer mes compétences Claude » — two clicks: open, confirm.
 *
 * What the screen refuses to do on its own, and why:
 *
 * - **It doesn't import without showing.** A `~/.claude/skills` can hold thirty;
 *   creating thirty in one click, some of them broken, is cleanup to do afterward.
 * - **It doesn't decide compétence/workflow.** It GUESSES (does the body talk about tools?)
 *   and puts the guess on each row, editable. A silent wrong filing is more
 *   costly to undo than a one-click toggle.
 * - **It says what won't carry over.** A skill that relies on its side files
 *   arrives as an instruction to open missing files: the row flags it
 *   BEFORE, rather than usage AFTER.
 */
export function ImportSkillsModal({
  onImport,
  onClose,
}: {
  /** Creates the chosen entries. The caller handles name duplicates (`freeName`). */
  onImport: (items: SkillImportChoice[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const host = useHost();
  const listSkills = host.claudeSkills?.list;
  const [found, setFound] = useState<ParsedSkill[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Unchecked ⇒ not imported; "as workflow" ⇒ the other filing. Two sets
  // rather than a mutable copy of the list: the list stays what the disk said.
  const [skip, setSkip] = useState<ReadonlySet<string>>(new Set());
  const [asWorkflow, setAsWorkflow] = useState<ReadonlySet<string>>(new Set());
  const [over, setOver] = useState(false);
  const [dropError, setDropError] = useState("");

  useEffect(() => {
    if (!listSkills) return;
    let live = true;
    void listSkills()
      .then((raw) => {
        if (!live) return;
        const parsed = parseSkills(raw);
        setFound(parsed);
        setAsWorkflow(new Set(parsed.filter((s) => s.looksLikeWorkflow).map((s) => s.name)));
      })
      .catch(() => {
        if (live) {
          setFound([]);
          setFailed(true);
        }
      });
    return () => {
      live = false;
    };
  }, [listSkills]);

  /** The drop REPLACES what was listed: a new source has just been designated. Stacking two
   *  origins would make the list inexplicable ("where did that one come from?"). */
  const adopt = (parsed: ParsedSkill[]): void => {
    setFound(parsed);
    setSkip(new Set());
    setAsWorkflow(new Set(parsed.filter((s) => s.looksLikeWorkflow).map((s) => s.name)));
  };

  const onDrop = async (e: DragEvent): Promise<void> => {
    e.preventDefault();
    setOver(false);
    setDropError("");
    try {
      const parsed = parseSkills(await skillsFromDrop(e.dataTransfer));
      if (!parsed.length) {
        setDropError(
          `Rien de reconnaissable là-dedans : ${BRAND.name} cherche des dossiers contenant un « SKILL.md », ou des fichiers .md déposés directement.`,
        );
        return;
      }
      adopt(parsed);
    } catch {
      setDropError("Ce dépôt n'a pas pu être lu.");
    }
  };

  const toggle = (set: ReadonlySet<string>, key: string): ReadonlySet<string> => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const chosen = (found ?? []).filter((s) => !skip.has(s.name));
  const submit = () => {
    onImport(
      chosen.map((s) => ({
        name: s.name,
        desc: s.desc,
        prompt: s.prompt,
        asWorkflow: asWorkflow.has(s.name),
      })),
    );
    onClose();
  };

  return (
    <ModalShell onClose={onClose} width="620px">
      <div className="rrm-head">
        <div className="cv-eyebrow rrm-eyebrow">{t.modals.importSkills.eyebrow}</div>
        <ModalTitle>{t.modals.importSkills.title}</ModalTitle>
        <p className="rrm-sub">
          {t.modals.importSkills.sub("Claude Code")}
        </p>
      </div>

      <div
        className={`imp-body${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => void onDrop(e)}
      >
        {found === null ? (
          <div className="imp-loading">
            <BrandLoader size={22} mono />
            <span>{t.modals.importSkills.reading}</span>
          </div>
        ) : found.length === 0 ? (
          <div className="imp-drop">
            <FolderIcon size={26} />
            <p className="imp-drop-title">{t.modals.importSkills.dropTitle}</p>
            <p className="imp-drop-sub">
              Le dossier <code>.claude/skills</code>, une compétence seule, un fichier
              <code>.md</code>, ou le <code>.zip</code> téléversé sur claude.ai.
            </p>
            {failed ? null : (
              <p className="imp-drop-scan">
                {t.modals.importSkills.nothingFound}
              </p>
            )}
          </div>
        ) : (
          <>
            <ul className="imp-list">
              {found.map((s) => {
                const off = skip.has(s.name);
                const wf = asWorkflow.has(s.name);
                return (
                  <li key={s.name} className={`imp-row${off ? " off" : ""}`}>
                    <label className="imp-pick">
                      <input
                        type="checkbox"
                        checked={!off}
                        onChange={() => setSkip((p) => toggle(p, s.name))}
                      />
                      <span className="imp-name">{s.name}</span>
                    </label>
                    {s.desc ? <p className="imp-desc">{s.desc}</p> : null}
                    {s.needsFiles ? (
                      <p className="imp-warn">
                        <AlertIcon size={13} />
                        S'appuie sur {s.extras} fichier{s.extras > 1 ? "s" : ""} de son dossier :
                        seules les instructions seront importées.
                      </p>
                    ) : null}
                    <button
                      type="button"
                      className="imp-kind"
                      aria-pressed={wf}
                      title={
                        wf
                          ? "Rangé dans les Workflows — cliquer pour en faire une compétence"
                          : "Rangé dans les Compétences — cliquer pour en faire un workflow"
                      }
                      onClick={() => setAsWorkflow((p) => toggle(p, s.name))}
                    >
                      {wf ? <WorkflowIcon size={13} /> : <SparklesIcon size={13} />}
                      {wf ? "Workflow" : "Compétence"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="imp-note">
              Un nom déjà pris n'écrase rien : l'import ajoute « (2) ». Vous pouvez le
              relancer sans risque — ou déposer un autre dossier ici pour changer de source.
            </p>
          </>
        )}
        {dropError ? <p className="imp-drop-error">{dropError}</p> : null}
      </div>

      <div className="confirm-footer">
        <button className="btn-ghost btn-inline" onClick={onClose}>
          {t.common.cancel}
        </button>
        <button
          className="btn-primary btn-inline"
          onClick={submit}
          disabled={chosen.length === 0}
        >
          <CheckIcon size={15} /> Importer {chosen.length > 0 ? chosen.length : ""}
        </button>
      </div>
    </ModalShell>
  );
}

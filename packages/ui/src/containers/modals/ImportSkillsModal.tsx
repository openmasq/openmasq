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
/** Ce que l'écran renvoie : une compétence, ou un workflow, au choix de l'utilisateur. */
export interface SkillImportChoice {
  name: string;
  desc: string;
  prompt: string;
  asWorkflow: boolean;
}

/**
 * « Importer mes compétences Claude » — deux clics : ouvrir, valider.
 *
 * Ce que l'écran refuse de faire tout seul, et pourquoi :
 *
 * - **Il n'importe pas sans montrer.** Un `~/.claude/skills` peut en contenir trente ;
 *   en créer trente d'un clic, dont certaines cassées, c'est du ménage à faire ensuite.
 * - **Il ne décide pas compétence/workflow.** Il PARIE (le corps parle-t-il d'outils ?)
 *   et met le pari sur chaque ligne, modifiable. Un mauvais rangement silencieux est plus
 *   coûteux à défaire qu'un basculement d'un clic.
 * - **Il dit ce qui ne traversera pas.** Un skill qui s'appuie sur ses fichiers annexes
 *   arrive comme une instruction d'ouvrir des fichiers absents : la ligne le signale
 *   AVANT, plutôt que l'usage APRÈS.
 */
export function ImportSkillsModal({
  onImport,
  onClose,
}: {
  /** Crée les entrées choisies. L'appelant gère les doublons de nom (`freeName`). */
  onImport: (items: SkillImportChoice[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const host = useHost();
  const listSkills = host.claudeSkills?.list;
  const [found, setFound] = useState<ParsedSkill[] | null>(null);
  const [failed, setFailed] = useState(false);
  // Décochées ⇒ non importées ; « en workflow » ⇒ l'autre rangement. Deux ensembles
  // plutôt qu'une copie mutable de la liste : la liste reste ce que le disque a dit.
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

  /** Le dépôt REMPLACE ce qui était listé : on vient de désigner une source. Empiler deux
   *  origines rendrait la liste inexplicable (« d'où sort celle-là ? »). */
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

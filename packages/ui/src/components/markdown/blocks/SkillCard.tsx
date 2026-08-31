import { useContext, useState } from "react";
import { AgentCard, GlyphTile, AgentCardTitle, AgentCardDesc } from "../../agent/AgentCard";
import { SparklesIcon, WorkflowIcon, CheckIcon } from "../../brand";
import { McpTile } from "../../media/McpTile";
import { findConnector } from "@openmasq/catalog/mcp";
import { competenceCategory } from "../../../competences/competences";
import { parseProposedSkill, isCompleteSkill } from "../../../suggestions/proposedSkill";
import { MarkdownDocContext } from "../context";

import { useT } from "../../../i18n";
/**
 * Une COMPÉTENCE ou un WORKFLOW que le modèle vient de fabriquer, rendu sous sa réponse
 * comme une carte qu'un clic ajoute à la liste de l'utilisateur — le pendant du
 * ```document, pour les deux listes qu'on écrit soi-même.
 *
 * Ce qu'on demandait avant : le modèle rendait du Markdown, et il fallait rouvrir la
 * page Compétences, créer une entrée, recopier le prompt. Le bloc n'est donc pas un
 * affichage, c'est le raccourci de ce trajet.
 *
 * ⚠️ **Rien n'est jamais installé par l'app.** `suggestions/` porte déjà cette règle
 * pour les amorces des deux modales : une proposition PRÉ-REMPLIT une création, elle ne
 * la valide pas. Ici le clic EST l'acte de l'utilisateur — pas d'ajout automatique à la
 * fin d'un tour, pas de « on l'a enregistrée pour vous ». C'est aussi ce qui rend le
 * geste sûr quand le modèle se trompe de rail : rien n'entre sans un clic.
 *
 * Le bouton n'existe que sur un bloc COMPLET (`isCompleteSkill`) : la carte se peint
 * pendant que le modèle écrit, et ajouter à mi-flux créerait une entrée tronquée à
 * nettoyer à la main. Absent `onAddSkill` (bulle en flux, rendu imbriqué, aperçu
 * mobile), la carte reste lisible et n'agit pas — le régime des autres blocs.
 */
export function SkillCard({ kind, text }: { kind: "competence" | "workflow"; text: string }) {
  const t = useT();
  const { onAddSkill, isSkillAdded } = useContext(MarkdownDocContext);
  const [justAdded, setJustAdded] = useState(false);
  const [open, setOpen] = useState(false);
  const skill = parseProposedSkill(kind, text);
  const complete = isCompleteSkill(skill);
  // « Ajouté » est DÉRIVÉ de la liste (⊕ le clic de l'instant, pour le retour immédiat) :
  // la liste des messages est VIRTUALISÉE — un état d'instance seul se réarmait au
  // remount (scroll, réouverture) et chaque re-clic créait un doublon (signalé 13/08).
  // L'adoption elle-même est aussi idempotente (`useAddProposedSkill`), ceinture-bretelles.
  const added = justAdded || (complete && (isSkillAdded?.(skill) ?? false));
  const isWf = kind === "workflow";
  const cat = !isWf && skill.cat ? competenceCategory(skill.cat) : null;

  return (
    <div className="md-skill-card">
      <AgentCard
        eyebrow={isWf ? "Workflow" : "Compétence"}
        tile={
          <GlyphTile>
            {isWf ? <WorkflowIcon size={18} /> : <SparklesIcon size={18} />}
          </GlyphTile>
        }
        footer={
          <>
            {/* La catégorie et les connecteurs sont ce que la carte apporte de plus
                qu'un titre : ils disent OÙ la chose atterrira et ce qu'elle pilotera. */}
            {cat && <span className="agent-card-note">{cat.label}</span>}
            {isWf && skill.servers.length > 0 && (
              <span className="md-skill-servers">
                {skill.servers.map((id) => {
                  const c = findConnector(id);
                  return c ? (
                    <McpTile key={id} id={c.id} name={c.name} tone={c.tone ?? "sky"} sm />
                  ) : null;
                })}
              </span>
            )}
            <span className="agent-card-spacer" />
            {complete && (
              <button
                type="button"
                className="btn-ghost btn-inline"
                onClick={() => setOpen((v) => !v)}
              >
                {open ? "Masquer" : t.leaves.document.seePrompt}
              </button>
            )}
            {/* Ajouté : le bouton ne disparaît pas, il se FIGE — sinon on ne sait plus
                si le clic a pris, et on reclique (ce qui créerait un doublon). */}
            {complete && onAddSkill && (
              <button
                type="button"
                className="btn-primary btn-inline"
                disabled={added}
                onClick={() => {
                  if (onAddSkill(skill)) setJustAdded(true);
                }}
              >
                {added ? (
                  <>
                    <CheckIcon size={13} /> Ajouté
                  </>
                ) : (
                  "Ajouter"
                )}
              </button>
            )}
          </>
        }
      >
        <AgentCardTitle>{skill.name || "Sans titre"}</AgentCardTitle>
        {skill.desc && <AgentCardDesc>{skill.desc}</AgentCardDesc>}
        {/* Le prompt en clair, replié : c'est ce que la chose FERA, et on doit pouvoir
            le lire avant de l'adopter. En mono, comme partout où l'on montre une
            instruction destinée au modèle. */}
        {open && <pre className="md-skill-prompt">{skill.prompt}</pre>}
      </AgentCard>
    </div>
  );
}

import { useContext, useState } from "react";
import { AgentCard, GlyphTile, AgentCardTitle, AgentCardDesc } from "../../agent/AgentCard";
import { SparklesIcon, WorkflowIcon, CheckIcon } from "../../brand";
import { McpTile } from "../../media/McpTile";
import { findConnector } from "@openmasq/catalog/mcp";
import { skillCategory } from "../../../skills/skills";
import { parseProposedSkill, isCompleteSkill } from "../../../suggestions/proposedSkill";
import { MarkdownDocContext } from "../context";

import { useT } from "../../../i18n";
/**
 * A COMPÉTENCE or a WORKFLOW the model just built, rendered under its reply
 * as a card that a click adds to the user's list — the counterpart of the
 * ```document, for the two lists one writes oneself.
 *
 * What was asked before: the model rendered Markdown, and one had to reopen the
 * Compétences page, create an entry, copy the prompt back in. The block is therefore not a
 * display, it's the shortcut for that trip.
 *
 * ⚠️ **Nothing is ever installed by the app.** `suggestions/` already carries this rule
 * for both modals' starters: a proposal PRE-FILLS a creation, it doesn't
 * validate it. Here the click IS the user's act — no automatic add at the
 * end of a turn, no « we saved it for you ». That's also what makes the
 * gesture safe when the model gets the rail wrong: nothing goes in without a click.
 *
 * The button only exists on a COMPLETE block (`isCompleteSkill`): the card paints itself
 * while the model writes, and adding mid-stream would create a truncated entry to
 * clean up by hand. Absent `onAddSkill` (bubble in stream, nested render, mobile
 * preview), the card stays readable and doesn't act — the same regime as other blocks.
 */
export function SkillProposalCard({ kind, text }: { kind: "competence" | "workflow"; text: string }) {
  const t = useT();
  const { onAddSkill, isSkillAdded } = useContext(MarkdownDocContext);
  const [justAdded, setJustAdded] = useState(false);
  const [open, setOpen] = useState(false);
  const skill = parseProposedSkill(kind, text);
  const complete = isCompleteSkill(skill);
  // « Ajouté » is DERIVED from the list (⊕ the instant's click, for immediate feedback):
  // the message list is VIRTUALIZED — a lone instance state re-armed on
  // remount (scroll, reopening) and every re-click created a duplicate (flagged 13/08).
  // Adoption itself is also idempotent (`useAddProposedSkill`), belt and suspenders.
  const added = justAdded || (complete && (isSkillAdded?.(skill) ?? false));
  const isWf = kind === "workflow";
  const cat = !isWf && skill.cat ? skillCategory(skill.cat, t) : null;

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
            {/* The category and the connectors are what the card brings beyond
                a title: they say WHERE the thing will land and what it will drive. */}
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
            {/* Added: the button doesn't disappear, it FREEZES — otherwise you no longer know
                whether the click took, and you click again (which would create a duplicate). */}
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
        {/* The prompt in clear, collapsed: it's what the thing WILL DO, and one must be able
            to read it before adopting it. In mono, like everywhere an instruction
            meant for the model is shown. */}
        {open && <pre className="md-skill-prompt">{skill.prompt}</pre>}
      </AgentCard>
    </div>
  );
}

import { BrowserIcon, ShieldIcon, ArrowRightIcon } from "./brand";
import { AgentCard, GlyphTile, AgentCardTitle, AgentCardDesc } from "./agent/AgentCard";
import { privacyLevelMeta } from "../privacy/privacyLevel";
import { useT } from "../i18n";
import type { Messages } from "@openmasq/i18n";
import type { RedactCategoryKey } from "../types";

/** The level the card offers — its vocabulary lives with the levels, never here
 *  (rule 9: two surfaces rewriting « Allégé » end up saying two
 *  different things). `tradeoff` is exactly the sentence that names what it leaves readable.
 *  A FUNCTION, not a module constant anymore: the vocabulary now follows the language,
 *  so it resolves at render time rather than at module load. */
const standardLevel = (t: Messages) => privacyLevelMeta(t).find((l) => l.id === "standard")!;

/**
 * BLOCKING pre-search gate, rendered inline UNDER the pending assistant bubble while the
 * agentic loop is PAUSED before its first web search. Built on the shared `AgentCard`
 * shell so it reads as one family with the action-confirmation / integration cards.
 *
 * Public web content's place/org/person names are usually the answer's substance, so
 * redacting them makes the model summarise gibberish. The card therefore offers **a
 * LEVEL, not types**: « Standard » — exactly the five categories this level
 * leaves readable (`state/webNavReveal.ts` says why the two sets cannot
 * diverge). One choice, two buttons, no checkbox.
 *
 * ⚠️ **Why this is no longer a list of checkboxes.** It used to show five, each with its
 * own tint and eye, on the screen that INTERRUPTS a search: that was asking
 * someone to arbitrate category by category in the middle of something else. The product
 * already knows how to name this trade-off — it's a protection level — and a level is chosen with one
 * click. Whoever wants the fine-grained arbitration still has it, in its place: Réglages → Confidentialité.
 *
 * ⚠️ **THIS MESSAGE ONLY.** The choice isn't written into the conversation: the
 * next send goes back out redacted (`send/sendOrchestrator.ts`). That's what makes a
 * generous default acceptable — and the card SAYS so, because a scope one doesn't read is a
 * scope one believes shorter than it is.
 *
 * ⚠️ This is NOT an egress decision: it only changes what the MODEL reads.
 * The request leaves with the real value in every case (rule 11). And the selection is
 * UX only: the store re-filters what comes back against what's offerable (rule 7), so returning
 * a category imposed by the organization doesn't reveal it.
 */
export function WebNavRedactOffer({
  categories,
  onDecide,
}: {
  categories: RedactCategoryKey[];
  /** The categories to reveal for THIS send — `[]` = none. */
  onDecide: (reveal: RedactCategoryKey[]) => void;
}) {
  const t = useT();
  const standard = standardLevel(t);
  if (!categories.length) return null;

  return (
    <AgentCard
      className="webnav-offer"
      role="group"
      ariaLabel={t.webNav.ariaLabel}
      eyebrow={t.webNav.eyebrow}
      tile={
        <GlyphTile>
          <BrowserIcon size={18} />
        </GlyphTile>
      }
      footer={
        <>
          <span className="agent-card-note">
            <ShieldIcon size={13} />
            {/* ⚠️ SHORT out of necessity: `.agent-card-note` is a single line clipped at
                the ellipsis, and two wide buttons leave it little room. Yet it's THE
                sentence that makes a generous default honest — truncated, it's worth nothing.
                The detail (« le suivant repart masqué ») used to live here and got
                cut off; only the scope fits. */}
            <span>{t.webNav.thisMessageOnly}</span>
          </span>
          <span className="agent-card-spacer" />
          <button className="btn-ghost btn-inline" onClick={() => onDecide([])}>
            {t.webNav.keepMasking}
          </button>
          {/* « Tout l'offert » = the level: the card doesn't compose a subset, it
              applies the one that « Allégé » designates (the store re-filters it). The
              verb is the shared lexicon's, suffixed with its reach (`conversation.mark`). */}
          <button className="btn-primary btn-inline" onClick={() => onDecide(categories)}>
            {t.conversation.mark.leaveClear(t.conversation.mark.scopeMessage)} <ArrowRightIcon size={14} />
          </button>
        </>
      }
    >
      <AgentCardTitle>{t.webNav.title(standard.label)}</AgentCardTitle>
      <AgentCardDesc>
        {standard.tradeoff} {t.webNav.rest}
      </AgentCardDesc>
    </AgentCard>
  );
}

import { toSegments, wireSegments, type RedactionSegment } from "@openmasq/redact";
import { ModalShell } from "./ModalShell";
import { EyeIcon, IconButton, ShieldIcon, XIcon } from "../../components/brand";
import { transparencyPairs, type TransparencyPair } from "../../privacy/transparency";
import { conversationProtectedCount } from "../../state/protectedCount";
import { useT } from "../../i18n";
import type { Conversation } from "../../types";

/**
 * « Voyez ce que le modèle a vu » — your message and its counterpart, side by side.
 *
 * Requested by the 27/07 audit: the product's guarantee was verifiable by hovering
 * a mark, value by value, or in a technical log reserved to the team.
 * No outsider could read the TWO whole texts facing each other
 * — the only form that truly answers « qu'est-ce qui est parti ? ».
 *
 * ⚠️ The two columns are RECOMPUTED from the real text and the vault
 * (`transparencyPairs` → `applyVault`), the same substitution as the send. Never
 * replace it with a copy of the wire taken at send time: a copy can diverge from
 * what actually goes out, and a proof that diverges from the thing it proves proves nothing.
 */
export function TransparencyModal({
  conversation,
  modelName,
  onClose,
}: {
  conversation: Conversation;
  modelName?: string;
  onClose: () => void;
}) {
  const pairs = transparencyPairs(conversation);
  const kinds = conversation.redactionKinds;
  const vault = conversation.redactionVault ?? {};
  // The single definition (`state/protectedCount.ts`): a protected VALUE, not a vault
  // entry — the vault carries the aliases of the same value, and this panel is precisely
  // the one where the announced figure gets counted on screen.
  const total = conversationProtectedCount(conversation);
  const t = useT();

  return (
    <ModalShell onClose={onClose} width="880px" maxHeight="84vh">
      <div className="rlog-head">
        <span className="rlog-icon">
          <ShieldIcon size={18} />
        </span>
        <div className="rlog-head-text">
          <div className="rlog-title">{t.modals.transparency.title}</div>
          <div className="rlog-sub">
            {t.modals.transparency.sub(total, modelName ?? t.modals.transparency.theModel)}
          </div>
        </div>
        <IconButton label={t.modals.transparency.close} size="sm" onClick={onClose}>
          <XIcon size={18} />
        </IconButton>
      </div>

      <div className="rlog-body">
        {pairs.length === 0 ? (
          <div className="rlog-empty">{t.modals.transparency.empty}</div>
        ) : (
          <div className="tsp-list">
            {pairs.map((p) => (
              <PairRow key={p.id} pair={p} vault={vault} kinds={kinds} />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function PairRow({
  pair,
  vault,
  kinds,
}: {
  pair: TransparencyPair;
  vault: Record<string, string>;
  kinds?: Record<string, string>;
}) {
  const t = useT();
  // ⚠️ The headers FOLLOW the role. On a reply, "what you wrote" would be
  // wrong on both sides: the left is what YOU READ (restored), the right is what the
  // model actually PRODUCED — it only ever held pseudonyms, on the way out as on
  // the way back. A label that lies on this panel would ruin precisely what it proves.
  const isUser = pair.role === "user";
  const leftHead = isUser ? t.modals.transparency.youWrote : t.modals.transparency.youRead;
  const rightHead = isUser ? t.modals.transparency.modelReceived : t.modals.transparency.modelWrote;

  return (
    <div className="tsp-pair">
      <div className="tsp-pair-head">
        <span className="cv-eyebrow">{isUser ? t.modals.transparency.yourMessage : t.modals.transparency.reply}</span>
        <span className="tsp-pair-count">
          {t.modals.transparency.swapped(pair.swapped)}
        </span>
      </div>
      <div className="tsp-cols">
        <div className="tsp-col">
          <div className="tsp-col-head">
            <ShieldIcon size={13} />
            <span>{leftHead}</span>
          </div>
          <p className="tsp-text">
            {/* The REAL values, highlighted in their category color. */}
            <Segments segments={toSegments(pair.real, vault, kinds)} />
          </p>
        </div>
        <div className="tsp-col tsp-col-wire">
          <div className="tsp-col-head">
            <EyeIcon size={13} />
            <span>{rightHead}</span>
          </div>
          <p className="tsp-text">
            {/* `wireSegments` highlights the PSEUDONYMS: that's the form that left. */}
            <Segments segments={wireSegments(pair.wire, vault, kinds)} />
          </p>
        </div>
      </div>
    </div>
  );
}

/** Segments → text + marks. Deliberately WITHOUT `data-real`: this panel SHOWS, it
 *  doesn't offer to un-redact — the hover that opens the action menu lives in the
 *  conversation, where the action makes sense. */
function Segments({ segments }: { segments: RedactionSegment[] }) {
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "text" ? (
          <span key={i}>{s.value}</span>
        ) : (
          <mark key={i} className={`redaction-mark hl-${s.tone ?? "slate"}`} data-kind={s.label ?? "sensitive"}>
            {s.value}
          </mark>
        ),
      )}
    </>
  );
}

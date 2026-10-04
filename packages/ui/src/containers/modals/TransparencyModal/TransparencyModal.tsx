import { useMemo, useState } from "react";
import { toSegments, wireSegments, type RedactionSegment } from "@openmasq/redact";
import { ModalShell } from "../ModalShell";
import { EyeIcon, IconButton, ShieldIcon, XIcon } from "../../../components/brand";
import { transparencyPairs, type TransparencyPair } from "../../../privacy/transparency";
import { conversationProtectedCount } from "../../../state/redaction/protectedCount";
import { useT } from "../../../i18n";
import type { Conversation } from "../../../types";
import { FIRST_CHARS, STEP_CHARS, windowSegments } from "./sliceSegments";

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
  // Recomputed per CONVERSATION, never per render: on a long paste it is the whole
  // substitution, re-run.
  const pairs = useMemo(() => transparencyPairs(conversation), [conversation]);
  const kinds = conversation.redactionKinds;
  const vault = useMemo(() => conversation.redactionVault ?? {}, [conversation.redactionVault]);
  const maxLen = useMemo(() => longest(vault), [vault]);
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
              <PairRow key={p.id} pair={p} vault={vault} kinds={kinds} maxLen={maxLen} />
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

/** The longest vault value (what the left column matches) and key (the right one). */
function longest(vault: Record<string, string>): { values: number; keys: number } {
  let values = 0;
  let keys = 0;
  for (const [k, v] of Object.entries(vault)) {
    values = Math.max(values, v.length);
    keys = Math.max(keys, k.length);
  }
  return { values, keys };
}

function PairRow({
  pair,
  vault,
  kinds,
  maxLen,
}: {
  pair: TransparencyPair;
  vault: Record<string, string>;
  kinds?: Record<string, string>;
  maxLen: { values: number; keys: number };
}) {
  const t = useT();
  // ⚠️ The headers FOLLOW the role. On a reply, "what you wrote" would be
  // wrong on both sides: the left is what YOU READ (restored), the right is what the
  // model actually PRODUCED — it only ever held pseudonyms, on the way out as on
  // the way back. A label that lies on this panel would ruin precisely what it proves.
  const isUser = pair.role === "user";
  const leftHead = isUser ? t.modals.transparency.youWrote : t.modals.transparency.youRead;
  const rightHead = isUser ? t.modals.transparency.modelReceived : t.modals.transparency.modelWrote;
  // Only the shown PREFIX is segmented and mounted, with the same limit on both sides so
  // the columns stay side by side (`windowSegments`).
  const [limit, setLimit] = useState(FIRST_CHARS);
  const left = useMemo(
    () => windowSegments(pair.real, limit, maxLen.values, (s) => toSegments(s, vault, kinds)),
    [pair.real, limit, maxLen.values, vault, kinds],
  );
  const right = useMemo(
    () => windowSegments(pair.wire, limit, maxLen.keys, (s) => wireSegments(s, vault, kinds)),
    [pair.wire, limit, maxLen.keys, vault, kinds],
  );
  const rest = Math.max(left.rest, right.rest);

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
            <Segments segments={left.shown} />
          </p>
        </div>
        <div className="tsp-col tsp-col-wire">
          <div className="tsp-col-head">
            <EyeIcon size={13} />
            <span>{rightHead}</span>
          </div>
          <p className="tsp-text">
            {/* `wireSegments` highlights the PSEUDONYMS: that's the form that left. */}
            <Segments segments={right.shown} />
          </p>
        </div>
      </div>
      {rest > 0 && (
        <button type="button" className="link-btn tsp-more" onClick={() => setLimit((l) => l + STEP_CHARS)}>
          {t.modals.transparency.showMore(rest)}
        </button>
      )}
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

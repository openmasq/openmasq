import { useState } from "react";
import { useT } from "../../i18n";
import { ShieldIcon, SendIcon, CheckIcon } from "../../components/brand";
import { AgentCard, GlyphTile, AgentCardTitle, AgentCardDesc } from "../../components/agent/AgentCard";
import { describeWriteArgs, writeConfirmCopy, navHostOf } from "./writeConfirm";
import { humanToolLabel } from "../../agent/humanToolLabel";
import type { WriteConfirmInfo } from "../../agent/mcpAgent";

/**
 * Confirm an MCP tool call before it runs — rendered INLINE in the conversation (just
 * above the composer), NOT as a centered modal, so it doesn't block the screen or hide the
 * live agent-browser panel while the model waits. Built on the shared `AgentCard` shell so
 * it reads as one family with the integration / credits / web-nav containers.
 *
 * Shows a READABLE summary (action labels), the TARGET, the model's context note, the exfil
 * signals that opened it, a collapsible full-JSON view, and a "always allow THIS TOOL this
 * session" checkbox (per-tool, never a global off). The blocking-await contract is
 * unchanged — `onDecision` resolves the loop's `confirmWrite` promise exactly as the old
 * dialog did. Deliberately renders as PLAIN DOM (no `.modal-scrim` / `role="dialog"` /
 * `aria-modal`) so it never trips `modalGate`.
 *
 * ⚠️ This card is a CLAIM about where the user's data goes, so it renders only what the
 * loop measured. It does NOT re-derive the exfil flags: the loop scans the WIRE args — for
 * a browse tool, un-redacted through the MCP client's own function, so an ENCODED fake is
 * resolved too — against the REALS, while the card's vault view would include fakes. The
 * two disagreed, and the card was the one lying. `reason`/`flags` come from the loop.
 *
 * ⚠️ NO "resolved / reversible" state, deliberately — the kit's `ActionConfirmCard`
 * done/cancelled/Rétablir cycle is a self-contained DEMO. Here the decision resolves a real
 * promise: the loop dispatches the tool and moves on, so the card unmounts. A "Rétablir" on
 * a DONE action would imply we can un-send an email — we cannot. The after-the-fact outcome
 * is already shown, truthfully, by the persisted `ToolTrace`.
 */
export function WriteConfirmCard({
  tool,
  server,
  args,
  attachments,
  reason,
  flags,
  onDecision,
}: WriteConfirmInfo & {
  /** `remember` = add this connector/tool to the session write allow-list. */
  onDecision: (approved: boolean, remember: boolean) => void;
}) {
  const [remember, setRemember] = useState(false);
  const { lines, context, json } = describeWriteArgs(args);
  const t = useT();
  const copy = writeConfirmCopy(reason, server, navHostOf(args), t);
  // Neutre par défaut : une confirmation n'a pas à crier pour être lue, et la teinte
  // pleine la faisait ressembler à une marque de redaction. Elle ne prend une couleur
  // que quand elle a quelque chose à SIGNALER — la boucle a levé un signal d'exfiltration
  // — et c'est alors l'ambre SÉMANTIQUE, pas la teinte de surlignage.
  const flagged = flags.length > 0;

  return (
    <AgentCard
      className="write-confirm-card"
      role="group"
      ariaLabel={t.cards.writeConfirm.ariaLabel}
      stripe={flagged ? "var(--amber-500)" : "var(--border-strong)"}
      eyebrow={copy.eyebrow}
      tile={
        <GlyphTile bg={flagged ? "var(--amber-soft)" : undefined} color={flagged ? "var(--amber-500)" : undefined}>
          <SendIcon size={18} />
        </GlyphTile>
      }
      footer={
        <>
          <span className="agent-card-note">
            <ShieldIcon size={13} />
            <span>{copy.note}</span>
          </span>
          <span className="agent-card-spacer" />
          <button className="btn-ghost btn-inline" onClick={() => onDecision(false, false)}>
            {t.cards.writeConfirm.cancel}
          </button>
          {/* La CTA de la marque, pas le rouge du danger : ce bouton AUTORISE ce que
              l'utilisateur a demandé. Le rouge se réserve au destructif (`ConfirmDialog`
              `danger`, la suppression d'une conversation) — l'étaler ici en faisait la
              couleur ordinaire du oui, donc plus un signal. */}
          <button className="btn-primary btn-inline" onClick={() => onDecision(true, remember)}>
            <CheckIcon size={14} /> {copy.confirm}
          </button>
        </>
      }
    >
      <AgentCardTitle>{copy.title}</AgentCardTitle>
      <AgentCardDesc>{copy.desc}</AgentCardDesc>

      {flags.length > 0 && (
        <div className="write-confirm-exfil" role="alert">
          <ul className="write-confirm-exfil-list">
            {flags.map((f, i) => (
              <li key={i}>
                <code>{f.param}</code> — {f.reason} :{" "}
                <span className="write-confirm-exfil-val">
                  {f.value.length > 60 ? f.value.slice(0, 60) + "…" : f.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Target + content preview — the kit's boxed region. The connector and the action
          in the user's words, then the EXACT tool in parentheses: "which surface am I
          authorising" must stay unambiguous, and two of a connector's tools can share a
          human label. That is also why the scope note and « Détails techniques » below
          keep the raw name ALONE — they state what the allow-list actually keys on, and a
          vulgarised name there would describe a permission wider than the one granted. */}
      <div className="agent-card-box">
        <div className="agent-card-box-target">
          <span className="agent-card-box-target-label">{t.cards.writeConfirm.target}</span>
          <span className="agent-card-box-target-val" title={`${server} · ${tool}`}>
            {server} · {humanToolLabel(server, tool)} ({tool})
          </span>
        </div>
        {lines.length > 0 && (
          <ul className="write-confirm-actions">
            {lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        {context && <p className="write-confirm-context">{context}</p>}
      </div>

      {attachments && attachments.length > 0 && (
        <div className="write-confirm-attachments" role="alert">
          <div className="write-confirm-attachments-head">
            <ShieldIcon size={14} />
            <span>
              {t.cards.writeConfirm.attachmentsWarning(attachments.length)}
            </span>
          </div>
          <ul className="write-confirm-attachments-list">
            {attachments.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </div>
      )}

      <details className="write-confirm-json">
        <summary>Détails techniques ({tool})</summary>
        <pre>{json}</pre>
      </details>

      {/* Scope of an « Autoriser » click: this tool, THIS conversation — stated so the
          user knows they won't be re-asked (per-call re-confirmation taught clicking
          without reading). The checkbox widens it to every conversation this session. */}
      <div className="write-confirm-scope">
        <span className="write-confirm-scope-note">
          Une fois autorisé, « {tool} » ne redemandera plus dans cette conversation.
        </span>
        <label className="write-confirm-remember">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>Aussi dans mes autres conversations (jusqu'à la fermeture de l'app)</span>
        </label>
      </div>
    </AgentCard>
  );
}

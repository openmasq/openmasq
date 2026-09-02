import { useEffect, useState } from "react";
import type { SubscriptionAccount, SubscriptionQuota } from "@openmasq/llm";
import { useHost } from "../../../host";
import { useT } from "../../../i18n";

import type { AgentCli } from "../../../hooks/useAgentOptIns";
export type { AgentCli };

/**
 * What the agent's CLI says about ITS OWN account — plan, quota windows, models — as
 * extra ROWS of the opt-in card in `AgentAccessModal`, under the switch. Read when the
 * rows mount (one short CLI process, bounded on the main side), never before: the user
 * opened this card to look at their subscription, that is the gesture.
 *
 * Each CLI fills what it exposes and the rows say the rest plainly: codex gives plan,
 * quota and models; antigravity its models only (`noQuota`); claude only what its last
 * turn announced (`lastTurn`, or `claudeNoData` before any send). Nothing here is an
 * error: a silent CLI is `unavailable`, a normal state (not signed in).
 *
 * Rows, not a nested card: `.row-title`/`.row-desc` are styled under `.toggle-row` only,
 * and the card's padding lives on its rows — so these share `.agent-account-row` (same
 * measures, same hairline) rather than re-inventing a second surface.
 */
export function AgentAccountCard({ cli }: { cli: AgentCli }) {
  const t = useT();
  const host = useHost();
  const [account, setAccount] = useState<SubscriptionAccount | null | "loading">("loading");
  useEffect(() => {
    const read = host.readSubscriptionAccount;
    if (!read) return;
    let cancelled = false;
    setAccount("loading");
    read
      .call(host, cli)
      .then((a) => !cancelled && setAccount(a))
      .catch(() => !cancelled && setAccount(null));
    return () => {
      cancelled = true;
    };
  }, [host, cli]);
  if (!host.readSubscriptionAccount) return null;
  const copy = t.modelPicker.cli.account;

  if (account === "loading" || account === null) {
    return (
      <div className="agent-account-row">
        <div className="agent-account-note">
          {account === "loading" ? copy.loading : cli === "claude" ? copy.claudeNoData : copy.unavailable}
        </div>
      </div>
    );
  }

  return (
    <>
      {account.plan && (
        <div className="agent-account-row agent-account-kv">
          <span className="agent-account-label">{copy.title}</span>
          <span className="agent-account-value">{copy.plan(account.plan)}</span>
        </div>
      )}
      {account.quotas.map((q) => (
        <QuotaRow key={q.window} quota={q} lastTurn={account.source === "lastTurn"} />
      ))}
      {account.quotas.length === 0 && cli !== "claude" && (
        <div className="agent-account-row">
          <div className="agent-account-note">{copy.noQuota}</div>
        </div>
      )}
      {cli !== "claude" && (
        <div className="agent-account-row">
          <div className="agent-account-label">{copy.modelsTitle}</div>
          {account.models.length === 0 ? (
            <div className="agent-account-note">{copy.noModels}</div>
          ) : (
            <ul className="agent-account-models">
              {account.models.map((m) => (
                <li key={m.id} className={`agent-account-model${m.isDefault ? " is-default" : ""}`}>
                  {m.label}
                  {m.isDefault && <span className="agent-account-tag">{copy.defaultTag}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

/** One quota window: label and figure on one line, the bar under them when the CLI
 *  gives a percentage, the reset time and « as of the last send » in a muted footnote. */
function QuotaRow({ quota, lastTurn }: { quota: SubscriptionQuota; lastTurn: boolean }) {
  const t = useT();
  const copy = t.modelPicker.cli.account;
  const pct = quota.usedPercent;
  const status =
    quota.status === "rejected"
      ? copy.statusExhausted
      : quota.status === "allowed_warning"
        ? copy.statusWarning
        : quota.status
          ? copy.statusOk
          : null;
  const label =
    pct !== undefined && quota.windowMinutes !== undefined
      ? copy.quotaUsed(pct, copy.windowOf(quota.windowMinutes))
      : copy.windowName(quota.window);
  const notes = [
    quota.resetsAt ? copy.resets(new Date(quota.resetsAt).toLocaleString(t.common.intlTag)) : null,
    lastTurn ? copy.lastTurn : null,
  ].filter(Boolean);
  return (
    <div className="agent-account-row">
      <div className="agent-account-kv">
        <span className="agent-account-label">{label}</span>
        {pct !== undefined ? (
          <span className={`agent-account-value${pct >= 90 ? " is-hot" : ""}`}>{pct} %</span>
        ) : (
          status && <span className={`agent-account-value${quota.status === "rejected" ? " is-hot" : ""}`}>{status}</span>
        )}
      </div>
      {pct !== undefined && (
        <div className="usage-mbar agent-account-bar" role="img" aria-label={`${pct}%`}>
          <div className={`usage-mbar-fill agent-account-fill${pct >= 90 ? " is-hot" : ""}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
      {notes.length > 0 && <div className="agent-account-note">{notes.join(" · ")}</div>}
    </div>
  );
}

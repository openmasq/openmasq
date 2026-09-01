import { useEffect, useState } from "react";
import type { SubscriptionAccount, SubscriptionQuota } from "@openmasq/llm";
import { useHost } from "../../../host";
import { useT } from "../../../i18n";

export type AgentCli = SubscriptionAccount["cli"];

/**
 * What the agent's CLI says about ITS OWN account — plan, quota windows, models — under
 * the opt-in switch of `AgentAccessModal`. Read when the card mounts (one short CLI
 * process, bounded on the main side), never before: the user opened this card to look at
 * their subscription, that is the gesture.
 *
 * Each CLI fills what it exposes and the card says the rest plainly: codex gives plan,
 * quota and models; antigravity its models only (`noQuota`); claude only what its last
 * turn announced (`lastTurn`, or `claudeNoData` before any send). Nothing here is an
 * error: a silent CLI is `unavailable`, a normal state (not signed in).
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

  let body: React.ReactNode;
  if (account === "loading") body = <div className="row-desc">{copy.loading}</div>;
  else if (account === null)
    body = <div className="row-desc">{cli === "claude" ? copy.claudeNoData : copy.unavailable}</div>;
  else
    body = (
      <>
        {account.plan && <div className="row-desc">{copy.plan(account.plan)}</div>}
        {account.quotas.length === 0 && cli !== "claude" && <div className="row-desc">{copy.noQuota}</div>}
        {account.quotas.map((q) => (
          <QuotaLine key={q.window} quota={q} />
        ))}
        {account.source === "lastTurn" && <div className="row-desc agent-account-when">{copy.lastTurn}</div>}
        {cli !== "claude" && (
          <div className="agent-account-models">
            <div className="row-title">{copy.modelsTitle}</div>
            {account.models.length === 0 ? (
              <div className="row-desc">{copy.noModels}</div>
            ) : (
              <ul className="agent-account-list">
                {account.models.map((m) => (
                  <li key={m.id}>
                    <span>{m.label}</span>
                    {m.isDefault && <span className="agent-account-tag">{copy.defaultTag}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </>
    );

  return (
    <div className="settings-card agent-account">
      <div className="row-title">{copy.title}</div>
      {body}
    </div>
  );
}

/** One quota window: a bar when the CLI gives a percentage, a status word when it gives
 *  only a verdict (claude), the reset time whenever it is known. */
function QuotaLine({ quota }: { quota: SubscriptionQuota }) {
  const t = useT();
  const copy = t.modelPicker.cli.account;
  const reset = quota.resetsAt ? copy.resets(new Date(quota.resetsAt).toLocaleString(t.common.intlTag)) : null;
  const status =
    quota.status === "rejected"
      ? copy.statusExhausted
      : quota.status === "allowed_warning"
        ? copy.statusWarning
        : quota.status
          ? copy.statusOk
          : null;
  const pct = quota.usedPercent;
  return (
    <div className="agent-account-quota">
      {pct !== undefined && (
        <div className="usage-mbar" role="img" aria-label={`${pct}%`}>
          <div className={`usage-mbar-fill agent-account-fill${pct >= 90 ? " hot" : ""}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
      <div className="row-desc">
        {pct !== undefined && quota.windowMinutes !== undefined
          ? copy.quotaUsed(pct, copy.windowOf(quota.windowMinutes))
          : status
            ? `${status} — ${copy.windowName(quota.window)}`
            : copy.windowName(quota.window)}
        {reset ? ` · ${reset}` : ""}
      </div>
    </div>
  );
}

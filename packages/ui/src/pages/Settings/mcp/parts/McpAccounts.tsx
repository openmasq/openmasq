import { useState } from "react";
import { Btn } from "../McpBtn";
import type { McpAccount, McpItem } from "../mcpItems";
import { MANAGED_CRED_MODE, type CredMode } from "../../../../host";

import { useT } from "../../../../i18n";
/**
 * The connected-accounts list of a multi-account connector (direct OR remote),
 * plus the "add another account" affordance — which differs per kind/auth:
 * a direct connector offers managed/BYO, a remote OAuth one opens a fresh login,
 * a remote API-key one takes a new key. Every host call stays in the parent's
 * callbacks; this only renders and collects.
 */
export function McpAccounts({
  item,
  busy,
  peers,
  onOpenPeer,
  onInspect,
  onReauth,
  onDisconnect,
  onAddAccount,
  onAddAccountRemote,
  onAddAccountApiKey,
}: {
  item: McpItem;
  busy: boolean;
  /** Les autres connecteurs connectés que la MÊME autorisation fait tomber. */
  peers?: McpItem[];
  onOpenPeer?: (connectorId: string) => void;
  onInspect: (serverId: string) => void;
  onReauth?: (serverId: string) => void;
  onDisconnect: (serverId: string) => void;
  onAddAccount?: (mode: CredMode) => void;
  onAddAccountRemote?: () => void;
  onAddAccountApiKey?: (key: string) => void;
}) {
  const t = useT();
  const [key, setKey] = useState("");
  const c = item.connector;
  const submitAddApiKey = () => {
    if (!key.trim()) return;
    onAddAccountApiKey?.(key.trim());
    setKey("");
  };

  return (
    <>
      {item.kind === "direct" && <p className="mcp-modal-note">{t.mcpTab.reconnectHint}</p>}
      {/* ⚠️ La panne est de GROUPE, la réparation ne l'est pas : les connecteurs Google
          partagent une seule autorisation, donc ils tombent ensemble, mais « Reconnecter »
          ne remet à neuf que celui-ci (`mcpReauthDirect` purge UN id). Sans cette ligne,
          l'utilisateur répare Gmail, croit en avoir fini, et retrouve Agenda cassé au tour
          suivant. On les NOMME et on y mène — plutôt que de tout re-consentir d'un geste,
          ce qui élargirait l'écran de consentement Google à l'union des scopes
          (`credGroup.ts`). */}
      {!!peers?.length && (
        <p className="mcp-modal-note mcp-note-flow">
          {t.mcpTab.sharedAuthLead}
          {peers.map((p, i) => (
            <span key={p.id}>
              {i > 0 && (i === peers.length - 1 ? t.mcpTab.and : ", ")}
              {onOpenPeer ? (
                <button type="button" className="mcp-peer-link" onClick={() => onOpenPeer(p.id)}>
                  {p.name}
                </button>
              ) : (
                p.name
              )}
            </span>
          ))}
          . Si un de ces services refuse aussi l&apos;accès, reconnectez-le depuis sa fiche.
        </p>
      )}
      <div className="mcp-accounts">
        {item.accounts
          ?.filter((a) => a.connected || a.error)
          .map((a) => (
            <AccountRow
              key={a.serverId}
              account={a}
              busy={busy}
              onInspect={() => onInspect(a.serverId)}
              onReauth={item.kind === "direct" && onReauth ? () => onReauth(a.serverId) : undefined}
              onDisconnect={() => onDisconnect(a.serverId)}
            />
          ))}
      </div>
      {item.kind === "direct" && onAddAccount ? (
        <div className="mcp-modal-actions">
          {c?.byoOnly ? (
            <Btn
              label={t.mcpTab.addAccount}
              onClick={() => onAddAccount("byo")}
              disabled={busy}
              subtle
            />
          ) : c?.directAuth === "slack" ? (
            <Btn
              label={t.mcpTab.addAccount}
              onClick={() => onAddAccount(MANAGED_CRED_MODE)}
              disabled={busy}
              subtle
            />
          ) : (
            <>
              <Btn
                label={t.mcpTab.addAccount}
                onClick={() => onAddAccount(MANAGED_CRED_MODE)}
                disabled={busy}
                subtle
              />
              <Btn
                label={t.mcpTab.addAccountByo}
                onClick={() => onAddAccount("byo")}
                disabled={busy}
                subtle
              />
            </>
          )}
        </div>
      ) : item.kind === "remote" && item.auth === "apikey" && onAddAccountApiKey ? (
        <>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAddApiKey();
            }}
            placeholder={t.mcpTab.newKeyPlaceholder}
            className="mcp-url-input"
            autoComplete="off"
          />
          <div className="mcp-modal-actions">
            <Btn
              label={busy ? t.mcpTab.connecting : t.mcpTab.addAccount}
              onClick={submitAddApiKey}
              disabled={busy || !key.trim()}
              loading={busy}
              subtle
            />
          </div>
        </>
      ) : item.kind === "remote" && onAddAccountRemote ? (
        <div className="mcp-modal-actions">
          <Btn
            label={busy ? t.mcpTab.connecting : t.mcpTab.addAccount}
            onClick={onAddAccountRemote}
            disabled={busy}
            loading={busy}
            subtle
          />
        </div>
      ) : null}
    </>
  );
}

/** One connected account: its label (email / login / "Compte principal") + tool
 *  count, with per-account inspect / reconnect (direct only) / disconnect. */
function AccountRow({
  account,
  busy,
  onInspect,
  onReauth,
  onDisconnect,
}: {
  account: McpAccount;
  busy: boolean;
  onInspect: () => void;
  onReauth?: () => void;
  onDisconnect: () => void;
}) {
  const t = useT();
  return (
    <div className="mcp-account-row">
      <div className="mcp-account-meta">
        <div className="mcp-account-label">{account.label ?? t.mcpTab.mainAccount}</div>
        <div className={`mcp-account-sub ${account.error ? "error" : ""}`}>
          {account.error
            ? account.error
            : account.toolCount != null
              ? t.mcpTab.tools(account.toolCount)
              : t.mcpTab.connected}
        </div>
      </div>
      <div className="mcp-account-actions">
        <Btn label={t.mcpTab.toolsLabel} onClick={onInspect} subtle />
        {onReauth && (
          <Btn label={busy ? "…" : t.mcpTab.reconnect} onClick={onReauth} disabled={busy} subtle />
        )}
        <Btn label={t.mcpTab.disconnect} onClick={onDisconnect} disabled={busy} subtle danger />
      </div>
    </div>
  );
}

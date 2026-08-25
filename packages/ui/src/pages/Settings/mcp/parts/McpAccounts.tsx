import { useState } from "react";
import { Btn } from "../McpBtn";
import type { McpAccount, McpItem } from "../mcpItems";
import { MANAGED_CRED_MODE, type CredMode } from "../../../../host";

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
  const [key, setKey] = useState("");
  const c = item.connector;
  const submitAddApiKey = () => {
    if (!key.trim()) return;
    onAddAccountApiKey?.(key.trim());
    setKey("");
  };

  return (
    <>
      {item.kind === "direct" && (
        <p className="mcp-modal-note">
          Un outil refuse l'accès ? L'autorisation a expiré ou a changé — « Reconnecter »
          relance la connexion au service avec les accès à jour.
        </p>
      )}
      {/* ⚠️ La panne est de GROUPE, la réparation ne l'est pas : les connecteurs Google
          partagent une seule autorisation, donc ils tombent ensemble, mais « Reconnecter »
          ne remet à neuf que celui-ci (`mcpReauthDirect` purge UN id). Sans cette ligne,
          l'utilisateur répare Gmail, croit en avoir fini, et retrouve Agenda cassé au tour
          suivant. On les NOMME et on y mène — plutôt que de tout re-consentir d'un geste,
          ce qui élargirait l'écran de consentement Google à l'union des scopes
          (`credGroup.ts`). */}
      {!!peers?.length && (
        <p className="mcp-modal-note mcp-note-flow">
          Cette autorisation couvre aussi{" "}
          {peers.map((p, i) => (
            <span key={p.id}>
              {i > 0 && (i === peers.length - 1 ? " et " : ", ")}
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
            <Btn label="Ajouter un compte" onClick={() => onAddAccount("byo")} disabled={busy} subtle />
          ) : c?.directAuth === "slack" ? (
            <Btn label="Ajouter un compte" onClick={() => onAddAccount(MANAGED_CRED_MODE)} disabled={busy} subtle />
          ) : (
            <>
              <Btn label="Ajouter un compte" onClick={() => onAddAccount(MANAGED_CRED_MODE)} disabled={busy} subtle />
              <Btn label="… avec mes clés" onClick={() => onAddAccount("byo")} disabled={busy} subtle />
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
            placeholder="Nouvelle clé pour un autre compte"
            className="mcp-url-input"
            autoComplete="off"
          />
          <div className="mcp-modal-actions">
            <Btn
              label={busy ? "Connexion…" : "Ajouter un compte"}
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
            label={busy ? "Connexion…" : "Ajouter un compte"}
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
  return (
    <div className="mcp-account-row">
      <div className="mcp-account-meta">
        <div className="mcp-account-label">{account.label ?? "Compte principal"}</div>
        <div className={`mcp-account-sub ${account.error ? "error" : ""}`}>
          {account.error
            ? account.error
            : account.toolCount != null
              ? `${account.toolCount} outil${account.toolCount > 1 ? "s" : ""}`
              : "Connecté"}
        </div>
      </div>
      <div className="mcp-account-actions">
        <Btn label="Outils" onClick={onInspect} subtle />
        {onReauth && <Btn label={busy ? "…" : "Reconnecter"} onClick={onReauth} disabled={busy} subtle />}
        <Btn label="Déconnecter" onClick={onDisconnect} disabled={busy} subtle danger />
      </div>
    </div>
  );
}

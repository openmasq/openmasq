import { useState } from "react";
import { ModalShell } from "../../../containers/modals";
import type { CredMode } from "../../../host";
import { LockIcon } from "../../../components/brand";
import { Btn } from "./McpBtn";
import { McpLocalFields } from "./McpLocalFields";
import { McpGrantedDirs } from "./McpGrantedDirs";
import { apiKeyHelp } from "./mcpApiKeyHelp";
import { connectorInfo } from "./mcpConnectorInfo";
import { connectorErrorText } from "./connectorErrorText";
import { McpModalHead } from "./parts/McpModalHead";
import { McpHint } from "./parts/McpHint";
import { McpAccounts } from "./parts/McpAccounts";
import { McpRemoteBody } from "./parts/McpRemoteBody";
import { McpDirectBody } from "./parts/McpDirectBody";
import { McpBrowserBody } from "./parts/McpBrowserBody";
import type { McpItem } from "./mcpItems";

/**
 * The single per-connector DETAIL modal. Opened from a card in the grid; holds ALL
 * the connect/disconnect actions that used to live inline on the rows, dispatched
 * by the item's `kind` (remote OAuth / desktop-direct managed+BYO / local stdio /
 * builtin browser). A connected connector offers "Voir les outils" +
 * "Déconnecter"; an org-blocked one explains why. This file is the HEAD + the
 * dispatch only — each body lives in `parts/`, and every host call + analytics
 * stays in `useMcpConnectors` behind these callbacks.
 */
export function McpConnectorModal({
  item,
  busy,
  connectUrl,
  onClose,
  onCancelConnect,
  onConnectRemote,
  onConnectApiKey,
  onConnectDirect,
  onConnectLocal,
  onConnectBrowser,
  onDisconnect,
  onRemove,
  onByo,
  onReauth,
  peers,
  onOpenPeer,
  onInspect,
  onAddAccount,
  onAddAccountRemote,
  onAddAccountApiKey,
  onPickDir,
  onSetDirs,
}: {
  item: McpItem;
  busy: boolean;
  /** The in-flight connect's OAuth authorize URL (main pushes it during "Connexion…"),
   *  so we can offer "Copier le lien" to open the login in another browser. */
  connectUrl?: string;
  onClose: () => void;
  /** Cancel the in-flight interactive connect (the "Connexion…" state) — main tears
   *  down the OAuth loopback / device window so no token is minted. Absent when the
   *  host can't cancel (the spinner then simply runs to completion / timeout). */
  onCancelConnect?: () => void;
  onConnectRemote: (url: string) => void;
  /** Connect a header-auth API-key connector (e.g. Fireflies): the key is stored
   *  encrypted + sent as a Bearer header. */
  onConnectApiKey: (key: string) => void;
  onConnectDirect: () => void;
  onConnectLocal: (env: Record<string, string>, params: Record<string, string | string[]>) => void;
  /** Enable + connect the controllable-browser connector (kind "browser"). */
  onConnectBrowser?: () => void;
  /** Disconnect a specific connection INSTANCE (a direct connector may have several
   *  accounts). For remote/local it's the connector's single serverId. */
  onDisconnect: (serverId: string) => void;
  onRemove: () => void;
  onByo: () => void;
  /** Force a fresh OAuth for a connected desktop-direct account (fixes a stale /
   *  wrong-scope token → 403). Absent when the host can't re-auth. ⚠️ Il ne répare
   *  QU'UN id — d'où `peers`. */
  onReauth?: (serverId: string) => void;
  /** Les autres connecteurs CONNECTÉS que la même autorisation fait tomber (Google
   *  partage un client OAuth). Vide hors groupe partagé — voir `credGroup.ts`. */
  peers?: McpItem[];
  /** Ouvrir la fiche d'un de ces connecteurs pour le réparer à son tour. */
  onOpenPeer?: (connectorId: string) => void;
  onInspect: (serverId: string) => void;
  /** Connect an ADDITIONAL account of a desktop-direct connector (multi-account).
   *  Absent when the host doesn't support it. */
  onAddAccount?: (mode: CredMode) => void;
  /** Connect an ADDITIONAL account of a REMOTE OAuth connector (opens a new login). */
  onAddAccountRemote?: () => void;
  /** Connect an ADDITIONAL account of a REMOTE API-key connector with a fresh key. */
  onAddAccountApiKey?: (key: string) => void;
  onPickDir: () => Promise<string | undefined>;
  /** Remplacer les dossiers autorisés d'un serveur local connecté. Renvoie un message
   *  d'erreur à afficher, ou `undefined` si c'est passé. Absent ⇒ pas d'édition offerte. */
  onSetDirs?: (serverId: string, key: string, dirs: string[]) => Promise<string | undefined>;
}) {
  const info = connectorInfo(item.id);
  const c = item.connector;
  // API-key connector (Exa/Tavily via URL query param; Fireflies via Bearer header)
  // that isn't connected/configured yet → show the key tutorial + input instead of
  // the raw URL field. A documented `apiKeyHelp` is required (else fall back to URL).
  const help =
    item.kind === "remote" && item.auth === "apikey" && !item.connected && !item.configured
      ? apiKeyHelp(item.id)
      : undefined;

  const [copied, setCopied] = useState(false);
  const copyLink = () => {
    if (!connectUrl) return;
    void navigator.clipboard.writeText(connectUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <ModalShell onClose={onClose} width="500px" maxHeight="86vh">
      <McpModalHead item={item} onClose={onClose} />

      <div className="mcp-modal-body">
        {info && (
          <div className="mcp-modal-about">
            <p className="mcp-modal-about-text">{info.about}</p>
            <a
              className="mcp-modal-about-link"
              href={info.website}
              target="_blank"
              rel="noreferrer noopener"
            >
              {info.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗
            </a>
          </div>
        )}
        {/* Le message du fournisseur est TRADUIT en un geste (`connectorErrorText`) ; le
            brut reste au journal de débogage. Inconnu ⇒ on garde le brut, plutôt que
            d'inventer une phrase rassurante sur une panne qu'on ne comprend pas. */}
        {item.error && (
          <div className="mcp-modal-error">{connectorErrorText(item.error)?.text ?? item.error}</div>
        )}
        <McpHint item={item} />

        {/* While a connect is in flight, the body's own button reads "Connexion…"
            (disabled). Offer an escape: cancelling tears the OAuth loopback / device
            window down in main so no token is minted (fail-closed). Plus "Copier le lien"
            (once main pushed the authorize URL) to finish the login in another browser than
            the default one — the return path (relay poll / 127.0.0.1 loopback) is browser-
            agnostic, so it completes the SAME "Connexion…". */}
        {busy && (onCancelConnect || connectUrl) && (
          <div className="mcp-modal-actions">
            {onCancelConnect && (
              <Btn label="Annuler la connexion" onClick={onCancelConnect} subtle danger />
            )}
            {connectUrl && (
              <Btn
                label={copied ? "Lien copié ✓" : "Copier le lien"}
                onClick={copyLink}
                subtle
                title="Copier le lien de connexion pour l'ouvrir dans un autre navigateur"
              />
            )}
          </div>
        )}

        {/* Shown whenever the org blocks this connector — INCLUDING when it's still
            connected (the member connected it before an admin blocked it later): the
            card's grid badge already says "Org", but the loop silently strips its
            tools from every turn, so this modal must say so too rather than showing
            the ordinary "ça marche" connected UI with nothing to explain the drop. */}
        {item.locked && (
          <div className="mcp-modal-note">
            <LockIcon size={13} /> Ce connecteur est bloqué par votre organisation
            {item.connected
              ? " — il reste connecté, mais l'assistant ne peut plus utiliser ses outils."
              : "."}
          </div>
        )}
        {item.locked && !item.connected ? null : item.connected && item.accounts && item.accounts.length ? (
          <McpAccounts
            item={item}
            busy={busy}
            peers={peers}
            onOpenPeer={onOpenPeer}
            onInspect={onInspect}
            onReauth={onReauth}
            onDisconnect={onDisconnect}
            onAddAccount={onAddAccount}
            onAddAccountRemote={onAddAccountRemote}
            onAddAccountApiKey={onAddAccountApiKey}
          />
        ) : item.connected ? (
          <>
            {/* Un serveur local garde ses dossiers ÉDITABLES une fois connecté : sans ça,
                ajouter un dossier demandait de déconnecter et de tout ré-accorder. */}
            {item.kind === "local" && item.entry && onSetDirs && (
              <McpGrantedDirs
                entry={item.entry}
                params={item.params}
                onPickDir={onPickDir}
                onSetDirs={(key, dirs) => onSetDirs(item.serverId, key, dirs)}
              />
            )}
            <div className="mcp-modal-actions">
              <Btn label="Voir les outils" onClick={() => onInspect(item.serverId)} subtle />
              <Btn
                label="Déconnecter"
                onClick={() => onDisconnect(item.serverId)}
                disabled={busy}
                subtle
                danger
              />
            </div>
          </>
        ) : item.kind === "browser" ? (
          <McpBrowserBody busy={busy} onConnect={onConnectBrowser} />
        ) : item.kind === "local" && item.entry ? (
          <McpLocalFields
            entry={item.entry}
            busy={busy}
            onConnect={onConnectLocal}
            onPickDir={onPickDir}
          />
        ) : item.kind === "direct" && c ? (
          <McpDirectBody
            connector={c}
            hasCreds={item.hasCreds}
            busy={busy}
            onByo={onByo}
            onConnectDirect={onConnectDirect}
          />
        ) : (
          // remote: the key tutorial (`help`) OR one-click / configured / custom URL
          <McpRemoteBody
            item={item}
            help={help}
            busy={busy}
            onConnectRemote={onConnectRemote}
            onConnectApiKey={onConnectApiKey}
            onRemove={onRemove}
          />
        )}
      </div>
    </ModalShell>
  );
}

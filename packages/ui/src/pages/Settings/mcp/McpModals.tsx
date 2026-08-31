import { AnimatePresence } from "framer-motion";
import { MANAGED_CRED_MODE, useHost } from "../../../host";
import { McpToolsModal } from "../../../containers/modals";
import { ByoKeysModal } from "../byo";
import { McpConnectorModal } from "./McpConnectorModal";
import { groupPeers } from "./credGroup";
import type { useMcpConnectors } from "./useMcpConnectors";

/** What `useMcpConnectors` renders — the contract the two mount points pass
 *  around as-is. Defined HERE and not in the hook: its file is frozen by `check:loc`. */
export type McpConnectors = ReturnType<typeof useMcpConnectors>;

/**
 * A connector's modal stack: the detail view, the BYO key form it
 * opens, and the tools inspector. Extracted from `McpTab` because it now has TWO
 * mount points — the Réglages tab, and `ConnectorModalHost`, which opens it from
 * anywhere (rule 9: one single implementation, not two copies of the same wiring).
 *
 * No host call here: everything goes through the `useMcpConnectors` the caller owns.
 */
export function McpModals({ c }: { c: McpConnectors }) {
  const host = useHost();
  const {
    openItem, busy, connectUrls, setOpenId, cancelConnect, connectRemote, connectApiKey,
    connectDirect, connectLocal, enableBrowser, disableBrowser, remove, disconnect,
    setByoId, setByoAdd, reauth, setInspecting, addAccount, addAccountRemote,
    addAccountApiKey, setDirs, byoConnector, byoItem, byoId, byoAdd, items, inspecting,
  } = c;

  return (
    <>
      <AnimatePresence>
        {openItem && (
          <McpConnectorModal
            item={openItem}
            busy={!!busy[openItem.serverId]}
            connectUrl={connectUrls[openItem.serverId] ?? connectUrls[openItem.id]}
            onClose={() => setOpenId(null)}
            onCancelConnect={host.mcp?.cancelConnect ? () => cancelConnect(openItem) : undefined}
            onConnectRemote={(url) => connectRemote(openItem, url)}
            onConnectApiKey={(key) => connectApiKey(openItem, key)}
            onConnectDirect={() => connectDirect(openItem, { mode: MANAGED_CRED_MODE })}
            onConnectLocal={(env, params) => connectLocal(openItem, env, params)}
            onConnectBrowser={host.mcp?.enableBrowser ? () => void enableBrowser() : undefined}
            onDisconnect={(serverId) =>
              // Browser → full opt-out (stop the process + clear the flag). An
              // account-bearing connector (direct OR remote) removes the account
              // (drops its token/oauth/key) so nothing silently reconnects; a
              // connector without accounts (custom/local) just disconnects.
              openItem.kind === "browser"
                ? void disableBrowser()
                : openItem.accounts?.length
                  ? remove(serverId)
                  : disconnect(serverId)
            }
            onRemove={() => remove(openItem.serverId)}
            onByo={() => {
              setByoId(openItem.id);
              setByoAdd(false);
              setOpenId(null);
            }}
            onReauth={host.mcp?.reauthDirect ? (serverId) => reauth(serverId) : undefined}
            // The OTHER connectors the same authorization takes down with it (Google shares
            // a single OAuth client): the card NAMES them, and `setOpenId` switches to whichever
            // one you choose to fix next — the same modal, without leaving the screen.
            // Why name them rather than re-consent to everything: `credGroup.ts`.
            peers={groupPeers(openItem.id, items)}
            onOpenPeer={(id) => setOpenId(id)}
            onInspect={(serverId) => {
              setInspecting({ id: serverId, name: openItem.name });
              setOpenId(null);
            }}
            onAddAccount={
              host.mcp?.addAccountDirect
                ? (mode) => {
                    if (mode === "byo") {
                      setByoId(openItem.id);
                      setByoAdd(true);
                      setOpenId(null);
                    } else {
                      void addAccount(openItem, { mode: MANAGED_CRED_MODE });
                    }
                  }
                : undefined
            }
            onAddAccountRemote={
              host.mcp?.addAccountRemote ? () => void addAccountRemote(openItem) : undefined
            }
            onAddAccountApiKey={
              host.mcp?.addAccountRemote ? (key) => void addAccountApiKey(openItem, key) : undefined
            }
            onPickDir={() => host.mcp!.pickDir()}
            onSetDirs={host.mcp?.setDirs ? setDirs : undefined}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {byoConnector && (
          <ByoKeysModal
            connector={byoConnector}
            hasExisting={byoItem?.hasCreds}
            onSubmit={({ clientId, clientSecret }) => {
              const item = items.find((i) => i.id === byoId);
              if (item)
                void (byoAdd
                  ? addAccount(item, { mode: "byo", clientId, clientSecret })
                  : connectDirect(item, { mode: "byo", clientId, clientSecret }));
            }}
            onClose={() => {
              setByoId(null);
              setByoAdd(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {inspecting && (
          <McpToolsModal
            serverId={inspecting.id}
            serverName={inspecting.name}
            onClose={() => setInspecting(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

import { useEffect, useRef } from "react";
import { useMcpConnectors } from "./useMcpConnectors";
import { McpModals } from "./McpModals";

/**
 * A connector's modal opened FROM SOMEWHERE OTHER than Réglages → Connecteurs: from
 * the "Dossiers" panel, the reconnect banner, an integration card suggested
 * in a conversation. Connecting Dropbox from the sources list no longer leaves
 * the screen to come back to it — it's the SAME modal, with the same OAuth flow, over wherever
 * you were.
 *
 * `AppShell` only mounts it WHILE a connector is requested: the hook talks to
 * the host on mount (`list()` + `byoCredGroups()`), and a permanent host would make
 * every startup pay for those calls for a modal most sessions never open.
 * It unmounts itself as soon as the stack is closed — `onClose` is what
 * announces that to the shell.
 */
export function ConnectorModalHost({
  connectorId,
  nonce,
  allowedMcpIds,
  onClose,
}: {
  connectorId: string;
  /** Re-requesting the SAME connector must re-open it: the nonce is what says so. */
  nonce: number;
  allowedMcpIds?: string[];
  onClose: () => void;
}) {
  const c = useMcpConnectors({
    allowedMcpIds,
    requestedConnector: { id: connectorId, n: nonce },
  });
  const { openId, byoId, inspecting } = c;

  // Closing the last modal in the stack hands control back. An intermediate step
  // ("Voir les outils", the keys form) closes the detail modal and opens
  // another one — hence the three states tested together rather than just `openId`, otherwise
  // the host would unmount mid-journey, taking the inspector down with it.
  const closed = !openId && !byoId && !inspecting;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (closed) onCloseRef.current();
  }, [closed]);

  return <McpModals c={c} />;
}

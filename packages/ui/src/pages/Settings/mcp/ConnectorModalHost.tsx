import { useEffect, useRef } from "react";
import { useMcpConnectors } from "./useMcpConnectors";
import { McpModals } from "./McpModals";

/**
 * La modale d'un connecteur ouverte AILLEURS que dans Réglages → Connecteurs : depuis
 * le panneau « Dossiers », la bannière de reconnexion, une carte d'intégration proposée
 * en conversation. Connecter Dropbox depuis la liste des sources ne fait plus quitter
 * l'écran pour y revenir — c'est la MÊME modale, avec le même flux OAuth, par-dessus là
 * où on était.
 *
 * `AppShell` ne le monte QUE pendant qu'un connecteur est demandé : le hook parle à
 * l'hôte au montage (`list()` + `byoCredGroups()`), et un hôte permanent ferait payer
 * ces appels à chaque démarrage pour une modale que la plupart des sessions n'ouvrent
 * jamais. Il se démonte de lui-même dès que la pile est refermée — `onClose` est ce qui
 * l'annonce à la coquille.
 */
export function ConnectorModalHost({
  connectorId,
  nonce,
  allowedMcpIds,
  onClose,
}: {
  connectorId: string;
  /** Re-demander le MÊME connecteur doit ré-ouvrir : le nonce est ce qui le dit. */
  nonce: number;
  allowedMcpIds?: string[];
  onClose: () => void;
}) {
  const c = useMcpConnectors({
    allowedMcpIds,
    requestedConnector: { id: connectorId, n: nonce },
  });
  const { openId, byoId, inspecting } = c;

  // Refermer la dernière modale de la pile rend la main. Une étape intermédiaire
  // (« Voir les outils », le formulaire de clés) ferme la modale de détail et en ouvre
  // une autre — d'où les trois états testés ensemble plutôt que le seul `openId`, sinon
  // l'hôte se démonterait au milieu du parcours en emportant l'inspecteur avec lui.
  const closed = !openId && !byoId && !inspecting;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (closed) onCloseRef.current();
  }, [closed]);

  return <McpModals c={c} />;
}

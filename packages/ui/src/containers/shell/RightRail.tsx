import type { ReactNode } from "react";
import { useState } from "react";
import type { AskTarget } from "../../types";
import {
  BrowserIcon,
  ExpandIcon,
  FeedbackIcon,
  FolderIcon,
  HelpIcon,
  PlusIcon,
  RefreshIcon,
} from "../../components/brand";
import { useLocalFsCapable } from "../../hooks/useLocalFsCapable";
import { FolderTreePanel } from "./folders/FolderTreePanel";
import { RailRow, RailSquare, FaviconTile } from "./RightRailParts";
import { BRAND } from "@openmasq/branding";

/**
 * The RIGHT RAIL — the workspace's right-edge sidebar, a sibling of the left
 * `Rail`/`Sidebar` on the shell frame (mounted by `AppShell`, `chats` + `library`).
 * Its MAIN job is agent-browser management — it lists the browser's REAL web tabs
 * (selecting switches the child's tab, ✕ closes it, the globe opens a new one).
 * Documents live in the `SidePanel`'s own `PanelTabs`, not here. Two widths: normal
 * (icon tabs) and expanded (a labelled list). Clicking the ACTIVE browser tab
 * collapses the panel (caller decides).
 *
 * The FOOT carries everything that is NOT a source: the two "ask the app" actions
 * only while a panel is open) then the two ask-the-app actions — « Aide » (the guide) and
 * « Envoyer un avis » — moved off the left rail to keep it pure NAVIGATION. ⚠️ This rail
 * only exists on `chats` + `library`: the other sections keep reaching the guide via ⌘K
 * (« aide ») and mobile via Réglages, which is why the guide stays shell-level.
 *
 * Une fois OUVERT, il montre les DEUX gisements empilés — les onglets web, puis les sources
 * de fichiers (`FolderTreePanel` : dossiers accordés et stockage connecté). Ils répondent à
 * la même question, « qu'est-ce que je peux ouvrir à côté de la conversation ? », donc les
 * rendre exclusifs cachait toujours la moitié de la réponse. Un seul ascenseur pour les
 * deux : deux dans 214 px sont deux fois trop.
 *
 * Trois choses restent délibérées :
 *  · le groupe des dossiers s'affiche dès que la PLATEFORME en est capable, y compris
 *    vide : sans dossier local ni cloud connecté, le panneau ne montrait rien du tout —
 *    or c'est cet utilisateur-là qu'il faut inviter, et les deux invitations (autoriser
 *    un dossier, connecter un stockage) vivent dedans. Seule une plateforme SANS le
 *    créneau (aperçu web, mobile) n'a rien à proposer et le masque ;
 *  · un arbre ne tient pas dans le rail de 44 px : celui-ci garde les onglets et un bouton
 *    qui OUVRE le panneau, plutôt qu'un ersatz tronqué ;
 *  · les DOCUMENTS ouverts ne vivent toujours pas ici — ils se commutent depuis la barre
 *    d'onglets du panneau (`PanelTabs`). Une source dont on part n'est pas une liste
 *    d'éléments ouverts.
 */

/** Une entrée de PIED, rendue soit en icône (rail étroit) soit en ligne libellée (vue large). */
interface FootItem {
  key: string;
  icon: JSX.Element;
  label: string;
  title: string;
  onClick: () => void;
}

/** One rail entry for a REAL browser web tab (labelled by title, else host). */
export interface RailBrowserTab {
  id: string;
  label: string;
  /** The site favicon as a raster `data:` URL, else absent → the letter tile. */
  favicon?: string;
  /** The tab the model is PILOTING — the drive halo follows this, not the visible tab. */
  agent?: boolean;
}

export function RightRail({
  browserTabs,
  activeBrowserTab,
  browserOnScreen,
  browserBusy,
  driving,
  onNewBrowser,
  onSelectBrowserTab,
  onCloseBrowserTab,
  onOpenGuide,
  onOpenAvis,
  shareInbox,
  shareInboxNarrow,
  onOpenUpdate,
  updateVersion,
  onManageFolders,
  onOpenConnector,
  onAskTarget,
}: {
  /** The agent browser's REAL web tabs (empty until the child reports). */
  browserTabs: RailBrowserTab[];
  /** The child's active web-tab id, else null. */
  activeBrowserTab: string | null;
  /** The panel currently shows the browser (drives the accent + collapse). */
  browserOnScreen: boolean;
  /** The agent is driving the browser while it is off-screen — pulse the globe. */
  browserBusy?: boolean;
  /** The agent is driving the browser right now — drive dot on its tab. */
  driving?: boolean;
  onNewBrowser: () => void;
  onSelectBrowserTab: (id: string) => void;
  onCloseBrowserTab: (id: string) => void;
  /** Rouvrir l'annonce d'une mise à jour TÉLÉCHARGÉE — le bouton n'existe que
   *  tant qu'une version attend un redémarrage (couple avec `updateVersion`). */
  onOpenUpdate?: () => void;
  /** La version prête, pour la NOMMER (« Redémarrer pour 0.5.1 »). */
  updateVersion?: string | null;
  /** Open « Aide » (the in-app guide). */
  onOpenGuide: () => void;
  /** Open « Votre avis ». Absent (no `host.avis`) ⇒ not rendered at all. */
  onOpenAvis?: () => void;
  /** The share-requests bell (ShareInbox), wide-row / narrow-icon variants —
   *  slots, so this rail stays ignorant of the org-share machinery. */
  shareInbox?: ReactNode;
  shareInboxNarrow?: ReactNode;
  /** Open Réglages → Connecteurs on the Filesystem connector (grant/revoke).
   *  Absent ⇒ the tree offers no way out to the settings. */
  onManageFolders?: () => void;
  /** Open Réglages → Connecteurs on a storage connector (Drive, OneDrive…). */
  onOpenConnector?: (connectorId: string) => void;
  /** Start a conversation ABOUT a source (« Demander », on hover) — a granted folder,
   *  or a file/folder of a connected storage. The target is STAGED as a tag on the new
   *  conversation (see `useShell.askAboutTarget`), never written into the draft. */
  onAskTarget?: (target: AskTarget) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // La CAPACITÉ de la plateforme, pas « y a-t-il déjà des dossiers » : le panneau doit
  // s'afficher justement quand il n'y a rien, puisque c'est lui qui invite à en ajouter.
  const hasFolders = useLocalFsCapable();

  const expandBtn = (
    <button
      type="button"
      className="rail-btn"
      title={expanded ? "Réduire la barre" : "Agrandir la barre"}
      aria-label={expanded ? "Réduire la barre" : "Agrandir la barre"}
      aria-pressed={expanded}
      onClick={() => setExpanded((v) => !v)}
    >
      <ExpandIcon size={16} />
    </button>
  );

  const newBrowserBtn = (
    <button
      type="button"
      className={`rail-btn${browserBusy && !browserOnScreen ? " busy" : ""}`}
      title="Nouvel onglet navigateur"
      aria-label="Nouvel onglet navigateur"
      onClick={onNewBrowser}
    >
      <BrowserIcon size={18} />
    </button>
  );

  const browserActive = (id: string) => browserOnScreen && id === activeBrowserTab;

  /**
   * LE PIED — tout ce qui n'est pas un gisement, dans les DEUX largeurs.
   *
   * ⚠️ Il ne porte QUE les actions « demander à l'app » (+ la cloche Demandes). Les
   * commandes du panneau (agrandir / fermer) ont été retirées : recliquer l'onglet
   * ACTIF replie déjà, chaque élément a sa croix — n'en remettre une que si un geste
   * devient inatteignable. Un seul tableau pour les deux rendus (icônes étroites /
   * lignes libellées), sinon les libellés se perdaient d'un côté.
   */
  const askBtns: FootItem[] = [
    // La mise à jour EN TÊTE du pied, seulement quand il y en a une — en dernier
    // elle glissait sous le pli du rail étroit chez qui a aussi « Envoyer un avis ».
    ...(onOpenUpdate && updateVersion
      ? [
          {
            key: "update",
            icon: <RefreshIcon size={17} />,
            label: `Mise à jour ${updateVersion}`,
            title: `${BRAND.name} ${updateVersion} est prête — voir les nouveautés et redémarrer`,
            onClick: onOpenUpdate,
          },
        ]
      : []),
    { key: "guide", icon: <HelpIcon size={17} />, label: "Aide", title: `Aide — prendre en main ${BRAND.name}`, onClick: onOpenGuide },
    ...(onOpenAvis
      ? [{ key: "avis", icon: <FeedbackIcon size={17} />, label: "Envoyer un avis", title: "Envoyer un avis", onClick: onOpenAvis }]
      : []),
  ];

  // Un seul rendu paramétré (icône étroite / ligne large) : l'accent de la mise à
  // jour doit être identique des deux côtés, deux blocs recopiés le perdraient.
  const footBtn = (f: FootItem, wide: boolean) => (
    <button
      key={f.key}
      type="button"
      className={`${wide ? "rr-foot-row" : "rail-btn"}${f.key === "update" ? " rr-upd" : ""}`}
      title={f.title}
      aria-label={wide ? undefined : f.label}
      onClick={f.onClick}
    >
      {wide ? (
        <>
          <span className="rr-foot-ico" aria-hidden="true">{f.icon}</span>
          <span className="rr-foot-lbl">{f.label}</span>
        </>
      ) : (
        f.icon
      )}
    </button>
  );
  const footIcons = askBtns.map((f) => footBtn(f, false));
  const footRows = askBtns.map((f) => footBtn(f, true));

  const browserTile = (t: RailBrowserTab) => <FaviconTile label={t.label} src={t.favicon} />;
  const itemProps = (t: RailBrowserTab) => ({
    label: t.label,
    on: browserActive(t.id),
    tile: browserTile(t),
    // The drive indicator follows the PILOTED tab (`agent`), not the visible/active one.
    drive: driving && !!t.agent,
    onSelect: () => onSelectBrowserTab(t.id),
    onClose: () => onCloseBrowserTab(t.id),
  });

  if (expanded) {
    return (
      <aside className="right-rail expanded" aria-label="Navigateur, dossiers et aide">
        <div className="rr-head">
          <span className="cv-eyebrow rr-title">Panneau droit</span>
          {expandBtn}
        </div>
        {/* UNE colonne, deux gisements empilés : les onglets web et les sources de
            fichiers sont tous deux « ce qu'on peut ouvrir à côté de la conversation ».
            Un sélecteur les rendait exclusifs — donc la moitié de la réponse était
            toujours cachée, et il fallait un clic pour se rappeler ce qu'il y avait de
            l'autre côté. Un seul défilement aussi : deux ascenseurs dans 214 px, c'est
            deux fois trop. */}
        <div className="rr-body">
          <div className="rr-tree-group" title="Navigateur">
            <span className="rr-group-ico" aria-hidden="true">
              <BrowserIcon size={13} />
            </span>
            <span className="cv-eyebrow rr-group-lbl">Web</span>
            <span className="rr-group-rule" aria-hidden="true" />
            <button
              type="button"
              className="rr-tree-gear"
              title="Nouvel onglet navigateur"
              aria-label="Nouvel onglet navigateur"
              onClick={onNewBrowser}
            >
              <PlusIcon size={13} />
            </button>
          </div>
          <div className="rr-list">
            {browserTabs.map((t) => (
              <RailRow key={t.id} {...itemProps(t)} />
            ))}
            {browserTabs.length === 0 && (
              <div className="rr-empty">Aucun onglet ouvert.</div>
            )}
          </div>
          {hasFolders && (
            <FolderTreePanel
              onManageFolders={onManageFolders}
              onOpenConnector={onOpenConnector}
              onAskTarget={onAskTarget}
            />
          )}
        </div>
        <div className="rr-foot">{shareInbox}{footRows}</div>
      </aside>
    );
  }

  return (
    <aside className="right-rail" aria-label="Navigateur, dossiers et aide">
      {expandBtn}
      {newBrowserBtn}
      {/* Un arbre ne tient pas dans 44 px : le rail étroit montre les onglets, et le
          bouton d'ouverture au-dessus est ce qui mène aux dossiers. */}
      {hasFolders && (
        <button
          type="button"
          className="rail-btn"
          title="Dossiers et stockage connecté — ouvrir le panneau"
          aria-label="Dossiers et stockage connecté"
          onClick={() => setExpanded(true)}
        >
          <FolderIcon size={18} />
        </button>
      )}
      {browserTabs.length > 0 && <span className="right-rail-sep" aria-hidden="true" />}
      {browserTabs.map((t) => (
        <RailSquare key={t.id} {...itemProps(t)} />
      ))}
      <span className="right-rail-spacer" aria-hidden="true" />
      {shareInboxNarrow}
      {footIcons}
    </aside>
  );
}

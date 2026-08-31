import { useState } from "react";
import type { AskTarget } from "../../../types";
import { useHost, type LocalFsEntry } from "../../../host";
import {
  ChevRightIcon,
  FolderIcon,
  HardDriveIcon,
  PlusIcon,
  RefreshIcon,
  SettingsIcon,
} from "../../../components/brand";
import { useFolderTree } from "../../../hooks/useFolderTree";
import { StorageSources } from "./StorageSources";
import { TreeRow } from "./TreeRow";
import { FILESYSTEM_CONNECTOR_ID, localServerId } from "../../../state/mcpIds";
import { panelOpenLocalFile, useAppDispatch } from "../../../state/redux";

import { useT } from "../../../i18n";
/**
 * « Dossiers » — les sources de fichiers, dans la barre de droite.
 *
 * Deux gisements qui répondent à la même question (« où est ce document ? ») et ne
 * diffèrent que par l'endroit où vivent les octets : les dossiers ACCORDÉS sur cette
 * machine, parcourus en arbre, et le STOCKAGE CONNECTÉ (Drive, OneDrive, Dropbox), dont
 * la ligne dit l'état et mène à son réglage.
 *
 * ⚠️ Le stockage connecté ne se DÉPLIE pas, et c'est une limite, pas un oubli : ces
 * connecteurs n'exposent leurs fichiers que par des outils faits pour un modèle (de la
 * prose, un appel redacted, aucun listing typé) — c'est exactement la raison d'être de
 * `host.localFs` côté local. Les lister sans arbre dit la vérité ; un faux arbre
 * mentirait sur ce que l'app sait faire.
 *
 * Ouvrir un fichier dispatche le MÊME `panelOpenLocalFile` que partout : il atterrit dans
 * LE panneau latéral partagé, relu du disque. Regarder n'est pas envoyer — la règle 11
 * gouverne ce que voit le MODÈLE ; le moment qui bascule est « Demander ».
 */
export function FolderTreePanel({
  onManageFolders,
  onOpenConnector,
  onAskTarget,
}: {
  /** Ouvrir Réglages → Connecteurs sur le connecteur Filesystem. */
  onManageFolders?: () => void;
  /** Ouvrir Réglages → Connecteurs sur un connecteur de stockage. */
  onOpenConnector?: (connectorId: string) => void;
  /** Démarrer une conversation À PROPOS d'une cible — stagée en TAG (dossier/fichier,
   *  local/cloud), jamais en prose de brouillon ; le modèle a les outils du connecteur
   *  pour aller la lire. Absent ⇒ l'action de survol n'est pas offerte. */
  onAskTarget?: (target: AskTarget) => void;
}) {
  const t = useT();
  const dispatch = useAppDispatch();
  const host = useHost();
  const tree = useFolderTree(true);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  const mcp = host.mcp;
  const canAdd = !!mcp?.pickDir && !!mcp?.setDirs;
  /* Un dossier NEUF ne peut venir que du sélecteur natif : l'hôte le vérifie côté
     privilégié, le renderer ne peut pas s'attribuer un chemin.
     Trois choses qu'un raccourci rate ici, et qui font un bouton « qui ne fait rien » :
      · le serveur visé est `local-filesystem`, pas `filesystem` (`state/mcpIds.ts`) ;
      · la LISTE part de ce que le serveur a réellement enregistré — `setDirs` remplace,
        donc n'envoyer que le nouveau chemin révoquerait les autres en silence ;
      · un refus revient dans `info.error`, il n'est PAS levé : sans le lire, l'échec
        n'existe nulle part à l'écran ;
      · et le connecteur peut ne pas être connecté du tout — c'est même l'état par défaut
        d'une install fraîche, celui où ce bouton est le plus cliqué. */
  const addFolder = async () => {
    if (!mcp?.pickDir || !mcp.setDirs || adding) return;
    setAdding(true);
    setAddError("");
    try {
      const serverId = localServerId(FILESYSTEM_CONNECTOR_ID);
      const server = (await mcp.list()).find((s) => s.id === serverId);
      // La clé du paramètre vient du serveur lui-même quand il existe ; sinon `root`,
      // qui est ce que le catalogue de main déclare (`mcp/catalog.ts`) — et déjà le
      // repli qu'utilisait ce fichier.
      const key = server ? (Object.keys(server.params ?? {})[0] ?? "root") : "root";
      const current = server ? (server.params?.[key] ?? tree.roots) : [];

      // ⚠️ LE SÉLECTEUR D'ABORD, même connecteur absent. Le dossier n'est pas un réglage
      // du connecteur : c'est l'AUTORISATION elle-même, et le serveur refuse d'être
      // enregistré sans elle (« Dossiers autorisés requis » — `root` est requis). Tenter
      // de l'installer à vide pour « réparer » avant de demander échoue donc toujours.
      const picked = await mcp.pickDir();
      if (!picked || current.includes(picked)) return;

      // Connecteur absent ⇒ on l'installe AVEC le dossier qui vient d'être accordé, puis
      // on le branche. L'utilisateur n'a rien à connecter lui-même : il a choisi un
      // dossier, l'intégration se met en place derrière. Rien n'est autorisé au passage —
      // la racine reste ce que le dialogue NATIF a renvoyé (`main/fs/CLAUDE.md`).
      if (!server) {
        const added = await mcp.addStdio(FILESYSTEM_CONNECTOR_ID, {}, { [key]: [picked] });
        if (added?.error) {
          setAddError(added.error);
          return;
        }
        const started = await mcp.connect(serverId);
        if (started?.error) setAddError(started.error);
        else tree.refresh();
        return;
      }
      // Enregistré mais éteint : le rebrancher, sinon `setDirs` écrirait dans le vide.
      if (server.connected === false) {
        const started = await mcp.connect(serverId);
        if (started?.error) {
          setAddError(started.error);
          return;
        }
      }
      const info = await mcp.setDirs(server.id, key, [...current, picked]);
      if (info?.error) setAddError(info.error);
      else tree.refresh();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="rr-tree">
      <div className="rr-list rr-tree-list">
        {/* Un GROUPE est marqué par son icône, pas par une phrase : à 214 px, deux
            libellés de section coûtent une ligne chacun et disent ce que les deux
            glyphes opposent déjà (le disque ici / le nuage plus bas). Le titre entier
            reste dans l'infobulle et dans le nom accessible. */}
        <div className="rr-tree-group" title={t.shell.folders.onThisDevice}>
          <span className="rr-group-ico" aria-hidden="true">
            <HardDriveIcon size={13} />
          </span>
          <span className="cv-eyebrow rr-group-lbl">{t.shell.folders.local}</span>
          <span className="rr-group-rule" aria-hidden="true" />
          {onManageFolders && (
            <button
              type="button"
              className="rr-tree-gear"
              title={t.shell.folders.manageFolders}
              aria-label={t.shell.folders.manageFolders}
              onClick={onManageFolders}
            >
              <SettingsIcon size={13} />
            </button>
          )}
        </div>
        {tree.rows.map(({ key, entry, depth, expanded, loading, failed }) =>
          depth === 0 ? (
            <SourceRow
              key={key}
              entry={entry}
              expanded={expanded}
              loading={loading}
              onToggle={() => tree.toggle(entry.path)}
            />
          ) : (
            <TreeRow
              key={key}
              entry={entry}
              depth={depth}
              expanded={expanded}
              loading={loading}
              failed={failed}
              onToggle={() => tree.toggle(entry.path)}
              onOpen={() => dispatch(panelOpenLocalFile({ path: entry.path, name: entry.name }))}
              /* « Demander » n'est offert que sur un DOSSIER local (TreeRow) — un
                 fichier local passe par les octets (`LocalFilePanel`). */
              onAsk={(e) => onAskTarget?.({ kind: "folder", name: e.name, path: e.path })}
            />
          ),
        )}
        {tree.roots.length === 0 && (
          <div className="rr-empty">{t.shell.folders.noFolders}</div>
        )}
        {canAdd && (
          <button
            type="button"
            className="rr-tree-add"
            title={t.shell.folders.addFolder}
            aria-label={t.shell.folders.addFolder}
            aria-busy={adding}
            onClick={() => void addFolder()}
          >
            {/* Le « + » suffit sur une barre en pointillés : la forme dit « ajouter ici »
                aussi bien que le mot. Pendant la sélection native, le glyphe pulse —
                l'état ne prend pas de place, il en change. */}
            <PlusIcon size={14} />
          </button>
        )}

        <StorageSources onOpenConnector={onOpenConnector} onAsk={onAskTarget} />
      </div>

      {/* Un échec réel se dit : dossier retiré, disque débranché, autorisation révoquée. */}
      {(tree.error || addError) && (
        <p className="rr-tree-error">
          {tree.error || addError}{" "}
          <button type="button" className="rr-tree-retry" onClick={tree.refresh}>
            <RefreshIcon size={12} /> Réessayer
          </button>
        </p>
      )}

    </div>
  );
}

/** Une RACINE accordée : la ligne porte l'endroit d'où elle vient, que le seul nom de
 *  dossier ne dit pas (« Documents » — lequel ?). */
function SourceRow({
  entry,
  expanded,
  loading,
  onToggle,
}: {
  entry: LocalFsEntry;
  expanded: boolean;
  loading: boolean;
  onToggle: () => void;
}) {
  return (
    /* Le chemin complet est dans l'infobulle, pas sous le nom : deux lignes par racine
       doublaient la hauteur du groupe pour une information qu'on lit une fois. */
    <button type="button" className="rr-src" title={entry.path} onClick={onToggle}>
      <span className={`rr-tree-chev${expanded ? " open" : ""}`} aria-hidden="true">
        <ChevRightIcon size={11} />
      </span>
      <span className="rr-tree-glyph" aria-hidden="true">
        <FolderIcon size={14} />
      </span>
      <span className="rr-src-name">{entry.name}</span>
      {loading && <span className="rr-tree-loading">…</span>}
    </button>
  );
}

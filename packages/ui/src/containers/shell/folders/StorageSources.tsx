import { STORAGE_CONNECTORS, connectorBrandName } from "@openmasq/catalog/mcp";
import type { AskTarget } from "../../../types";
import { ChevRightIcon, CloudIcon, PlugIcon, RefreshIcon } from "../../../components/brand";
import { McpTile } from "../../../components/media/McpTile";
import { useCloudTree, parseCloudKey } from "../../../hooks/useCloudTree";
import { useMcpConnectedIds } from "../../../hooks/useMcpConnectedIds";
import { TreeRow } from "./TreeRow";

import { useT } from "../../../i18n";
/**
 * Le STOCKAGE CONNECTÉ (Drive, OneDrive, Dropbox) dans la vue « Dossiers » — le second
 * gisement, sous son propre marqueur de groupe.
 *
 * ⚠️ Deux régimes, et la ligne dit lequel. Un compte que l'app sait PARCOURIR
 * (`host.cloudFs` : Drive et OneDrive par appel direct, Dropbox par son propre outil de
 * listage) est une racine dépliable, exactement comme un dossier local : même arbre, même
 * dépliage paresseux. Les autres — un compte non connecté, ou un serveur qui ne rend pas de
 * liste exploitable — gardent la ligne d'état qui ouvre la modale du connecteur. C'est main
 * qui tranche, en n'annonçant source QUE ce qu'il sait lister : un chevron qui ne mènerait
 * nulle part serait pire que pas de chevron.
 *
 * La ligne garde son NOM et son gabarit. Le logo seul suffirait à reconnaître trois
 * marques mondiales, mais l'alignement avec les racines locales juste au-dessus — même
 * ligne, même pastille d'état — est ce qui fait lire les deux gisements comme UNE liste
 * de sources plutôt que deux inventaires sans rapport.
 */
export function StorageSources({
  onOpenConnector,
  onAsk,
}: {
  /** Ouvre la modale du connecteur (par-dessus l'écran courant, pas un détour). */
  onOpenConnector?: (connectorId: string) => void;
  /** « Demander » sur un dossier ou un fichier distant : rien ne part, la conversation
   *  porte la cible en TAG — dossier ou fichier, avec son service — et le modèle ira la
   *  lire avec les outils du connecteur. Le `kind` vient de l'entrée cliquée : sans lui,
   *  un nom nu (« patrons ») se lisait comme un concept, pas comme le dossier cliqué. */
  onAsk?: (target: AskTarget) => void;
}) {
  const t = useT();
  const connected = useMcpConnectedIds();
  const cloud = useCloudTree(true);
  /* Un compte navigable remplace sa ligne d'état par sa racine — sinon il apparaîtrait
     deux fois, une fois comme arbre et une fois comme état. */
  const browsable = new Set(cloud.sources.map((s) => s.connectorId));

  return (
    <>
      <div className="rr-tree-group" title={t.shell.folders.connectedStorage}>
        <span className="rr-group-ico" aria-hidden="true">
          <CloudIcon size={13} />
        </span>
        <span className="cv-eyebrow rr-group-lbl">{t.shell.folders.cloud}</span>
        <span className="rr-group-rule" aria-hidden="true" />
      </div>
      {cloud.rows.map(({ key, entry, depth, expanded, loading, failed }) => {
        const { sourceId } = parseCloudKey(entry.path);
        const source = cloud.sources.find((s) => s.id === sourceId);
        const connector = STORAGE_CONNECTORS.find((c) => c.id === source?.connectorId);
        const label = (connector && connectorBrandName(connector.id)) ?? entry.name;
        return depth === 0 ? (
          <button
            key={key}
            type="button"
            className="rr-src"
            title={t.shell.folders.sourceLabel(connector?.name ?? label, source?.label ?? "")}
            onClick={() => cloud.toggle(entry.path)}
          >
            <span className={`rr-tree-chev${expanded ? " open" : ""}`} aria-hidden="true">
              <ChevRightIcon size={11} />
            </span>
            {connector && (
              <McpTile id={connector.id} name={connector.name} tone={connector.tone ?? "sky"} sm />
            )}
            <span className="rr-src-name">{label}</span>
            {failed ? (
              <span className="rr-tree-failed" title={t.shell.folders.accountFailed}>
                !
              </span>
            ) : loading ? (
              <span className="rr-tree-loading">…</span>
            ) : (
              <span className="rr-src-dot" aria-hidden="true" />
            )}
          </button>
        ) : (
          <TreeRow
            key={key}
            entry={entry}
            depth={depth}
            expanded={expanded}
            loading={loading}
            failed={failed}
            onToggle={() => cloud.toggle(entry.path)}
            /* Un fichier distant ne s'OUVRE pas dans le panneau : ses octets ne passent
               pas par cette voie. Le cliquer DEMANDE — ce que le modèle sait faire. */
            onOpen={() =>
              onAsk?.({
                kind: entry.kind === "dir" ? "folder" : "file",
                name: entry.name,
                /* `label`, pas `connector.name` : le tag et la ligne de contexte du
                   modèle portent le SERVICE (« Google Drive »), pas le suffixe d'UI
                   du catalogue (« (lecture) »). */
                source: connector ? label : undefined,
              })
            }
            onAsk={(e) =>
              onAsk?.({
                kind: e.kind === "dir" ? "folder" : "file",
                name: e.name,
                source: connector ? label : undefined,
              })
            }
          />
        );
      })}
      {STORAGE_CONNECTORS.filter((c) => !browsable.has(c.id)).map((c) => {
        const on = connected.includes(c.id);
        return (
          <button
            key={c.id}
            type="button"
            className={`rr-src${on ? "" : " off"}`}
            /* L'état complet vit dans l'infobulle : à 214 px, une phrase par ligne
               remplit le panneau d'explications et cache ce qu'on venait y chercher. */
            title={
              on
                ? `${c.name} — connecté, accessible au modèle. Ouvrir ses réglages.`
                : `${c.name} — non connecté. Se connecter.`
            }
            onClick={() => onOpenConnector?.(c.id)}
          >
            <span className="rr-tree-chev" aria-hidden="true" />
            {/* La marque du fournisseur : trois sources de stockage se distinguent par
                leur logo avant leur nom. Même tuile que les cartes de connecteurs. */}
            <McpTile id={c.id} name={c.name} tone={c.tone ?? "sky"} sm />
            {/* « (lecture) » ne dit rien ici — tout ce panneau est en lecture, et le nom
                entier reste dans l'infobulle. */}
            <span className="rr-src-name">{connectorBrandName(c.id) ?? c.name}</span>
            {/* Connecté : une pastille. Sinon la prise, qui EST l'action. Deux glyphes de
                même largeur, donc les lignes s'alignent quel que soit leur état. */}
            {on ? (
              <span className="rr-src-dot" aria-hidden="true" />
            ) : (
              <span className="rr-src-cta" aria-hidden="true">
                <PlugIcon size={13} />
              </span>
            )}
          </button>
        );
      })}
      {cloud.error && (
        <p className="rr-tree-error">
          {cloud.error}{" "}
          <button type="button" className="rr-tree-retry" onClick={cloud.refresh}>
            <RefreshIcon size={12} /> Réessayer
          </button>
        </p>
      )}
    </>
  );
}

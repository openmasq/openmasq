import { ChevRightIcon, FolderIcon, MessageIcon } from "../../../components/brand";
import type { LocalFsEntry } from "../../../host";
import { extLabel } from "../../../state/localFsPaths";

/** Une ligne de l'arbre : un dossier qui se déplie, un fichier qui s'ouvre. Le survol
 *  d'un dossier propose « Demander » — l'intention même pour laquelle on ouvre ce
 *  panneau pendant qu'on écrit. */
export function TreeRow({
  entry,
  depth,
  expanded,
  loading,
  failed,
  onToggle,
  onOpen,
  onAsk,
}: {
  entry: LocalFsEntry;
  depth: number;
  expanded: boolean;
  loading: boolean;
  /** Sa lecture a échoué — la ligne le DIT au lieu de charger indéfiniment. */
  failed?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAsk?: (entry: LocalFsEntry) => void;
}) {
  const isDir = entry.kind === "dir";
  return (
    <span className="rr-tree-line">
      <button
        type="button"
        className={`rr-tree-row${isDir ? " is-dir" : ""}`}
        // L'indentation est la seule chose calculée à l'exécution (elle vient de la
        // profondeur, une donnée) ; couleurs et états restent dans la feuille de style.
        style={{ paddingInlineStart: `${6 + depth * 12}px` }}
        title={entry.path}
        aria-expanded={isDir ? expanded : undefined}
        onClick={isDir ? onToggle : onOpen}
      >
        <span className={`rr-tree-chev${expanded ? " open" : ""}`} aria-hidden="true">
          {isDir && <ChevRightIcon size={11} />}
        </span>
        {isDir ? (
          <span className="rr-tree-glyph" aria-hidden="true">
            <FolderIcon size={13} />
          </span>
        ) : (
          <span className="rr-tree-ext" aria-hidden="true">
            {extLabel(entry.name)}
          </span>
        )}
        <span className="rr-tree-name">{entry.name}</span>
        {/* Un dossier ouvert dont le listing n'est pas là ressemble à un dossier vide —
            et un dossier vide qui n'en est pas un se lit comme un mensonge. L'ÉCHEC a son
            propre signe : « … » pour toujours faisait attendre un contenu qui ne vient pas
            (la raison, elle, s'affiche en bas du panneau). */}
        {failed ? (
          <span className="rr-tree-failed" title="Ce dossier n'a pas pu être lu — repliez puis rouvrez pour réessayer">
            !
          </span>
        ) : loading ? (
          <span className="rr-tree-loading">…</span>
        ) : null}
      </button>
      {isDir && onAsk && (
        <button
          type="button"
          className="rr-tree-ask"
          title={`Demander à propos de ${entry.name}`}
          aria-label={`Demander à propos de ${entry.name}`}
          onClick={() => onAsk(entry)}
        >
          <MessageIcon size={9} /> Demander
        </button>
      )}
    </span>
  );
}

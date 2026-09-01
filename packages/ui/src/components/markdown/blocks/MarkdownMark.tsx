import { useContext } from "react";
import { useFileOpen } from "../../../containers/providers/fileOpen";
import { MarkdownDocContext } from "../context";
import { baseName } from "../../../state/localFsPaths";
import { FileIcon } from "../../brand/icons";

import { useT } from "../../../i18n";
/**
 * The renderer for the `<mark>` elements `rehypeRedact` emits (the redaction marks).
 * Every mark renders unchanged — except a **local file PATH** (`data-kind="path"`)
 * that the platform can actually open, which gains a small file icon on its LEFT:
 * one click shows the real document in the right-hand panel viewer (the SAME
 * `panelOpenLocalFile` the Bibliothèque's « Dossiers » finder dispatches — never a
 * second opener).
 *
 * Gates, all UX (main's grant gate re-checks the read — the renderer never decides
 * access): the `fileOpen` context must be provided (desktop shell only; absent ⇒ no
 * icon anywhere), the path must sit inside a GRANTED root (`isOpenablePath`, pure —
 * NEVER an existence probe: an automatic stat() of every path in a reply would be a
 * fake→real oracle, the `MarkdownLink` preview rule), and the value must be
 * filename-shaped (a directory has no bytes to view). The click passes the REAL path
 * (`data-real`) — the user sees and opens their actual file, rule 11 governs only
 * what the MODEL sees.
 */

/** A filename-shaped tail — the viewer needs a FILE, not a directory. */
const FILE_TAIL_RE = /\.[A-Za-z0-9]{1,8}$/;

/** A BARE filename (« bilan_2024-1.pdf » with no path — the most common citation
 *  in a reply) is resolved to its full path when the conversation's COFFRE
 *  knows EXACTLY ONE that ends with that name: the connector already
 *  listed it, the value is safe. Two candidates = ambiguous, no icon (never a
 *  guessed choice). Pure, zero IPC — the coffre is already in memory. */
function resolveBarePath(real: string, vault?: Record<string, string>): string | null {
  if (/[\\/]/.test(real)) return real; // already a path
  if (!vault) return null;
  let found: string | null = null;
  for (const v of Object.values(vault)) {
    if (!/^([A-Za-z]:[\\/]|[\\/~])/.test(v) || !(v.endsWith(`/${real}`) || v.endsWith(`\\${real}`))) continue;
    if (found && found !== v) return null; // ambiguous
    found = v;
  }
  return found;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- react-markdown override shape (same as `a`/`p` in Markdown.tsx)
export function MarkdownMark(props: any) {
  const t = useT();
  const { node: _node, children, ...rest } = props;
  const real = rest["data-real"] as string | undefined;
  const kind = rest["data-kind"] as string | undefined;
  const { openLocalPath, isOpenablePath } = useFileOpen();
  const { vault } = useContext(MarkdownDocContext);
  const path = kind === "path" && real ? resolveBarePath(real, vault) : null;
  const openable =
    !!path &&
    FILE_TAIL_RE.test(baseName(path)) &&
    !!openLocalPath &&
    isOpenablePath?.(path) === true;
  if (!openable) return <mark {...(rest as object)}>{children}</mark>;
  const name = baseName(path);
  return (
    <>
      <button
        type="button"
        onClick={() => openLocalPath(path)}
        aria-label={t.leaves.openInPanel(name)}
      title={t.leaves.openInPanel(name)}
        className="md-open-file inline-flex items-center justify-center align-[-3px] w-[18px] h-[18px] mr-1 rounded-[var(--radius-sm)] text-muted cursor-pointer hover:text-body hover:bg-surface-hover transition-colors"
      >
        <FileIcon size={13} />
      </button>
      <mark {...(rest as object)}>{children}</mark>
    </>
  );
}

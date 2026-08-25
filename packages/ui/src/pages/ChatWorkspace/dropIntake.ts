import { BRAND } from "@openmasq/branding";
/**
 * What a drag-and-drop onto a conversation MEANS — the pure decision, extracted so the
 * security-shaped part of it is testable without a DOM drop event.
 *
 * ## Why files and folders take completely different routes
 *
 * Two invariants of this codebase forbid the obvious implementation (read the dropped
 * path, hand it to main), and they are the reason this module exists at all:
 *
 *  - **`files:read` is default-REFUSE** and only opens for a path `grantRead`-ed by a
 *    NATIVE picker (`ipc/CLAUDE.md`). A drop arrives through the renderer, which is
 *    untrusted — granting a dropped path would hand a renderer XSS arbitrary disk read.
 *    So a dropped FILE never travels as a path: the browser already handed us its BYTES,
 *    and bytes are a capability the renderer legitimately holds. `files:extract-bytes`
 *    takes them, and nothing new is granted.
 *  - **A filesystem grant may only be minted by the native `mcp:pick-dir` dialog**
 *    (`fs/CLAUDE.md`, pinned by `mcp/stdioDirs.test.ts`). So a dropped FOLDER cannot be
 *    authorised by dropping it. What its path may do is one thing only: **pre-position
 *    that dialog**. The hint is unprivileged — a forged one opens a picker in the wrong
 *    place and grants nothing, because the grant comes from what the dialog RETURNS.
 *
 * Keep that asymmetry. A future edit that "simplifies" this by sending the dropped path
 * to main and granting it re-opens both holes at once.
 */

/** A folder the user dropped: its name for the card, its path ONLY as a picker hint. */
export interface DroppedFolder {
  name: string;
  /** Untrusted, unprivileged: `defaultPath` for the native dialog. Never a grant. */
  hintPath?: string;
}

export interface DropIntake {
  /** Dropped files, to attach to the message — carried as `File`, never as a path. */
  files: File[];
  /** Dropped directories, to OFFER for authorisation. */
  folders: DroppedFolder[];
  /** Something was dropped that we can neither attach nor offer (a URL, plain text). */
  ignored: number;
}

/**
 * Split a drop into its two routes.
 *
 * `webkitGetAsEntry()` is what tells a directory from a file BEFORE any privileged call —
 * a directory's `File` object is indistinguishable from a 0-byte file otherwise, and
 * `type === ""` is true of plenty of real files (`.md`, `.csv`, extensionless). Deciding
 * on the entry means the renderer never has to ask main "is this a folder?", so the
 * classification adds no IPC and no new surface.
 *
 * `pathFor` is the platform's `webUtils.getPathForFile` (absent outside Electron ⇒ no
 * hint, and the picker simply opens where it last was).
 */
export function readDrop(
  items: readonly DataTransferItem[],
  files: readonly File[],
  pathFor?: (file: File) => string | undefined,
): DropIntake {
  const out: DropIntake = { files: [], folders: [], ignored: 0 };

  // `items` and `files` are parallel for `kind === "file"` entries, but `items` also
  // carries strings (a dragged URL or selection) which have NO `files` counterpart —
  // so walk `items` and pull the matching File by its own index among file-kind items.
  let fileIndex = 0;
  for (const item of items) {
    if (item.kind !== "file") {
      out.ignored++;
      continue;
    }
    const file = files[fileIndex++];
    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      const name = entry.name || file?.name || "dossier";
      const hintPath = file && pathFor ? pathFor(file) : undefined;
      out.folders.push({ name, ...(hintPath ? { hintPath } : {}) });
      continue;
    }
    if (file) out.files.push(file);
    else out.ignored++;
  }

  // A platform that gives us no `items` (or a synthetic event) still gets the file route;
  // it just cannot tell a folder apart, which degrades to "attach", never to "grant".
  if (!items.length && files.length) out.files.push(...files);
  return out;
}

/** Does this drag carry anything we can act on? Drives the drop overlay, so it must judge
 *  on `types` alone — a `dragover` event exposes no file list, by design. */
export function dragCarriesFiles(types: readonly string[]): boolean {
  return types.includes("Files");
}

/** The card's sentence. Named here rather than in the component so the wording is
 *  testable and cannot drift from what the flow actually does. */
export function folderOfferText(folders: readonly DroppedFolder[]): string {
  if (folders.length === 1) {
    return `Donner à ${BRAND.name} l'accès au dossier « ${folders[0]!.name} » ?`;
  }
  return `Donner à ${BRAND.name} l'accès à ces ${folders.length} dossiers ?`;
}

/**
 * ⚠️ The sentence under the offer. It states the ONE thing the user must understand for
 * their click to be informed: the confirmation happens in the system dialog, not here.
 * If a future change makes the in-app click sufficient, this text becomes a lie AND the
 * grant invariant is broken — the two are deliberately tied together.
 */
export const FOLDER_OFFER_NOTE =
  "Une fenêtre du système s'ouvrira sur ce dossier pour que vous confirmiez. " +
  `${BRAND.name} ne peut pas s'accorder un dossier tout seul.`;

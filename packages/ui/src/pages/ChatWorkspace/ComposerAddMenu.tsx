import { useEffect, type KeyboardEvent, type ReactNode } from "react";
import { useT } from "../../i18n";
import { usePopover } from "../../hooks/usePopover";
import { FileIcon, FolderIcon, IconButton, PlugIcon, PlusIcon, SparklesIcon } from "../../components/brand";

/**
 * The composer's ONE door for adding something to the message — « + » opens a menu
 * of four entries: a file (the native picker), a folder (grant one to the Filesystem
 * connector), a connector (the catalogue), a compétence (the palette). It replaced two
 * neighbouring glyph buttons (📎 and ✨): four ways in behind one symbol read as one
 * idea, two beside each other read as unrelated tools.
 *
 * An entry exists only when its callback does — a platform with no file slot, no
 * folder capability or no shell simply shows fewer entries, never a dead one. Pure
 * presentation: every action is the caller's. Dismissal + open state come from
 * `usePopover`; the chrome reuses the compétence picker's family
 * (`styles/skills/composer.css`, `.composer-add-menu`).
 */
export function ComposerAddMenu({
  onFile,
  onFolder,
  onConnector,
  onSkill,
}: {
  onFile?: () => void;
  onFolder?: () => void;
  onConnector?: () => void;
  onSkill?: () => void;
}) {
  const t = useT();
  const { open, toggle, close, triggerRef, menuRef } = usePopover<HTMLDivElement, HTMLDivElement>();

  const entries: { key: string; icon: ReactNode; label: string; title: string; run: () => void }[] = [];
  if (onFile) entries.push({ key: "file", icon: <FileIcon size={14} />, label: t.composer.addFile, title: t.composer.attachFile, run: onFile });
  if (onFolder) entries.push({ key: "folder", icon: <FolderIcon size={14} />, label: t.composer.addFolder, title: t.composer.addFolderTip, run: onFolder });
  if (onConnector) entries.push({ key: "connector", icon: <PlugIcon size={14} />, label: t.composer.addConnector, title: t.composer.addConnectorTip, run: onConnector });
  if (onSkill) entries.push({ key: "skill", icon: <SparklesIcon size={14} />, label: t.composer.addSkill, title: t.composer.useSkill, run: onSkill });

  // The menu takes the focus on open (first entry), so the keyboard reaches it
  // without a Tab; arrows walk the entries, Home/End jump. Escape + outside click
  // are `usePopover`'s.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open, menuRef]);
  const onKeyDown = (e: KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (!items.length) return;
    const cur = items.indexOf(document.activeElement as HTMLElement);
    const to =
      e.key === "ArrowDown" ? (cur + 1) % items.length
      : e.key === "ArrowUp" ? (cur - 1 + items.length) % items.length
      : e.key === "Home" ? 0
      : e.key === "End" ? items.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    items[to]?.focus();
  };

  if (entries.length === 0) return null;
  return (
    <div className="composer-skill-wrap" ref={triggerRef}>
      <IconButton
        size="sm"
        label={t.composer.add}
        active={open}
        expanded={open}
        haspopup="menu"
        onClick={toggle}
      >
        <PlusIcon size={18} />
      </IconButton>
      {open && (
        <div className="composer-skill-menu composer-add-menu" role="menu" ref={menuRef} onKeyDown={onKeyDown}>
          {entries.map((en) => (
            <button
              key={en.key}
              type="button"
              role="menuitem"
              className="composer-skill-item"
              title={en.title}
              onClick={() => {
                close();
                en.run();
              }}
            >
              <span className="composer-skill-action-ico">{en.icon}</span>
              <span className="composer-skill-name">{en.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import {
  FileIcon,
  GridIcon,
  MicIcon,
  MessageIcon,
  BookIcon,
  SparklesIcon,
  MemoryIcon,
  LockIcon,
} from "../../../components/brand";
import type { SectionDestination } from "../../../help";
import type { LibFile } from "../../../pages/Library/libFile";

/** Section → row glyph. The SAME marks the rail wears, so a palette result and the nav
 *  item it leads to are recognisably the one place. */
export const SECTION_ROW_ICON: Record<
  Exclude<SectionDestination["id"], "guide">,
  typeof FileIcon
> = {
  chats: MessageIcon,
  library: BookIcon,
  competences: SparklesIcon,
  memory: MemoryIcon,
  vault: LockIcon,
};

/** Kind → row glyph, mirroring the Bibliothèque card (default = a plain file). */
export const FILE_ICON: Partial<Record<LibFile["kind"], typeof FileIcon>> = {
  sheet: GridIcon,
  audio: MicIcon,
};

/** Compact relative time for a conversation row. */
export function relTime(ts: number): string {
  const min = (Date.now() - ts) / 60000;
  if (min < 1) return "à l'instant";
  if (min < 60) return `${Math.round(min)} min`;
  const h = min / 60;
  if (h < 24) return `${Math.round(h)} h`;
  if (h < 48) return "Hier";
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

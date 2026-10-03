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

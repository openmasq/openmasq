import type { FileMeta } from "../../host";
import type { LibKind } from "./libraryKinds";

/** A stored file joined to the conversation it came from + its library category. */
export interface LibFile extends FileMeta {
  conversationId: string;
  conversationTitle: string;
  kind: LibKind;
}

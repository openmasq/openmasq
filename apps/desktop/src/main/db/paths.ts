import { app } from "electron";
import { join } from "node:path";

/** Where attached-file bytes live on disk (the DB only stores their paths). */
export function filesDir(): string {
  return join(app.getPath("userData"), "files");
}

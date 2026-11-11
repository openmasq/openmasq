import { app } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { secretFile } from "../store/secretFile";
import type { PostureKeyStore } from "./postureSeal";

const NAME = "posture-key";

/** Where the posture key lives: ONE sealed file of the secrets family (`store/secretFile.ts`,
 *  the keychain when there is one, its documented fallback otherwise), device-scoped like
 *  the confirmation mode it authenticates. Split from `postureSeal.ts` so the seal's logic
 *  loads without Electron. */
export function postureKeyStore(): PostureKeyStore {
  const file = secretFile(NAME, "posture key");
  return {
    read: () => file.get(),
    write: (text) => file.set(text),
    exists: () => existsSync(join(app.getPath("userData"), `${NAME}.enc`)),
  };
}

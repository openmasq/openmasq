// Everything the proxy persists lives in ONE directory: the key (0600), the credential store,
// the servers file, the request log, the console's address. One home for the path, so a new
// file lands beside the others — in a 0700 directory, never wherever a caller happened to be.
import { homedir } from "node:os";
import { join } from "node:path";

export const openmasqDir = (): string => join(homedir(), ".openmasq");

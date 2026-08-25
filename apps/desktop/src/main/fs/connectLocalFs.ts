import type { McpConnection } from "@openmasq/mcp";
import { fsMcpDenyPaths } from "../security/ambientSecrets";
import { LocalFsConnection } from "./connection";
import { setLiveFs } from "./live";

/**
 * Bring the in-process filesystem connector up. It lives HERE rather than inside the MCP
 * connect dispatcher because everything it decides belongs to this family (rule 10): the
 * deny set, the worker, the live handle the folder browser reads.
 *
 * The "filesystem" catalog entry runs IN-PROCESS (utilityProcess worker + grant gate), NOT
 * as a spawned MCP server — so it needs no ELECTRON_RUN_AS_NODE, keeps the ops in a
 * separate process (bug isolation from the vault/keys/IPC), and we own the code and the
 * grant logic. `roots` are the path grants main already re-validated (absolute, existing
 * directories); the renderer can never supply one.
 *
 * The deny set is the fs tool's ONLY backstop, and it is load-bearing: this gate is
 * default-ALLOW inside a granted subtree, so a user who grants a broad root (the picker
 * invites `~`) would otherwise let a model `read_file("~/.ssh/id_rsa")`. It denies the
 * app's whole userData — where every secret lives, and where a NEW secret file is covered
 * automatically — plus the user's ambient credential stores (`~/.ssh`, `~/.aws`, keychains,
 * browser cookie DBs, shell histories). Single-sourced with the Python jail in
 * `../security/ambientSecrets.ts`; `security/ambientSecrets.test.ts` pins the containment.
 */
export function connectLocalFs(id: string, roots: string[]): McpConnection {
  const conn = new LocalFsConnection(id, roots, fsMcpDenyPaths());
  // Published to the fs family too, so the Bibliothèque's folder browser reaches the SAME
  // worker and the SAME grant as the model's tools — never a second set of roots.
  setLiveFs(conn);
  return conn;
}

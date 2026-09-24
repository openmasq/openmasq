/**
 * At-rest crypto for the broker's token file — ONE home, in `@openmasq/mcp/node`, shared
 * with the proxy's MCP connector store (root rule 9: the same forty lines twice was the bug).
 *
 * What it protects against is unchanged and worth restating: casual reads, cloud backups and
 * file sync — NOT an attacker who already has the user's account, since the key lives on the
 * same machine, as is unavoidable for an autonomous local broker. Provide
 * `BROKER_ENCRYPTION_KEY` (e.g. from the OS keychain) to separate key from data.
 */
export { decrypt, encrypt, loadKey } from "@openmasq/mcp/node";

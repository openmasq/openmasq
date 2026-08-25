import type { Connector } from "../types";
import { READ_TOOLS } from "./read";
import { WRITE_TOOLS } from "./write";

/**
 * GitHub connector — a broad REST tool set (api.github.com) run desktop-direct with
 * the user's token from the OAuth device flow (no secret, no CASA). READ tools
 * (repos/issues/PRs/commits/files/search/user) + WRITE tools (create/comment/update
 * issue) — the latter go through the desktop write-confirmation gate. Tool output
 * flows through the renderer's redaction like any connector.
 */
export const githubConnector: Connector = {
  id: "github",
  name: "GitHub",
  auth: "device",
  // GitHub has no CASA/security-assessment, so both modes get the full scopes.
  // `repo` covers private repos + the write tools; `read:user` powers `get_me`.
  scopes: { managed: ["repo", "read:user"], byo: ["repo", "read:user"] },
  tools: [...READ_TOOLS, ...WRITE_TOOLS],
};

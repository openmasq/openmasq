import type { ConnectorTool } from "../types";
import { API, REPO_PROPS, ownerRepo, err, ok, str, num, enc } from "./read";

/** WRITE (mutating) GitHub tools — each is gated by the desktop write-confirmation
 *  dialog before it runs (their names carry create/comment/update/issue verbs). */

const createIssue: ConnectorTool = {
  name: "create_issue",
  description: "Create a new issue in a repository (title required; optional body + labels).",
  inputSchema: {
    type: "object",
    required: ["owner", "repo", "title"],
    properties: {
      ...REPO_PROPS,
      title: { type: "string", description: "Issue title." },
      body: { type: "string", description: "Issue body (Markdown)." },
      labels: { type: "array", items: { type: "string" }, description: "Label names." },
    },
  },
  async run(a, ctx) {
    const r = ownerRepo(a);
    const title = str(a, "title");
    if (!r || !title) return err("`owner`, `repo` et `title` sont requis.");
    const labels = Array.isArray(a.labels) ? a.labels.filter((x): x is string => typeof x === "string") : undefined;
    const i = await ctx.fetchJson<{ number: number; html_url: string }>(
      `${API}/repos/${enc(r.owner)}/${enc(r.repo)}/issues`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: str(a, "body") || undefined, labels }),
      },
    );
    return ok(`Issue #${i.number} créée — ${i.html_url}`);
  },
};

const commentIssue: ConnectorTool = {
  name: "comment_issue",
  description: "Add a comment to an issue or pull request (by its number) in a repository.",
  inputSchema: {
    type: "object",
    required: ["owner", "repo", "number", "body"],
    properties: {
      ...REPO_PROPS,
      number: { type: "integer", description: "Issue or pull-request number." },
      body: { type: "string", description: "Comment body (Markdown)." },
    },
  },
  async run(a, ctx) {
    const r = ownerRepo(a);
    const n = num(a, "number");
    const body = str(a, "body");
    if (!r || n == null || !body) return err("`owner`, `repo`, `number` et `body` sont requis.");
    const c = await ctx.fetchJson<{ html_url: string }>(
      `${API}/repos/${enc(r.owner)}/${enc(r.repo)}/issues/${n}/comments`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) },
    );
    return ok(`Commentaire ajouté — ${c.html_url}`);
  },
};

const updateIssue: ConnectorTool = {
  name: "update_issue",
  description: "Update an existing issue: change its title, body, and/or state (open | closed).",
  inputSchema: {
    type: "object",
    required: ["owner", "repo", "number"],
    properties: {
      ...REPO_PROPS,
      number: { type: "integer", description: "Issue number." },
      title: { type: "string", description: "New title." },
      body: { type: "string", description: "New body (Markdown)." },
      state: { type: "string", enum: ["open", "closed"], description: "New state." },
    },
  },
  async run(a, ctx) {
    const r = ownerRepo(a);
    const n = num(a, "number");
    if (!r || n == null) return err("`owner`, `repo` et `number` sont requis.");
    const patch: Record<string, string> = {};
    if (str(a, "title")) patch.title = str(a, "title");
    if (str(a, "body")) patch.body = str(a, "body");
    if (["open", "closed"].includes(str(a, "state"))) patch.state = str(a, "state");
    if (Object.keys(patch).length === 0) return err("Rien à modifier (title/body/state).");
    const i = await ctx.fetchJson<{ number: number; state: string; html_url: string }>(
      `${API}/repos/${enc(r.owner)}/${enc(r.repo)}/issues/${n}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
    );
    return ok(`Issue #${i.number} mise à jour [${i.state}] — ${i.html_url}`);
  },
};

export const WRITE_TOOLS: ConnectorTool[] = [createIssue, commentIssue, updateIssue];

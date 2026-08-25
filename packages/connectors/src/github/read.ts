import type { ConnectorTool, ConnectorToolResult } from "../types";

/** Shared helpers + the READ tools of the GitHub connector (api.github.com, user
 *  token via the device flow). Kept small; write tools live in `./write`. */
export const API = "https://api.github.com";

export const LIMIT_PROP = {
  limit: { type: "integer", minimum: 1, maximum: 50, description: "How many rows (default 20)." },
} as const;
export function clampLimit(a: Record<string, unknown>, def = 20): number {
  const n = typeof a.limit === "number" ? Math.floor(a.limit) : def;
  return Math.max(1, Math.min(50, n || def));
}
export const REPO_PROPS = {
  owner: { type: "string", description: "Repository owner (user or organisation login)." },
  repo: { type: "string", description: "Repository name (without the owner)." },
} as const;
export function ownerRepo(a: Record<string, unknown>): { owner: string; repo: string } | null {
  const owner = typeof a.owner === "string" ? a.owner.trim() : "";
  const repo = typeof a.repo === "string" ? a.repo.trim() : "";
  return owner && repo ? { owner, repo } : null;
}
export function err(text: string): ConnectorToolResult {
  return { content: [{ type: "text", text }], isError: true };
}
export function ok(text: string): ConnectorToolResult {
  return { content: [{ type: "text", text: text || "Aucun résultat." }] };
}
export const str = (a: Record<string, unknown>, k: string): string =>
  typeof a[k] === "string" ? (a[k] as string).trim() : "";
export const num = (a: Record<string, unknown>, k: string): number | null =>
  typeof a[k] === "number" ? Math.floor(a[k] as number) : null;
export const enc = encodeURIComponent;
export const NEED_REPO = "`owner` et `repo` sont requis.";

const getMe: ConnectorTool = {
  name: "get_me",
  description: "Get the authenticated GitHub user's profile (login, name, bio, counts).",
  inputSchema: { type: "object", properties: {} },
  async run(_a, ctx) {
    const u = await ctx.fetchJson<{ login: string; name?: string; bio?: string; public_repos?: number; followers?: number }>(
      `${API}/user`,
    );
    return ok(
      `${u.login}${u.name ? ` (${u.name})` : ""}\n${u.bio ?? ""}\n` +
        `repos publics : ${u.public_repos ?? 0} · followers : ${u.followers ?? 0}`,
    );
  },
};

const listRepos: ConnectorTool = {
  name: "list_repos",
  description: "List the authenticated user's repositories, most recently updated first.",
  inputSchema: { type: "object", properties: { ...LIMIT_PROP } },
  async run(a, ctx) {
    const repos = await ctx.fetchJson<{ full_name: string; description?: string }[]>(
      `${API}/user/repos?sort=updated&per_page=${clampLimit(a)}`,
    );
    return ok(repos.map((r) => `${r.full_name}${r.description ? ` — ${r.description}` : ""}`).join("\n"));
  },
};

const searchRepos: ConnectorTool = {
  name: "search_repos",
  description: "Search public repositories with a GitHub search query (e.g. 'language:ts stars:>100').",
  inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, ...LIMIT_PROP } },
  async run(a, ctx) {
    const q = str(a, "query");
    if (!q) return err("`query` est requis.");
    const r = await ctx.fetchJson<{ items: { full_name: string; stargazers_count: number; description?: string }[] }>(
      `${API}/search/repositories?q=${enc(q)}&sort=stars&per_page=${clampLimit(a)}`,
    );
    return ok(r.items.map((i) => `★${i.stargazers_count} ${i.full_name}${i.description ? ` — ${i.description}` : ""}`).join("\n"));
  },
};

const getRepo: ConnectorTool = {
  name: "get_repo",
  description: "Get one repository's details (description, language, stars, default branch, open issues).",
  inputSchema: { type: "object", required: ["owner", "repo"], properties: { ...REPO_PROPS } },
  async run(a, ctx) {
    const r = ownerRepo(a);
    if (!r) return err(NEED_REPO);
    const d = await ctx.fetchJson<{
      full_name: string; description?: string; language?: string; stargazers_count: number;
      forks_count: number; open_issues_count: number; default_branch: string; html_url: string;
    }>(`${API}/repos/${enc(r.owner)}/${enc(r.repo)}`);
    return ok(
      `${d.full_name} — ${d.description ?? "(sans description)"}\n` +
        `langage : ${d.language ?? "—"} · ★${d.stargazers_count} · forks ${d.forks_count} · ` +
        `issues ouvertes ${d.open_issues_count} · branche : ${d.default_branch}\n${d.html_url}`,
    );
  },
};

const listBranches: ConnectorTool = {
  name: "list_branches",
  description: "List a repository's branches.",
  inputSchema: { type: "object", required: ["owner", "repo"], properties: { ...REPO_PROPS, ...LIMIT_PROP } },
  async run(a, ctx) {
    const r = ownerRepo(a);
    if (!r) return err(NEED_REPO);
    const b = await ctx.fetchJson<{ name: string }[]>(
      `${API}/repos/${enc(r.owner)}/${enc(r.repo)}/branches?per_page=${clampLimit(a)}`,
    );
    return ok(b.map((x) => x.name).join("\n"));
  },
};

const listCommits: ConnectorTool = {
  name: "list_commits",
  description: "List recent commits on a repository (optionally a branch/tag via `ref` or a `path`).",
  inputSchema: {
    type: "object",
    required: ["owner", "repo"],
    properties: {
      ...REPO_PROPS,
      ref: { type: "string", description: "Branch/tag/SHA (default: the repo's default branch)." },
      path: { type: "string", description: "Only commits touching this file/dir." },
      ...LIMIT_PROP,
    },
  },
  async run(a, ctx) {
    const r = ownerRepo(a);
    if (!r) return err(NEED_REPO);
    const qs = new URLSearchParams({ per_page: String(clampLimit(a)) });
    if (str(a, "ref")) qs.set("sha", str(a, "ref"));
    if (str(a, "path")) qs.set("path", str(a, "path"));
    const c = await ctx.fetchJson<{ sha: string; commit: { message: string; author?: { name?: string; date?: string } } }[]>(
      `${API}/repos/${enc(r.owner)}/${enc(r.repo)}/commits?${qs.toString()}`,
    );
    return ok(
      c
        .map((x) => `${x.sha.slice(0, 7)} — ${x.commit.message.split("\n")[0]} (${x.commit.author?.name ?? "?"}, ${x.commit.author?.date?.slice(0, 10) ?? "?"})`)
        .join("\n"),
    );
  },
};

const getFile: ConnectorTool = {
  name: "get_file",
  description: "Read a file's contents (or list a directory) at `path` in a repository, on an optional `ref`.",
  inputSchema: {
    type: "object",
    required: ["owner", "repo", "path"],
    properties: {
      ...REPO_PROPS,
      path: { type: "string", description: "File or directory path within the repo." },
      ref: { type: "string", description: "Branch/tag/SHA (default: the default branch)." },
    },
  },
  async run(a, ctx) {
    const r = ownerRepo(a);
    const path = str(a, "path");
    if (!r || !path) return err("`owner`, `repo` et `path` sont requis.");
    const ref = str(a, "ref");
    const raw = await ctx.fetchJson<
      { type: string; name: string }[] | { content?: string; encoding?: string; size?: number; name: string }
    >(`${API}/repos/${enc(r.owner)}/${enc(r.repo)}/contents/${path.split("/").map(enc).join("/")}${ref ? `?ref=${enc(ref)}` : ""}`);
    if (Array.isArray(raw)) return ok(raw.map((e) => `${e.type === "dir" ? "📁" : "📄"} ${e.name}`).join("\n"));
    if (raw.encoding !== "base64" || !raw.content) return err("Fichier binaire ou non lisible en texte.");
    const bytes = Uint8Array.from(atob(raw.content.replace(/\s/g, "")), (ch) => ch.charCodeAt(0));
    const text = new TextDecoder().decode(bytes).slice(0, 30000);
    return ok(`# ${raw.name}\n\n${text}`);
  },
};

const listIssues: ConnectorTool = {
  name: "list_issues",
  description: "List open issues ASSIGNED to the authenticated user (across all repos).",
  inputSchema: { type: "object", properties: { ...LIMIT_PROP } },
  async run(a, ctx) {
    const issues = await ctx.fetchJson<{ title: string; html_url: string }[]>(
      `${API}/issues?filter=assigned&state=open&per_page=${clampLimit(a)}`,
    );
    return ok(issues.map((i) => `${i.title} — ${i.html_url}`).join("\n") || "Aucune issue ouverte.");
  },
};

const listRepoIssues: ConnectorTool = {
  name: "list_repo_issues",
  description: "List issues in a specific repository (`state`: open | closed | all, default open).",
  inputSchema: {
    type: "object",
    required: ["owner", "repo"],
    properties: {
      ...REPO_PROPS,
      state: { type: "string", enum: ["open", "closed", "all"], description: "Default open." },
      ...LIMIT_PROP,
    },
  },
  async run(a, ctx) {
    const r = ownerRepo(a);
    if (!r) return err(NEED_REPO);
    const state = ["open", "closed", "all"].includes(str(a, "state")) ? str(a, "state") : "open";
    const list = await ctx.fetchJson<{ number: number; title: string; state: string; pull_request?: unknown }[]>(
      `${API}/repos/${enc(r.owner)}/${enc(r.repo)}/issues?state=${state}&per_page=${clampLimit(a)}`,
    );
    // The issues endpoint also returns PRs — drop them (they have `pull_request`).
    return ok(list.filter((i) => !i.pull_request).map((i) => `#${i.number} [${i.state}] ${i.title}`).join("\n"));
  },
};

const getIssue: ConnectorTool = {
  name: "get_issue",
  description: "Get one issue (title, state, author, body) by its number in a repository.",
  inputSchema: {
    type: "object",
    required: ["owner", "repo", "number"],
    properties: { ...REPO_PROPS, number: { type: "integer", description: "Issue number." } },
  },
  async run(a, ctx) {
    const r = ownerRepo(a);
    const n = num(a, "number");
    if (!r || n == null) return err("`owner`, `repo` et `number` sont requis.");
    const i = await ctx.fetchJson<{ title: string; state: string; user?: { login: string }; body?: string; html_url: string }>(
      `${API}/repos/${enc(r.owner)}/${enc(r.repo)}/issues/${n}`,
    );
    return ok(`#${n} [${i.state}] ${i.title} — @${i.user?.login ?? "?"}\n${i.html_url}\n\n${i.body ?? "(sans description)"}`);
  },
};

const searchIssues: ConnectorTool = {
  name: "search_issues",
  description: "Search issues and pull requests across GitHub with a query (e.g. 'repo:owner/name is:open label:bug').",
  inputSchema: { type: "object", required: ["query"], properties: { query: { type: "string" }, ...LIMIT_PROP } },
  async run(a, ctx) {
    const q = str(a, "query");
    if (!q) return err("`query` est requis.");
    const r = await ctx.fetchJson<{ items: { title: string; html_url: string; state: string }[] }>(
      `${API}/search/issues?q=${enc(q)}&per_page=${clampLimit(a)}`,
    );
    return ok(r.items.map((i) => `[${i.state}] ${i.title} — ${i.html_url}`).join("\n"));
  },
};

const listPullRequests: ConnectorTool = {
  name: "list_pull_requests",
  description: "List a repository's pull requests (`state`: open | closed | all, default open).",
  inputSchema: {
    type: "object",
    required: ["owner", "repo"],
    properties: {
      ...REPO_PROPS,
      state: { type: "string", enum: ["open", "closed", "all"], description: "Default open." },
      ...LIMIT_PROP,
    },
  },
  async run(a, ctx) {
    const r = ownerRepo(a);
    if (!r) return err(NEED_REPO);
    const state = ["open", "closed", "all"].includes(str(a, "state")) ? str(a, "state") : "open";
    const prs = await ctx.fetchJson<{ number: number; title: string; state: string; user?: { login: string } }[]>(
      `${API}/repos/${enc(r.owner)}/${enc(r.repo)}/pulls?state=${state}&per_page=${clampLimit(a)}`,
    );
    return ok(prs.map((p) => `#${p.number} [${p.state}] ${p.title} — @${p.user?.login ?? "?"}`).join("\n"));
  },
};

const getPullRequest: ConnectorTool = {
  name: "get_pull_request",
  description: "Get one pull request (title, state, branches, mergeable, body) by its number.",
  inputSchema: {
    type: "object",
    required: ["owner", "repo", "number"],
    properties: { ...REPO_PROPS, number: { type: "integer", description: "Pull request number." } },
  },
  async run(a, ctx) {
    const r = ownerRepo(a);
    const n = num(a, "number");
    if (!r || n == null) return err("`owner`, `repo` et `number` sont requis.");
    const p = await ctx.fetchJson<{
      title: string; state: string; body?: string; html_url: string; merged?: boolean;
      head?: { ref: string }; base?: { ref: string };
    }>(`${API}/repos/${enc(r.owner)}/${enc(r.repo)}/pulls/${n}`);
    return ok(
      `#${n} [${p.merged ? "merged" : p.state}] ${p.title}\n${p.head?.ref ?? "?"} → ${p.base?.ref ?? "?"}\n` +
        `${p.html_url}\n\n${p.body ?? "(sans description)"}`,
    );
  },
};

export const READ_TOOLS: ConnectorTool[] = [
  getMe, listRepos, searchRepos, getRepo, listBranches, listCommits, getFile,
  listIssues, listRepoIssues, getIssue, searchIssues, listPullRequests, getPullRequest,
];

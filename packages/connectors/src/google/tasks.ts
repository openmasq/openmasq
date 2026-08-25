import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import { googleApiErrorHint } from "./googleApiError";

/**
 * Google Tasks connector (Tasks API v1). Lists open tasks, creates tasks, and marks
 * a task complete on the user's default list — with the user's token obtained
 * desktop-direct via OAuth loopback + PKCE (no broker/server). The `tasks` scope is
 * sensitive (brand verification in prod) but NOT restricted, so there's NO CASA.
 */
const API = "https://tasks.googleapis.com/tasks/v1";
const LIST = `${API}/lists/@default/tasks`;

interface GTask {
  id?: string;
  title?: string;
  notes?: string;
  due?: string;
  status?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function clampLimit(v: unknown, def: number, max: number): number {
  const n = typeof v === "number" ? Math.floor(v) : def;
  return Math.max(1, Math.min(max, n));
}

const listTasks: ConnectorTool = {
  name: "list_tasks",
  description: "Lister les tâches ouvertes (non terminées) de la liste par défaut Google Tasks.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Nombre de tâches (défaut 20, max 100)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const limit = clampLimit(args.limit, 20, 100);
    const res = await ctx.fetchJson<{ items?: GTask[] }>(
      `${LIST}?showCompleted=false&maxResults=${limit}`,
    );
    const rows = (res.items ?? []).map(
      (t) => `${t.title ?? "(sans titre)"}${t.due ? ` — échéance ${t.due.slice(0, 10)}` : ""} · id:${t.id}`,
    );
    return { content: [{ type: "text", text: rows.join("\n") || "Aucune tâche ouverte." }] };
  },
};

const createTask: ConnectorTool = {
  name: "create_task",
  description: "Créer une tâche dans la liste par défaut Google Tasks. `due` est une date RFC3339.",
  inputSchema: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string", description: "Intitulé de la tâche." },
      notes: { type: "string", description: "Détails optionnels." },
      due: { type: "string", description: "Échéance optionnelle (RFC3339, ex. 2026-07-15T00:00:00.000Z)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const title = str(args.title);
    if (!title) return { content: [{ type: "text", text: "title requis." }], isError: true };
    const body: Record<string, string> = { title };
    const notes = str(args.notes);
    const due = str(args.due);
    if (notes) body.notes = notes;
    if (due) body.due = due;
    const task = await ctx.fetchJson<GTask>(LIST, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { content: [{ type: "text", text: `Tâche créée : ${task.title ?? title} (id:${task.id})` }] };
  },
};

const completeTask: ConnectorTool = {
  name: "complete_task",
  description: "Marquer une tâche comme terminée (par son id, voir list_tasks).",
  inputSchema: {
    type: "object",
    required: ["taskId"],
    properties: { taskId: { type: "string", description: "L'id de la tâche." } },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const taskId = str(args.taskId);
    if (!taskId) return { content: [{ type: "text", text: "taskId requis." }], isError: true };
    await ctx.fetchJson(`${LIST}/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });
    return { content: [{ type: "text", text: "Tâche marquée comme terminée." }] };
  },
};

export const googleTasksConnector: Connector = {
  id: "google-tasks",
  name: "Google Tasks",
  auth: "pkce",
  // `tasks` is sensitive (brand verification) but NOT restricted → no CASA.
  scopes: {
    managed: ["https://www.googleapis.com/auth/tasks"],
    byo: ["https://www.googleapis.com/auth/tasks"],
  },
  tools: [listTasks, createTask, completeTask],
  // Applied by the adapter to EVERY call (`run.ts`), so a tool added later
  // cannot forget it — the reason this lives on the connector, not per tool.
  errorHint: (err) =>
    googleApiErrorHint(err, {
      api: "API Google Tasks",
      connector: "Google Tasks",
      scope: "l'accès à vos TÂCHES",
      fallback: "Accès Google Tasks impossible",
    }),
};

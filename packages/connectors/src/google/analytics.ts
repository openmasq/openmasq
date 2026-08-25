import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import { googleApiErrorHint } from "./googleApiError";

/**
 * Google Analytics (GA4) connector — the Admin API (list accessible properties) +
 * the Data API (run a report). Read-only, with the user's token obtained
 * desktop-direct via OAuth loopback + PKCE (no broker/server). The
 * `analytics.readonly` scope is sensitive (brand verification in prod) but NOT
 * restricted, so there's NO CASA — usable in 1-clic.
 */
const ADMIN = "https://analyticsadmin.googleapis.com/v1beta";
const DATA = "https://analyticsdata.googleapis.com/v1beta";

interface AccountSummary {
  displayName?: string;
  propertySummaries?: { property?: string; displayName?: string }[];
}
interface ReportRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
interface ReportResponse {
  dimensionHeaders?: { name?: string }[];
  metricHeaders?: { name?: string }[];
  rows?: ReportRow[];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function strList(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  const s = str(v);
  return s ? s.split(",").map((x) => x.trim()).filter(Boolean) : [];
}

const listProperties: ConnectorTool = {
  name: "list_properties",
  description:
    "Lister les propriétés Google Analytics (GA4) accessibles. Renvoie le nom et l'id de chaque propriété.",
  inputSchema: { type: "object", properties: {} },
  async run(_args, ctx: ConnectorToolCtx) {
    const res = await ctx.fetchJson<{ accountSummaries?: AccountSummary[] }>(
      `${ADMIN}/accountSummaries`,
    );
    const rows: string[] = [];
    for (const acc of res.accountSummaries ?? []) {
      for (const p of acc.propertySummaries ?? []) {
        const id = p.property?.replace(/^properties\//, "");
        rows.push(`${p.displayName ?? "(sans nom)"} — ${acc.displayName ?? ""} · propertyId:${id}`);
      }
    }
    return { content: [{ type: "text", text: rows.join("\n") || "Aucune propriété accessible." }] };
  },
};

const runReport: ConnectorTool = {
  // ⚠️ `get_`, PAS `run_` : la boucle agentique classe sur le VERBE DE TÊTE du nom, et
  // `run` y désigne une exécution — un rapport GA4 partait donc en ÉCRITURE (carte de
  // confirmation à chaque rapport) et n'était jamais préchargé en parallèle. C'est une
  // lecture ; le nom doit le dire. Épinglé par `toolNames.test.ts`.
  name: "get_report",
  description:
    "Exécuter un rapport GA4 sur une propriété. `metrics`/`dimensions` sont des noms d'API GA4 (ex. metric « activeUsers », dimension « date »).",
  inputSchema: {
    type: "object",
    required: ["propertyId", "metrics"],
    properties: {
      propertyId: { type: "string", description: "L'id numérique de la propriété (voir list_properties)." },
      metrics: {
        type: "array",
        items: { type: "string" },
        description: "Les métriques GA4 (ex. activeUsers, sessions, screenPageViews).",
      },
      dimensions: {
        type: "array",
        items: { type: "string" },
        description: "Les dimensions optionnelles (ex. date, country, pagePath).",
      },
      startDate: { type: "string", description: "Date de début (YYYY-MM-DD ou « 7daysAgo », défaut 28daysAgo)." },
      endDate: { type: "string", description: "Date de fin (YYYY-MM-DD ou « today », défaut today)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const propertyId = str(args.propertyId)?.replace(/^properties\//, "");
    const metrics = strList(args.metrics);
    if (!propertyId || metrics.length === 0) {
      return { content: [{ type: "text", text: "propertyId et metrics sont requis." }], isError: true };
    }
    const dimensions = strList(args.dimensions);
    const body = {
      dateRanges: [{ startDate: str(args.startDate) ?? "28daysAgo", endDate: str(args.endDate) ?? "today" }],
      metrics: metrics.map((name) => ({ name })),
      ...(dimensions.length ? { dimensions: dimensions.map((name) => ({ name })) } : {}),
    };
    const res = await ctx.fetchJson<ReportResponse>(`${DATA}/properties/${propertyId}:runReport`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const header = [
      ...(res.dimensionHeaders ?? []).map((h) => h.name ?? ""),
      ...(res.metricHeaders ?? []).map((h) => h.name ?? ""),
    ].join("\t");
    const rows = (res.rows ?? []).map((r) =>
      [
        ...(r.dimensionValues ?? []).map((v) => v.value ?? ""),
        ...(r.metricValues ?? []).map((v) => v.value ?? ""),
      ].join("\t"),
    );
    const text = [header, ...rows].join("\n");
    return { content: [{ type: "text", text: rows.length ? text : "Aucune donnée pour cette période." }] };
  },
};

export const googleAnalyticsConnector: Connector = {
  id: "google-analytics",
  name: "Google Analytics",
  auth: "pkce",
  // `analytics.readonly` is sensitive (brand verification) but NOT restricted → no CASA.
  scopes: {
    managed: ["https://www.googleapis.com/auth/analytics.readonly"],
    byo: ["https://www.googleapis.com/auth/analytics.readonly"],
  },
  tools: [listProperties, runReport],
  // Applied by the adapter to EVERY call (`run.ts`), so a tool added later
  // cannot forget it — the reason this lives on the connector, not per tool.
  errorHint: (err) =>
    googleApiErrorHint(err, {
      api: "API Google Analytics Data",
      connector: "Google Analytics",
      scope: "l'accès à vos STATISTIQUES",
      fallback: "Lecture Google Analytics impossible",
    }),
};

import type { Connector, ConnectorTool, ConnectorToolCtx } from "../types";
import { googleApiErrorHint } from "./googleApiError";
import { stringList } from "../args";

/**
 * Google Calendar connector (Calendar API v3). Reads upcoming events and creates
 * events on the user's PRIMARY calendar with their token — obtained desktop-direct
 * via OAuth loopback + PKCE (no broker/server). Scopes are "sensitive" (brand
 * verification in prod) but NOT restricted, so there's NO CASA security assessment.
 */
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface GEvent {
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string; responseStatus?: string }[];
  htmlLink?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** A bare `YYYY-MM-DD` means the user's LOCAL day, not UTC midnight — `new Date("…")`
 *  parses it as UTC and would shift the window by the offset (a 01:00 Paris meeting
 *  falls out of "today"). Anything else is handed to `Date` as-is (RFC3339). */
function atLocal(value: string, endOfDay: boolean): Date | undefined {
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const d = ymd
    ? new Date(+ymd[1], +ymd[2] - 1, +ymd[3], ...(endOfDay ? ([23, 59, 59, 999] as const) : ([0, 0, 0, 0] as const)))
    : new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * The window to ask Google for. Without one the tool could only ever answer "what is
 * coming up from now", so « prépare ma journée du 3 août » was unanswerable — the model
 * had no argument in which to put the date, asked the user for one anyway, and could
 * not have used the answer.
 *
 * `from` alone therefore means that WHOLE day: it is the shape the question actually
 * takes. An unparseable value falls back to the old behaviour (from now, unbounded)
 * rather than refusing — a bad date must not cost the user their agenda.
 */
function windowFor(from?: string, to?: string): { timeMin: string; timeMax?: string } {
  const start = from ? atLocal(from, false) : undefined;
  const end = to ? atLocal(to, true) : from && !to ? atLocal(from, true) : undefined;
  return {
    timeMin: (start ?? new Date()).toISOString(),
    ...(end ? { timeMax: end.toISOString() } : {}),
  };
}

const HHMM = (iso: string): string => iso.slice(11, 16);
const DAY = (iso: string): string => iso.slice(0, 10);
const MAX_DESC = 400;

/** One event as a line the model can reason about: when, how long, where, with whom —
 *  the four the "prepare my day" question is made of. Only `start — title` used to come
 *  back, so overlaps and travel time were not computable from it at all. */
function row(e: GEvent): string {
  const s = e.start?.dateTime;
  const en = e.end?.dateTime;
  const head = s
    ? `${DAY(s)} ${HHMM(s)}${en ? `–${HHMM(en)}` : ""}`
    : `${e.start?.date ?? "?"} (journée entière)`;
  const parts = [`${head} — ${e.summary ?? "(sans titre)"}`];
  if (e.location) parts.push(`lieu : ${e.location}`);
  const people = (e.attendees ?? [])
    .map((a) => a.displayName || a.email)
    .filter((x): x is string => !!x);
  if (people.length) parts.push(`participants : ${people.join(", ")}`);
  const desc = e.description?.replace(/\s+/g, " ").trim();
  if (desc) parts.push(`notes : ${desc.slice(0, MAX_DESC)}${desc.length > MAX_DESC ? "…" : ""}`);
  return parts.join(" · ");
}

const listEvents: ConnectorTool = {
  name: "list_events",
  description:
    "Lister les événements de l'agenda Google principal, du plus proche au plus lointain, avec " +
    "l'heure de début ET de fin, le lieu, les participants et les notes. Pour UNE journée précise, " +
    "passer `from` à cette date (AAAA-MM-JJ) : la journée entière est couverte.",
  inputSchema: {
    type: "object",
    properties: {
      from: {
        type: "string",
        description:
          "Début de la fenêtre : une date « AAAA-MM-JJ » (la journée entière est prise) ou un " +
          "date-heure RFC3339. Par défaut : maintenant.",
      },
      to: {
        type: "string",
        description:
          "Fin de la fenêtre, même format ; une date inclut la journée entière. Par défaut : " +
          "la fin de la journée de `from`, ou sans limite si `from` est absent.",
      },
      limit: { type: "integer", minimum: 1, maximum: 50, description: "Nombre d'événements (défaut 25)." },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const n = typeof args.limit === "number" ? Math.max(1, Math.min(50, Math.floor(args.limit))) : 25;
    const q = new URLSearchParams({
      ...windowFor(str(args.from), str(args.to)),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(n),
    });
    const res = await ctx.fetchJson<{ items?: GEvent[] }>(`${API}?${q.toString()}`);
    const rows = (res.items ?? []).map(row);
    return {
      content: [{ type: "text", text: rows.join("\n") || "Aucun événement sur cette période." }],
    };
  },
};

const createEvent: ConnectorTool = {
  name: "create_event",
  description:
    "Create an event on the user's primary Google Calendar. `start`/`end` are RFC3339 date-times (e.g. 2026-07-10T15:00:00+02:00).",
  inputSchema: {
    type: "object",
    required: ["summary", "start", "end"],
    properties: {
      summary: { type: "string", description: "Event title." },
      start: { type: "string", description: "Start date-time (RFC3339)." },
      end: { type: "string", description: "End date-time (RFC3339)." },
      description: { type: "string", description: "Optional details." },
      attendees: {
        type: "string",
        description:
          "Adresses e-mail des participants (facultatif). Plusieurs : séparez-les par des virgules. Uniquement des ADRESSES — un nom de personne ou d'équipe n'en est pas une.",
      },
    },
  },
  async run(args, ctx: ConnectorToolCtx) {
    const summary = str(args.summary);
    const start = str(args.start);
    const end = str(args.end);
    if (!summary || !start || !end) {
      return { content: [{ type: "text", text: "summary, start et end sont requis." }], isError: true };
    }
    // ⚠️ Two SILENT failures fixed here, both from the 27/07/2026 journal:
    //  1. the model sent `"[\"Équipe produit\"]"` — a JSON array encoded as a
    //     STRING. `Array.isArray` returned `false` and the field was dropped without a
    //     word; `stringList` accepts all three forms (same rule as Gmail's `to`/`cc`/`bcc`);
    //  2. "Équipe produit" is not an address. Google rejects the WHOLE event
    //     over it, so non-address entries are discarded — and STATED, otherwise we
    //     fall back to the silent amputation we just fixed.
    const asked = stringList(args.attendees);
    const emails = asked.filter((a) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
    const dropped = asked.filter((a) => !emails.includes(a));
    const body = {
      summary,
      description: str(args.description),
      start: { dateTime: start },
      end: { dateTime: end },
      ...(emails.length ? { attendees: emails.map((email) => ({ email })) } : {}),
    };
    const ev = await ctx.fetchJson<GEvent>(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const note = dropped.length
      ? ` — participant(s) NON invité(s), ce ne sont pas des adresses e-mail : ${dropped.join(", ")}`
      : "";
    return { content: [{ type: "text", text: `Événement créé : ${ev.htmlLink ?? summary}${note}` }] };
  },
};

export const googleCalendarConnector: Connector = {
  id: "google-calendar",
  name: "Google Agenda",
  auth: "pkce",
  // `calendar.events` and NOT `auth/calendar`: the two tools (list, create) only
  // need events — the full scope added ACL, settings and calendar deletion
  // that no tool uses (minimization, Google/CASA verification).
  // ⚠️ THIS list is the one OAuth requests (`main/mcp/connectors/index.ts`); the
  // catalog carries a display copy of it — `scopesParity.test.ts` keeps them equal.
  scopes: {
    managed: ["https://www.googleapis.com/auth/calendar.events"],
    byo: ["https://www.googleapis.com/auth/calendar.events"],
  },
  tools: [listEvents, createEvent],
  // Applied by the adapter to EVERY call (`run.ts`), so a tool added later
  // cannot forget it — the reason this lives on the connector, not per tool.
  errorHint: (err) =>
    googleApiErrorHint(err, {
      api: "API Google Calendar",
      connector: "Google Agenda",
      scope: "l'accès à votre AGENDA",
      fallback: "Lecture de l'agenda impossible",
    }),
};

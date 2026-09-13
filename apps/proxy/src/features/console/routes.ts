// `/console` — the page, and the stream that fills it. Two GETs, both behind a token.
//
// ⚠️ **Loopback is not an access control.** Every process on this machine can reach
// 127.0.0.1, and a browser page can be opened by anything that can open a URL. The terminal
// had the operator in front of it; an HTTP endpoint has whoever asks. So a token is minted
// per run, printed on the start-up card, and required on both routes — without it the
// console is a 404, not a 401: an endpoint that admits it exists invites guessing.
import { BRAND } from "@openmasq/branding";
import { getMessages } from "@openmasq/i18n";
import express, { Router, type Request, type Response } from "express";
import type { ProxyConfig } from "../../config/config.js";
import { timingSafeEqual } from "node:crypto";
import {
  activeCategories,
  connectorCatalog,
  rules,
  sections,
  sideShown,
  type ConsoleBus,
} from "./events.js";
import type { ApplyResult, MaskingRequest } from "./applyMasking.js";
import { appJs, renderPage, tokensCss } from "./page.js";

export interface ConsoleRouteDeps {
  bus: ConsoleBus;
  token: string;
  version: string;
  /** The command being wrapped, for the footer. */
  command: string;
  startedAt: number;
  /** Read at connect time, not captured: the `l` key moves the level while the page is open. */
  config: Pick<ProxyConfig, "level" | "mode" | "disabledKinds">;
  /** `--mcp`: what the agent's tools go through. Absent ⇒ the panel says so. */
  mcp?: { servers: string[]; writes: string };
  /** Each server's level RIGHT NOW, read at connect time — a level moves while a page is
   *  open, and `own` is what tells an override apart from the run's default. */
  mcpLevels?: () => Record<string, { level: string; own: boolean }>;
  /**
   * Apply a masking change the page asked for. ABSENT ⇒ the panel stays read-only and the
   * route answers 404 like any other unknown path — which is the honest default: a run
   * without a terminal has nobody to confirm a loosening, so it is given no way to ask.
   */
  applyMasking?: (connector: string, next: MaskingRequest) => Promise<ApplyResult>;
}

/** Narrow by hand, because this arrives from a browser. Anything unexpected is refused
 *  outright rather than coerced — a level that silently became `undefined` would read as
 *  "follow the default", which is a loosening nobody asked for. */
function maskingRequest(raw: unknown): MaskingRequest | undefined {
  // Read from the RAW body, like every other POST this proxy takes
  // (`routes/middlewares/jsonBody.ts`): `express.json()` is not the shape that works here.
  let body: unknown;
  try {
    body = JSON.parse((Buffer.isBuffer(raw) ? raw : Buffer.alloc(0)).toString("utf8"));
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  const b = body as Record<string, unknown>;
  const out: MaskingRequest = {};
  if ("level" in b) {
    if (b.level !== null && typeof b.level !== "string") return undefined;
    out.level = b.level as string | null;
  }
  for (const key of ["disable", "keep"] as const) {
    if (!(key in b)) continue;
    if (!Array.isArray(b[key]) || (b[key] as unknown[]).some((v) => typeof v !== "string"))
      return undefined;
    out[key] = b[key] as string[];
  }
  return out;
}

/** Constant-time compare of two strings of any length. */
function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

const authorized = (req: Request, token: string): boolean => {
  const q = req.query.t;
  return typeof q === "string" && sameToken(q, token);
};

export default function consoleRouter(deps: ConsoleRouteDeps): Router {
  const router = Router();

  router.get("/", (req: Request, res: Response) => {
    if (!authorized(req, deps.token)) {
      res.status(404).end();
      return;
    }
    // No store, no cache: the page carries live values under `--reveal`, and a proxy or a
    // browser holding a copy of it is the one place we said they would not be.
    res.set("cache-control", "no-store").type("html").send(renderPage(deps.token));
  });

  router.get("/tokens.css", (req: Request, res: Response) => {
    if (!authorized(req, deps.token)) {
      res.status(404).end();
      return;
    }
    res.set("cache-control", "no-store").type("css").send(tokensCss());
  });

  router.get("/app.js", (req: Request, res: Response) => {
    if (!authorized(req, deps.token)) {
      res.status(404).end();
      return;
    }
    res.set("cache-control", "no-store").type("js").send(appJs());
  });

  // The one route that CHANGES something. Same token, same 404, and the gate behind it
  // (`maskingGate.ts`) is what makes a URL in a browser history unable to lower protection
  // on its own.
  // A small, explicit body limit: this route takes a level and two short lists, and nothing
  // else on this app parses a body for the console.
  router.post(
    "/masking/:connector",
    express.raw({ type: () => true, limit: "8kb" }),
    async (req: Request, res: Response) => {
      if (!authorized(req, deps.token) || !deps.applyMasking) {
        res.status(404).end();
        return;
      }
      const next = maskingRequest(req.body);
      if (!next) {
        res.status(400).json({ ok: false, why: "unreadable masking request" });
        return;
      }
      // `:connector` is `-` for the run's own default — an empty path segment is not routable,
      // and a connector id can never be a bare dash.
      const id = req.params.connector === "-" ? "" : (req.params.connector ?? "");
      const result = await deps.applyMasking(id, next);
      // 409, not 403: the request was understood and legitimate, and the operator declined it.
      res.status(result.ok ? 200 : 409).json(result);
    },
  );

  router.get("/events", (req: Request, res: Response) => {
    if (!authorized(req, deps.token)) {
      res.status(404).end();
      return;
    }
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    send("hello", {
      // The page holds no list of its own: the nine sections, their labels and their token
      // ids all come from the product (`events.ts` `sections()`), so a tenth would appear
      // without an edit here or a stale label there.
      sections: sections(),
      side: sideShown(),
      // The MCP connector catalog (the desktop app's own list) so the MCP panel shows every
      // service that CAN be connected, not just what is live on this run.
      catalog: connectorCatalog(),
      // The masking panel: the catalogue's own tree, what is on right now, and where the
      // tools go. A page that cannot show the rules cannot be read against them.
      rules: rules(),
      level: deps.config.level,
      mode: deps.config.mode,
      masking: activeCategories(deps.config.level, deps.config.disabledKinds),
      // Each level with its own count and the APP's own words for it (`privacyLevels`, the
      // settings cards' copy in English): the panel says what moving to it would cost without
      // a browser replaying the arithmetic — or a sentence someone wrote about it once, here.
      levels: (["standard", "renforce", "strict"] as const).map((id) => {
        const copy = getMessages("en").privacyLevels[id];
        return {
          id,
          n: activeCategories(id, deps.config.disabledKinds).length,
          label: copy.label,
          desc: copy.desc,
          short: copy.short(BRAND.name),
          tradeoff: copy.tradeoff,
        };
      }),
      ...(deps.mcp ? { mcp: deps.mcp } : {}),
      ...(deps.mcpLevels ? { levelsByServer: deps.mcpLevels() } : {}),
      // The page renders a LIVE picker only when this run can act on it — there has to be a
      // terminal to confirm a loosening on. Otherwise the state still shows, read-only.
      canSetMasking: !!deps.applyMasking,
      reveal: deps.bus.reveal,
      version: deps.version,
      pid: process.pid,
      command: deps.command,
      upMs: Date.now() - deps.startedAt,
    });
    for (const e of deps.bus.backlog()) send("request", e);
    const off = deps.bus.subscribe((e) => send("request", e));
    // A comment frame keeps an idle stream from being reaped by the browser.
    const beat = setInterval(() => res.write(": beat\n\n"), 25_000);
    beat.unref?.();
    req.on("close", () => {
      clearInterval(beat);
      off();
      res.end();
    });
  });

  return router;
}

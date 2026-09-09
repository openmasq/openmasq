// `/console` — the page, and the stream that fills it. Two GETs, both behind a token.
//
// ⚠️ **Loopback is not an access control.** Every process on this machine can reach
// 127.0.0.1, and a browser page can be opened by anything that can open a URL. The terminal
// had the operator in front of it; an HTTP endpoint has whoever asks. So a token is minted
// per run, printed on the start-up card, and required on both routes — without it the
// console is a 404, not a 401: an endpoint that admits it exists invites guessing.
import { Router, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { sections, type ConsoleBus } from "./events.js";
import { renderPage, tokensCss } from "./page.js";

export interface ConsoleRouteDeps {
  bus: ConsoleBus;
  token: string;
  version: string;
  /** The command being wrapped, for the footer. */
  command: string;
  startedAt: number;
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

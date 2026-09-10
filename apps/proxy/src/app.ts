// The Express app, assembled from injected dependencies so a test runs it against a fake
// upstream and a one-name masker. No dotenv here: the CLI (`server.ts`) reads flags and env.
import express, { type NextFunction, type Request, type Response } from "express";
import type { ProxyConfig } from "./config/config.js";
import { createReporter, type Reporter } from "./lib/ui/index.js";
import type { Masker } from "./lib/masker.js";
import type { RelayDeps } from "./lib/relay.js";
import type { McpBridge } from "./features/mcp/bridge.js";
import consoleRouter, { type ConsoleRouteDeps } from "./features/console/routes.js";
import mcpRouter, { mcpBody } from "./features/mcp/routes.js";
import { healthRouter } from "./routes/health.js";
import { apiRouter } from "./routes/index.js";
import { parseJsonObject, rawBody } from "./routes/middlewares/jsonBody.js";
import { sessionMiddleware } from "./routes/middlewares/session.js";

export interface AppDeps {
  config: ProxyConfig;
  masker: Masker;
  /** Injected by tests; `globalThis.fetch` otherwise. */
  fetch?: typeof fetch;
  reporter?: Reporter;
  /** Is the on-device model loaded right now (the level can change while it runs). */
  modelOn?: () => boolean;
  /** Reported by `/healthz`, which is how a second wrapper recognises us before joining. */
  version?: string;
  /** Present ⇒ serve `/mcp`. Built by `server.ts` once the upstream servers are connected;
   *  absent ⇒ the route does not exist at all (`routes/index.ts` says why). */
  mcp?: { bridge: McpBridge; version: string };
  /** Present ⇒ serve `/console`. Built by `server.ts`, which owns the token. */
  console?: ConsoleRouteDeps;
}

export function createApp(deps: AppDeps): express.Application {
  const relayDeps: RelayDeps = {
    config: deps.config,
    masker: deps.masker,
    fetch: deps.fetch ?? globalThis.fetch,
    reporter: deps.reporter ?? createReporter(),
  };
  const app = express();
  app.disable("x-powered-by");
  // ONE instance, shared by both mounts: it owns the vault map, so building it twice would
  // give the tool calls and the model calls two different vaults under the same session id
  // — the exact thing `/mcp` exists to avoid.
  const session = sessionMiddleware(deps.config);
  app.use(
    "/healthz",
    healthRouter(deps.config, deps.modelOn ?? (() => !deps.config.rulesOnly), deps.version),
  );
  // Before the body chain and the family routers: these are plain GETs with no request body
  // to mask, and `/` would otherwise fall through to the passthrough relay.
  if (deps.console) app.use("/console", consoleRouter(deps.console));
  // `/mcp` exists only when the upstream servers are connected: an endpoint answering with an
  // empty tool list would read like "no integrations" rather than "not switched on".
  if (deps.mcp)
    app.use(
      "/mcp",
      rawBody,
      mcpBody,
      session,
      mcpRouter({
        bridge: deps.mcp.bridge,
        reporter: relayDeps.reporter,
        version: deps.mcp.version,
      }),
    );
  // `/s/:sid/...` — the SAME routes, under a per-client prefix. Several wrapped clients can
  // then share one proxy while keeping one vault each: a tool gives us its base URL and
  // nothing else, so the session has to travel there.
  app.use("/s/:sid", rawBody, parseJsonObject, session, apiRouter(relayDeps));
  app.use(rawBody, parseJsonObject, session);
  app.use(apiRouter(relayDeps));

  // JSON error handler: a failure between reading and forwarding (the NER threw, the upstream
  // is unreachable) ends here as a 502 — never as a forward in clear, never as an HTML page.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    // The cause's code (ECONNREFUSED, ENOTFOUND…) is the one thing that makes « fetch failed »
    // actionable; it names no value and no header.
    const cause =
      err instanceof Error && err.cause && typeof err.cause === "object"
        ? (err.cause as { code?: string }).code
        : undefined;
    const message = err instanceof Error ? err.message : String(err);
    const status =
      typeof (err as { status?: number }).status === "number"
        ? (err as { status: number }).status
        : 502;
    // The operator's terminal gets the cause (a network error names hosts and codes, never a
    // value); the caller gets the message.
    relayDeps.reporter.error(
      status,
      message,
      cause ??
        (err instanceof Error && err.cause
          ? String((err.cause as Error).message ?? err.cause)
          : undefined),
    );
    if (res.headersSent) {
      res.end();
      return;
    }
    res.status(status).json({
      error: { type: "openmasq_proxy", message: cause ? `${message} (${cause})` : message },
    });
  });
  return app;
}

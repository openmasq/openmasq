// The Express app, assembled from injected dependencies so a test runs it against a fake
// upstream and a one-name masker. No dotenv here: the CLI (`server.ts`) reads flags and env.
import express, { type NextFunction, type Request, type Response } from "express";
import type { ProxyConfig } from "./config/config.js";
import { createReporter, type Reporter } from "./lib/ui/index.js";
import type { Masker } from "./lib/masker.js";
import type { RelayDeps } from "./lib/relay.js";
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
  app.use("/healthz", healthRouter(deps.config, deps.modelOn ?? (() => !deps.config.rulesOnly)));
  app.use(rawBody, parseJsonObject, sessionMiddleware(deps.config));
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

import express from "express";
import { config, brokerUrl } from "./config.js";
import { discoveryRouter } from "./oauth/discovery.js";
import { oauthRouter } from "./oauth/router.js";
import { mcpRouter } from "./mcp/endpoint.js";
import { availablePlatforms } from "./platforms/registry.js";

/**
 * MCP broker entrypoint. Mounts the OAuth AS (discovery + /oauth), the per-platform
 * MCP endpoints, and a small public catalogue. The desktop app adds an HTTP MCP
 * server with URL `${PUBLIC_URL}/<platform>/mcp` and the existing OAuth connector
 * flow does the rest.
 */
export function createApp(): express.Express {
  const app = express();

  // Conservative defaults: no sniffing, deny framing, modest JSON limit. CORS is
  // permissive for the API surface so browser MCP clients can reach it (the broker
  // never returns upstream credentials, only tool output behind a bearer).
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    next();
  });
  app.options(/.*/, (_req, res) => res.sendStatus(204));
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: false }));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.get("/platforms", (_req, res) =>
    res.json(
      availablePlatforms().map((p) => ({
        id: p.id,
        name: p.name,
        desc: p.desc,
        mcpUrl: brokerUrl(`/${p.id}/mcp`),
      })),
    ),
  );

  app.use(discoveryRouter);
  app.use("/oauth", oauthRouter);
  app.use(mcpRouter);
  return app;
}

// Listen when run directly (tests/smoke import createApp without binding). The
// desktop sidecar sets BROKER_FORCE_LISTEN=1 so it never depends on argv matching.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain || process.env.BROKER_FORCE_LISTEN) {
  // Bind loopback only: a local sidecar must never be reachable off-machine.
  createApp().listen(config.port, "127.0.0.1", () => {
    const ids = availablePlatforms().map((p) => p.id).join(", ");
    console.log(`[broker] listening on ${config.publicUrl}  platforms: ${ids}`);
  });
}

import { createServer, type Server } from "node:http";
import { connectSignal } from "./server/connectCancel";
import { BRAND } from "@openmasq/branding";

/**
 * An ephemeral loopback HTTP server on 127.0.0.1 that catches the OAuth redirect.
 * The provider's authorization page redirects the browser back to
 * `http://127.0.0.1:<port>/callback?code=…`; we read that code and resolve.
 */
export interface Loopback {
  redirectUrl: string;
  /** The port actually bound — persist it so the redirect URI stays stable. */
  port: number;
  /** Resolves with the `code` once the browser is redirected back (or rejects). */
  waitForCode(timeoutMs: number): Promise<string>;
  close(): void;
}

/**
 * The branded "connexion réussie" page shown in the OAuth login window after the
 * provider redirects back. Fully self-contained (no external fonts/assets — it's
 * served by this tiny loopback; Space Grotesk renders only if installed, the system
 * stack is the fallback), branded on the CURRENT charter (indigo #3939FA on
 * navy ink, the five-bar redaction mark — the retired forest+lime must not come
 * back; source: `.claude/skills/design-system/tokens/`), theme-aware
 * (prefers-color-scheme, dark = deep navy).
 */
const PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${BRAND.name} — Connexion réussie</title>
<style>
  :root {
    --bg: #fbfbfa; --card: #ffffff; --border: rgba(5,6,26,.08);
    --strong: #05061a; --muted: #4a4f8c; --faint: #7a80b8;
    --tile: #0a0c1e; --accent: #3939fa; --accent-bright: #5b5bff;
    --ok-bg: #e7e7ff; --ok-fg: #2a2ae0; --shadow: rgba(5,6,26,.12);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #05061a; --card: #0f1230; --border: rgba(198,202,240,.12);
      --strong: #eef0ff; --muted: #9098c8; --faint: #6e76a8;
      --tile: #0a0c1e; --ok-bg: #1c2250; --ok-fg: #c0c4e8;
      --shadow: rgba(0,0,0,.5);
    }
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    background:
      radial-gradient(1200px 600px at 50% -10%, color-mix(in oklab, var(--accent) 10%, transparent), transparent 60%),
      var(--bg);
    color: var(--strong);
    display: grid; place-items: center; padding: 24px;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 100%; max-width: 420px; background: var(--card);
    border: 1px solid var(--border); border-radius: 22px;
    padding: 40px 36px; text-align: center;
    box-shadow: 0 20px 60px -24px var(--shadow), 0 1px 0 rgba(255,255,255,.03) inset;
    animation: rise .5s cubic-bezier(.16,1,.3,1) both;
  }
  .tile {
    width: 64px; height: 64px; margin: 0 auto 22px; border-radius: 17px;
    background: var(--tile);
    display: grid; place-items: center;
    box-shadow: 0 8px 22px -10px rgba(5,6,26,.45);
    animation: pop .55s cubic-bezier(.16,1,.3,1) .06s both;
  }
  .tile svg { width: 26px; height: auto; display: block; }
  .badge {
    display: inline-flex; align-items: center; gap: 7px;
    background: var(--ok-bg); color: var(--ok-fg);
    font-size: 12.5px; font-weight: 650; letter-spacing: .01em;
    padding: 5px 12px 5px 9px; border-radius: 999px; margin-bottom: 16px;
    animation: rise .5s cubic-bezier(.16,1,.3,1) .12s both;
  }
  .badge svg { width: 14px; height: 14px; }
  h1 { font-size: 22px; font-weight: 720; margin: 0 0 8px; letter-spacing: -.01em; }
  p { font-size: 14.5px; line-height: 1.5; color: var(--muted); margin: 0 auto; max-width: 300px; }
  .hint { margin-top: 22px; font-size: 12.5px; color: var(--faint); }
  .foot {
    margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--border);
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 12px; font-weight: 650; letter-spacing: .12em;
    text-transform: uppercase; color: var(--faint);
  }
  .foot svg { width: 12px; height: auto; color: var(--accent-bright); }
  @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  @keyframes pop { from { opacity: 0; transform: scale(.82); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .card, .tile, .badge { animation: none; } }
</style>
</head>
<body>
  <main class="card">
    <div class="tile">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="k" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#7a7aff" /><stop offset="1" stop-color="#3939fa" />
          </linearGradient>
        </defs>
        <g fill="url(#k)">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M50 6C25.7 6 6 25.7 6 50s19.7 44 44 44 44-19.7 44-44S74.3 6 50 6Zm0 17c14.9 0 27 12.1 27 27S64.9 77 50 77 23 64.9 23 50s12.1-27 27-27Z" />
          <rect x="2" y="41" width="96" height="18" rx="5" />
        </g>
      </svg>
    </div>
    <span class="badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      Connecteur relié
    </span>
    <h1>Connexion réussie</h1>
    <p>Votre connecteur est maintenant relié à ${BRAND.name}. Vous pouvez fermer cet onglet et revenir à l'application.</p>
    <div class="hint">Vos identifiants restent sur votre machine — ${BRAND.name} ne les envoie jamais au modèle.</div>
    <div class="foot">
      <svg viewBox="0 0 100 100" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M50 6C25.7 6 6 25.7 6 50s19.7 44 44 44 44-19.7 44-44S74.3 6 50 6Zm0 17c14.9 0 27 12.1 27 27S64.9 77 50 77 23 64.9 23 50s12.1-27 27-27Z" />
          <rect x="2" y="41" width="96" height="18" rx="5" />
      </svg>
      ${BRAND.name}
    </div>
  </main>
</body>
</html>`;

/**
 * Start the loopback. `preferredPort` (persisted from a previous run) keeps the
 * redirect URI — and therefore the dynamically-registered OAuth client — stable
 * across connects; if it's busy/unavailable we fall back to an ephemeral port.
 */
export async function startLoopback(
  preferredPort?: number,
  /** Fired the instant the browser redirects back (code OR error) — e.g. to pull
   * the app window forward, since we can't close the external browser tab. */
  onRedirect?: () => void,
): Promise<Loopback> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/callback") {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    // `error_description` carries the provider's ACTIONABLE detail — Microsoft puts its
    // `AADSTS…` code there, and that code is the only way to tell "your admin must approve"
    // apart from an ordinary refusal. Dropping it left the caller with a bare
    // "access_denied" it could do nothing with.
    const detail = url.searchParams.get("error_description");
    if (code) resolveCode(code);
    else rejectCode(new Error([error, detail].filter(Boolean).join(" — ") || "OAuth redirect carried no code"));
    onRedirect?.();
  });

  // Cancel wiring: if the interactive connect is cancelled ("Annuler"), reject the
  // pending code and CLOSE the loopback at once. Closing the 127.0.0.1 listener is the
  // security lever — a late redirect from the (still-open) browser tab then hits a
  // closed port, so no `code` is captured and no token is minted. Fail-closed.
  const signal = connectSignal();
  const onAbort = () => {
    rejectCode(new Error("Connexion annulée"));
    try {
      server.close();
    } catch {
      /* already closing */
    }
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  const listenOn = (port: number) =>
    new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => reject(err);
      server.once("error", onError);
      server.listen(port, "127.0.0.1", () => {
        server.removeListener("error", onError);
        resolve();
      });
    });

  try {
    await listenOn(preferredPort ?? 0);
  } catch {
    // Preferred port busy/unavailable — fall back to an ephemeral one (a fresh
    // registration will be triggered because the redirect URI changed).
    await listenOn(0);
  }
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;

  return {
    redirectUrl: `http://127.0.0.1:${port}/callback`,
    port,
    waitForCode: (timeoutMs) =>
      Promise.race([
        codePromise,
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("OAuth login timed out")), timeoutMs),
        ),
      ]),
    close: () => server.close(),
  };
}

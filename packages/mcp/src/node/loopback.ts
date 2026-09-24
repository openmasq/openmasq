/**
 * An ephemeral loopback HTTP server on 127.0.0.1 that catches the OAuth redirect. The
 * provider's authorization page redirects the browser back to
 * `http://127.0.0.1:<port>/callback?code=…&state=…`; we read that code and resolve.
 *
 * ⚠️ **The `state` is the per-attempt binding, and it is not decoration.** The port is
 * PERSISTED per server so the registered redirect URI stays stable — which also makes
 * `http://127.0.0.1:<port>/callback` a long-lived endpoint any web page can hit with a bare
 * `<img src="…/callback?error=x">`: no CORS to clear, no response to read. Such a request
 * settled a login the user was in the middle of, and a `?code=` would have settled it with a
 * code the page chose. Nothing tied a request to THIS attempt. The `state` does, the way
 * RFC 6749 §10.12 intends: the loopback mints an unguessable value, the flow puts it in its
 * authorize URL, the server echoes it, and a callback whose `state` does not match gets a
 * 404 that settles NOTHING. The binding lives in a QUERY parameter every provider echoes
 * verbatim — never in the path, which would change the redirect URI on each attempt,
 * something loopback clients are only guaranteed to tolerate for the PORT. (PKCE is
 * unchanged and still the defence for an intercepted code.)
 *
 * The success PAGE and any cancellation signal are injected: the desktop shows its branded
 * page inside its own flow, a CLI shows a plain one. The MECHANISM has one home.
 */
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";

export interface Loopback {
  redirectUrl: string;
  /** The per-attempt `state` — put it in the authorize URL; the callback must echo it. */
  state: string;
  /** The port actually bound — persist it so the redirect URI stays stable. */
  port: number;
  /** Resolves with the `code` once the browser is redirected back (or rejects). */
  waitForCode(timeoutMs: number): Promise<string>;
  close(): void;
}

export interface LoopbackOptions {
  /** HTML shown in the browser once the provider redirects back. */
  page: string;
  /** Reuse this port when free, so a registered redirect URI keeps working. */
  port?: number;
  /** Fired the instant the browser redirects back (code OR error) — e.g. to pull a window
   *  forward, since we cannot close the external browser tab. */
  onRedirect?: () => void;
  /** Cancellation. Aborting rejects the pending code and CLOSES the listener at once: a
   *  late redirect then hits a closed port, so no code is captured and no token is minted. */
  signal?: AbortSignal;
  /** What a cancellation reads as. */
  cancelledMessage?: string;
}

export async function startLoopback(opts: LoopbackOptions): Promise<Loopback> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Swallow the rejection until someone awaits: a flow cancelled before `waitForCode`
  // must not surface as an unhandled rejection.
  codePromise.catch(() => {});

  // One secret segment per attempt (128 bits, url-safe). A second attempt, concurrent or
  // later, gets a different one — so a stale tab can no longer settle the flow that
  // replaced it either.
  const state = randomBytes(16).toString("base64url");

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    // Not ours, or not THIS attempt: 404, and nothing settles.
    if (url.pathname !== "/callback" || url.searchParams.get("state") !== state) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(opts.page);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    // `error_description` carries the provider's ACTIONABLE detail — Microsoft puts its
    // `AADSTS…` code there, and that code is the only way to tell "your admin must approve"
    // apart from an ordinary refusal.
    const detail = url.searchParams.get("error_description");
    if (code) resolveCode(code);
    else
      rejectCode(
        new Error([error, detail].filter(Boolean).join(" — ") || "OAuth redirect carried no code"),
      );
    opts.onRedirect?.();
  });

  const onAbort = () => {
    rejectCode(new Error(opts.cancelledMessage ?? "Connection cancelled"));
    try {
      server.close();
    } catch {
      /* already closing */
    }
  };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
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
    await listenOn(opts.port ?? 0);
  } catch {
    // Preferred port busy — fall back to an ephemeral one. The redirect URI changes, so a
    // fresh registration is triggered; that is correct, not a failure.
    await listenOn(0);
  }

  const port = (server.address() as { port: number }).port;
  return {
    redirectUrl: `http://127.0.0.1:${port}/callback`,
    state,
    port,
    waitForCode: (timeoutMs) => {
      const race = Promise.race([
        codePromise,
        new Promise<string>((_, reject) => {
          const t = setTimeout(
            () => reject(new Error("the authorization was not completed in time")),
            timeoutMs,
          );
          t.unref?.();
        }),
      ]);
      // A caller that starts the wait, THEN triggers the redirect, attaches its handler one
      // tick late — and Node reports the rejection as unhandled in between, which under
      // `--unhandled-rejections=strict` kills the process during a login. Marking `race` as
      // handled here changes nothing for the caller: awaiting it still throws.
      race.catch(() => {});
      return race;
    },
    close: () => {
      try {
        server.close();
      } catch {
        /* already closing */
      }
    },
  };
}

// The relay every command ends in: forward the (already masked) body upstream with the
// caller's own headers, then bring the reply back restored — JSON in one go, SSE frame by
// frame. The caller's key transits, it is never read; the vault never leaves this process.
import type { Request, Response } from "express";
import { pipeline, Readable } from "node:stream";
import type { RedactionMatch } from "@openmasq/redact";
import type { ProxyConfig } from "../config/config.js";
import type { Masker, Vault } from "./masker.js";
import { SseTransform, type FrameRewriter, type SseFrame } from "./sse.js";
import type { Reporter } from "./ui/index.js";
import type { RestoreFns } from "../features/openai/wire.js";

/** Hop-by-hop, framing and our own headers: ours to set, not the caller's or the upstream's. */
const DROP_REQ = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "accept-encoding",
  "x-openmasq-session",
  "x-openmasq-mode",
]);
const DROP_RES = new Set(["content-length", "content-encoding", "transfer-encoding", "connection"]);

export type Family = "openai" | "anthropic" | "gemini";

export interface Locals {
  /** Which wrapped client this request belongs to, when it named one — the `/s/:sid`
   *  prefix, or the `x-openmasq-session` header. Absent for an anonymous caller. */
  session?: string;
  vault: Vault;
  /** The vault's key (hex): the fakes are HMACs under it, never a public hash. */
  key: string;
  mode: "fake" | "token";
  matches: RedactionMatch[];
}

export interface RelayDeps {
  config: ProxyConfig;
  masker: Masker;
  fetch: typeof fetch;
  reporter: Reporter;
}

export interface StreamRewriter {
  rewrite: FrameRewriter;
  end: () => SseFrame[];
}

export interface RelayOptions {
  family: Family;
  /** The masked JSON body to send (POST), or nothing (GET/HEAD/DELETE). */
  body?: Record<string, unknown>;
  /** Restores a non-streaming JSON reply. */
  restore?: (body: Record<string, unknown>, fns: RestoreFns) => Record<string, unknown>;
  /** Built when the request asked for `stream: true` — the SSE dialect of the family. */
  stream?: (vault: Vault, fns: RestoreFns) => StreamRewriter;
  /** Fields set on `body` for the decision only, removed before the bytes leave (Gemini has
   *  no `stream` field: the path decides). */
  strip?: string[];
}

/** The upstream path: what the client asked for, minus the prefixes that address US and not
 *  the vendor — the per-client `/s/<session>` (a wrapped tool's whole base URL) and a
 *  `/openai`|`/anthropic`|`/gemini` family selector. Both are how the caller reaches THIS
 *  proxy; neither exists upstream, so forwarding either verbatim is a 404 at the vendor. */
export function upstreamPath(req: Request): string {
  return (
    req.originalUrl
      .replace(/^\/s\/[^/]+/, "")
      .replace(/^\/(openai|anthropic|gemini)(?=\/|$)/, "") || "/"
  );
}

export async function relay(
  deps: RelayDeps,
  req: Request,
  res: Response,
  o: RelayOptions,
): Promise<void> {
  const locals = res.locals as unknown as Locals;
  const path = upstreamPath(req);
  const origin = {
    openai: deps.config.openai,
    anthropic: deps.config.anthropic,
    gemini: deps.config.gemini,
  }[o.family].replace(/\/$/, "");
  const streaming = !!o.stream && o.body?.stream === true;
  let sent = o.body;
  if (sent && o.strip?.length) {
    sent = { ...sent };
    for (const k of o.strip) delete sent[k];
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (DROP_REQ.has(k) || v === undefined) continue;
    headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  }
  headers.set("accept-encoding", "identity");
  if (sent && !headers.has("content-type")) headers.set("content-type", "application/json");

  const t0 = Date.now();
  const up = await deps.fetch(origin + path, {
    method: req.method,
    headers,
    body: sent ? JSON.stringify(sent) : undefined,
    redirect: "manual",
  });
  deps.reporter.request({
    method: req.method,
    // Without the `/s/<session>` prefix: the session has its own column, and repeating it
    // in every route makes the log harder to read, not more precise.
    path: path.split("?")[0].replace(/^\/s\/[^/]+/, ""),
    family: o.family,
    status: up.status,
    ms: Date.now() - t0,
    matches: locals.matches,
    stream: streaming,
    // From `res.locals`, not re-read from the header: the session may have come from the
    // `/s/:sid` prefix, and the middleware is the one place that decides.
    session: locals.session,
  });

  const resHeaders: Record<string, string> = {};
  up.headers.forEach((v, k) => {
    if (!DROP_RES.has(k)) resHeaders[k] = v;
  });
  resHeaders["x-openmasq-masked"] = String(locals.matches.length);
  const fns: RestoreFns = {
    reply: (t) => deps.masker.restoreReply(t, locals.vault),
    args: (t) => deps.masker.restoreArgs(t, locals.vault),
  };

  if (streaming && up.ok && up.body && o.stream) {
    res.writeHead(up.status, resHeaders);
    // The vault's KEYS are the fakes — what the model saw — never the real values.
    deps.reporter.fakes(Object.keys(locals.vault));
    const rw = o.stream(locals.vault, fns);
    // ⚠️ `pipeline`, never a chain of `.pipe()`. A `.pipe()` does not forward errors, so an
    // upstream that DIES MID-STREAM — a laptop losing wifi, a provider dropping the
    // connection — emitted `error` on a Readable nobody listened to, and Node turned that
    // into an uncaught exception: the proxy exited, taking the wrapped tool with it. The
    // one thing this process must not do is disappear while it is somebody's only way to
    // reach a model. `pipeline` propagates the error, destroys every stream in the chain,
    // and hands it here.
    pipeline(
      Readable.fromWeb(up.body as import("node:stream/web").ReadableStream),
      new SseTransform(rw.rewrite, rw.end),
      res,
      (err) => {
        if (!err) return;
        // The headers went out long ago, so there is no status left to change: the client
        // sees a truncated stream, which is what actually happened and what it can retry.
        // Said on the operator's screen, because a silent truncation looks like an answer
        // that simply stopped.
        deps.reporter.note?.(`upstream stream ended early: ${errText(err)}`, "warn");
        res.end();
      },
    );
    return;
  }

  const text = await up.text();
  let out = text;
  if (up.ok && o.restore && text) {
    try {
      out = JSON.stringify(o.restore(JSON.parse(text) as Record<string, unknown>, fns));
    } catch {
      // Not JSON after all: passed as received — it cannot carry our fakes as JSON fields.
    }
  }
  res.writeHead(up.status, resHeaders);
  res.end(out);
}

/** An upstream failure in one line. `undici` reports a dropped connection as a bare
 *  « terminated » whose `cause` carries the real reason (`read EHOSTUNREACH`), so the cause
 *  is what an operator needs to see. */
function errText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: unknown }).cause;
  return cause instanceof Error ? `${err.message} (${cause.message})` : err.message;
}

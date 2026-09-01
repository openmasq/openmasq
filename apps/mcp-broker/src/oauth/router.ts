import { Router, type Request, type Response } from "express";
import { brokerUrl } from "../config.js";
import { getPlatform, isAvailable, type Platform } from "../platforms/registry.js";
import type { UpstreamTokenSet } from "../platforms/types.js";
import { postForm } from "../util/fetchJson.js";
import { createVerifier, isS256, s256Challenge, verifyPkce } from "./pkce.js";
import { isAllowedRedirect, redirectUriMatches } from "./redirectUri.js";
import { store, type UpstreamTokens } from "./store.js";
import { rateLimit } from "./rateLimit.js";

export const oauthRouter = Router();

function platformFromResource(resource?: string, fallback?: string): Platform | undefined {
  let id = fallback;
  if (resource) {
    try {
      id = new URL(resource).pathname.split("/").filter(Boolean)[0] ?? fallback;
    } catch {
      /* ignore */
    }
  }
  return id ? getPlatform(id) : undefined;
}

const defaultParse = (raw: Record<string, unknown>): UpstreamTokenSet => ({
  accessToken: String(raw.access_token ?? ""),
  refreshToken: raw.refresh_token ? String(raw.refresh_token) : undefined,
  expiresIn: typeof raw.expires_in === "number" ? raw.expires_in : undefined,
});

function toUpstream(t: UpstreamTokenSet): UpstreamTokens {
  return {
    accessToken: t.accessToken,
    refreshToken: t.refreshToken,
    expiresAt: t.expiresIn ? Date.now() + t.expiresIn * 1000 : undefined,
  };
}

// --- Dynamic Client Registration (RFC 7591) -------------------------------
oauthRouter.post("/register", (req: Request, res: Response) => {
  const uris = req.body?.redirect_uris;
  if (!Array.isArray(uris) || uris.some((u) => typeof u !== "string") || uris.length === 0) {
    res.status(400).json({ error: "invalid_redirect_uri" });
    return;
  }
  const client = store.registerClient(uris as string[], req.body?.client_name);
  res.status(201).json({
    client_id: client.clientId,
    redirect_uris: client.redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
});

// --- Authorization endpoint ----------------------------------------------
oauthRouter.get("/authorize", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const client = store.getClient(q.client_id ?? "");
  if (q.response_type !== "code" || !client) {
    res.status(400).send("invalid_request");
    return;
  }
  if (!q.redirect_uri || !isAllowedRedirect(q.redirect_uri, client.redirectUris)) {
    res.status(400).send("invalid redirect_uri");
    return;
  }
  // From here, errors are redirected back to the client per OAuth.
  const fail = (error: string) =>
    res.redirect(`${q.redirect_uri}?error=${error}&state=${encodeURIComponent(q.state ?? "")}`);
  if (!q.code_challenge || !isS256(q.code_challenge_method)) return fail("invalid_request");

  const platform = platformFromResource(q.resource, q.platform);
  if (!platform || !isAvailable(platform)) return fail("invalid_target");

  // Demo: no upstream — auto-consent and mint a broker code immediately.
  if (platform.fake) {
    const code = store.putCode({
      platform: platform.id,
      clientId: client.clientId,
      redirectUri: q.redirect_uri,
      codeChallenge: q.code_challenge,
      upstream: { accessToken: `fake_${Date.now()}` },
    });
    return res.redirect(`${q.redirect_uri}?code=${code}&state=${encodeURIComponent(q.state ?? "")}`);
  }

  // Real provider: stash pending + redirect to the upstream login.
  const up = platform.upstream!;
  // Public client (shared keys, no secret) → prove possession on the upstream
  // leg too, with our own PKCE verifier.
  const upstreamVerifier = up.clientSecret ? undefined : createVerifier();
  const stateToUpstream = store.putPending({
    platform: platform.id,
    clientId: client.clientId,
    clientRedirectUri: q.redirect_uri,
    clientState: q.state ?? "",
    codeChallenge: q.code_challenge,
    upstreamVerifier,
  });
  const url = new URL(up.authorizeUrl);
  url.searchParams.set("client_id", up.clientId!);
  url.searchParams.set("redirect_uri", brokerUrl(`/oauth/callback/${platform.id}`));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", up.scopes.join(" "));
  url.searchParams.set("state", stateToUpstream);
  if (upstreamVerifier) {
    url.searchParams.set("code_challenge", s256Challenge(upstreamVerifier));
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(up.authorizeParams ?? {})) url.searchParams.set(k, v);
  res.redirect(url.toString());
});

// --- Upstream callback (provider → broker) -------------------------------
oauthRouter.get("/callback/:platform", async (req: Request, res: Response) => {
  const q = req.query as Record<string, string>;
  const pending = store.takePending(q.state ?? "");
  if (!pending) {
    res.status(400).send("unknown or expired state");
    return;
  }
  const back = (params: string) =>
    res.redirect(`${pending.clientRedirectUri}?${params}&state=${encodeURIComponent(pending.clientState)}`);
  const platform = getPlatform(pending.platform);
  if (q.error || !q.code || !platform?.upstream) return back(`error=${q.error ?? "access_denied"}`);

  try {
    const form: Record<string, string> = {
      grant_type: "authorization_code",
      code: q.code,
      redirect_uri: brokerUrl(`/oauth/callback/${platform.id}`),
      client_id: platform.upstream.clientId!,
    };
    // Shared-keys posture: include the secret only if the platform has one
    // (confidential client); otherwise prove possession with the PKCE verifier.
    if (platform.upstream.clientSecret) form.client_secret = platform.upstream.clientSecret;
    if (pending.upstreamVerifier) form.code_verifier = pending.upstreamVerifier;
    const raw = await postForm<Record<string, unknown>>(platform.upstream.tokenUrl, form);
    const tokens = (platform.upstream.parseToken ?? defaultParse)(raw);
    if (!tokens.accessToken) return back("error=upstream_no_token");
    const code = store.putCode({
      platform: platform.id,
      clientId: pending.clientId,
      redirectUri: pending.clientRedirectUri,
      codeChallenge: pending.codeChallenge,
      upstream: toUpstream(tokens),
    });
    return back(`code=${code}`);
  } catch {
    return back("error=upstream_exchange_failed");
  }
});

// --- Token endpoint -------------------------------------------------------
oauthRouter.post("/token", rateLimit({ windowMs: 60_000, max: 30 }), (req: Request, res: Response) => {
  const b = req.body as Record<string, string>;
  if (b.grant_type === "refresh_token") {
    const rotated = b.refresh_token ? store.rotateRefresh(b.refresh_token) : undefined;
    if (!rotated) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    res.json({
      access_token: rotated.accessToken,
      token_type: "Bearer",
      expires_in: rotated.expiresIn,
      refresh_token: rotated.refreshToken,
    });
    return;
  }
  if (b.grant_type !== "authorization_code") {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  const code = store.takeCode(b.code ?? "");
  if (
    !code ||
    code.clientId !== b.client_id ||
    !redirectUriMatches(b.redirect_uri ?? "", code.redirectUri) ||
    !verifyPkce(b.code_verifier, code.codeChallenge)
  ) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
  const t = store.issueToken(code.platform, code.upstream);
  res.json({
    access_token: t.accessToken,
    token_type: "Bearer",
    expires_in: t.expiresIn,
    refresh_token: t.refreshToken,
  });
});

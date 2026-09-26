// Where each of Vibe's egress points goes for the run, as `VIBE_*` variables. Pure: the files
// are read by `files.ts`, the variables applied by the wrapper.
//
// The model: every provider Vibe knows is re-declared with its `api_base` moved onto the
// proxy — under the family whose upstream IS that origin (`/mistral/v1`, `/openai/v1`…), so
// the proxy relays it where it was going, masked. A loopback provider (a local llama.cpp)
// never leaves the machine and is left alone. Any OTHER origin has no family here, so it is
// pointed at `/blocked`: that provider fails for the run instead of sending in clear.
//
// What cannot be masked at all is switched off the same way: text-to-speech (it is sent the
// RESTORED reply — real values), live transcription (the user's voice), teleport (uploads
// the session), and the telemetry, which would otherwise ride the Mistral provider's base URL.
import { FAMILIES, type Family } from "../../lib/families.js";
import { mergedByName, type Doc, type VibeFiles } from "./files.js";

/** The provider shapes whose traffic follows `api_base` — ALLOW-listed from Vibe's backends
 *  and adapters. Any other (`vertex-anthropic` builds its URL from `region` and ignores
 *  `api_base`) cannot be repointed, so it refuses the run rather than go out in clear. */
const BACKENDS = new Set(["mistral", "generic"]);
const API_STYLES = new Set(["openai", "reasoning", "anthropic", "openai-responses"]);

/** Vibe's built-in entries, which exist even when no file names them (its `vibe_schema.py`). */
const DEFAULT_PROVIDERS: Doc[] = [
  {
    name: "mistral",
    api_base: "https://api.mistral.ai/v1",
    api_key_env_var: "MISTRAL_API_KEY",
    backend: "mistral",
  },
  {
    name: "llamacpp",
    api_base: "http://127.0.0.1:8080/v1",
    api_key_env_var: "",
  },
];
const DEFAULT_TTS: Doc[] = [
  {
    name: "mistral",
    api_base: "https://api.mistral.ai",
    api_key_env_var: "MISTRAL_API_KEY",
  },
];
const DEFAULT_TRANSCRIBE: Doc[] = [
  {
    name: "mistral",
    api_base: "wss://api.mistral.ai",
    api_key_env_var: "MISTRAL_API_KEY",
  },
];

/** Keys an agent profile may set that would outrank what we hand Vibe for the model. */
export const AGENT_OVERRIDES = [
  "providers",
  "tts_providers",
  "transcribe_providers",
  "enable_telemetry",
];

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export type Upstreams = Record<Family, string>;
export interface Route {
  url: string;
  /** The family it now goes through, `local` (left alone), or `blocked`. */
  via: Family | "local" | "blocked";
}

export function routeBase(apiBase: string, name: string, root: string, up: Upstreams): Route {
  let u: URL;
  try {
    u = new URL(apiBase);
  } catch {
    return {
      url: `${root}/blocked/provider/${encodeURIComponent(name)}/v1`,
      via: "blocked",
    };
  }
  const path = u.pathname.replace(/\/$/, "");
  // A family first: an upstream the operator pointed at loopback (a local gateway) is still
  // one the proxy relays to, so the traffic to it is masked like any other.
  for (const f of FAMILIES)
    if (u.origin === new URL(up[f]).origin) return { url: `${root}/${f}${path}`, via: f };
  if ((u.protocol === "http:" || u.protocol === "https:") && LOOPBACK.has(u.hostname))
    return { url: apiBase, via: "local" };
  return {
    url: `${root}/blocked/provider/${encodeURIComponent(name)}${path || "/v1"}`,
    via: "blocked",
  };
}

export interface VibePlan {
  env: Record<string, string>;
  /** `name → family` per provider, for the card. */
  routes: { name: string; via: Route["via"] }[];
}

export function vibePlan(
  root: string,
  up: Upstreams,
  files: VibeFiles,
  /** The disabled-tool list already in force (the user's, and `--mcp`'s): ours goes after it. */
  disabledTools: string[] = [],
): VibePlan | { refuse: string } {
  const over = files.agents.filter((a) => AGENT_OVERRIDES.some((k) => k in a.doc));
  if (over.length)
    return {
      refuse:
        `${over.map((a) => a.path).join(", ")} sets its own providers — an agent profile outranks ` +
        "what the proxy hands Vibe, so that profile's model traffic would not be masked. Move " +
        "those keys into config.toml, or remove them for this run.",
    };
  const merged = mergedByName(files.configs, "providers", DEFAULT_PROVIDERS);
  const odd = merged.filter(
    (p) =>
      (p.backend !== undefined && !BACKENDS.has(String(p.backend))) ||
      (p.api_style !== undefined && !API_STYLES.has(String(p.api_style))),
  );
  if (odd.length)
    return {
      refuse:
        `provider ${odd.map((p) => String(p.name)).join(", ")} is of a kind whose address does not ` +
        "follow `api_base` (e.g. vertex-anthropic), so the proxy cannot route it — remove it for this run.",
    };
  const routes: VibePlan["routes"] = [];
  const providers = merged.map((p) => {
    const name = String(p.name);
    const r = routeBase(String(p.api_base ?? ""), name, root, up);
    routes.push({ name, via: r.via });
    return { ...p, api_base: r.url };
  });
  const dead = (kind: string, scheme = "http") =>
    `${root.replace(/^http/, scheme)}/blocked/${kind}`;
  const tts = mergedByName(files.configs, "tts_providers", DEFAULT_TTS).map((p) => ({
    ...p,
    api_base: dead(`tts/${encodeURIComponent(String(p.name))}`),
  }));
  const transcribe = mergedByName(files.configs, "transcribe_providers", DEFAULT_TRANSCRIBE).map(
    (p) => ({
      ...p,
      api_base: dead(`transcribe/${encodeURIComponent(String(p.name))}`, "ws"),
    }),
  );
  return {
    env: {
      VIBE_PROVIDERS: JSON.stringify(providers),
      VIBE_TTS_PROVIDERS: JSON.stringify(tts),
      VIBE_TRANSCRIBE_PROVIDERS: JSON.stringify(transcribe),
      VIBE_ENABLE_TELEMETRY: "false",
      VIBE_VIBE_CODE_SESSIONS_BASE_URL: dead("teleport"),
      // Its search runs on Mistral's servers with the query in clear (the conversations API):
      // through the proxy it is refused anyway, and a provider without the Mistral backend
      // would send it straight to Mistral's default host. Off for the run.
      VIBE_DISABLED_TOOLS: JSON.stringify([...new Set([...disabledTools, "web_search"])]),
    },
    routes,
  };
}

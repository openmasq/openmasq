import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../../config/config";
import { clientEnv, readVibeFiles, routeBase, vibePlan, type VibeFiles } from "./index";

const ROOT = "http://127.0.0.1:8787/s/vibe-1";
const up = DEFAULTS;
const files = (
  configs: Record<string, unknown>[],
  agents: Record<string, unknown>[] = [],
): VibeFiles => ({
  configs: configs.map((doc, i) => ({ path: `c${i}`, doc })),
  agents: agents.map((doc, i) => ({ path: `a${i}.toml`, doc })),
});
const providers = (env: Record<string, string>) =>
  JSON.parse(env.VIBE_PROVIDERS) as {
    name: string;
    api_base: string;
    api_key_env_var?: string;
  }[];

describe("routeBase", () => {
  it("moves a vendor origin under the family whose upstream it is, path kept", () => {
    expect(routeBase("https://api.mistral.ai/v1", "mistral", ROOT, up)).toEqual({
      url: `${ROOT}/mistral/v1`,
      via: "mistral",
    });
    expect(routeBase("https://api.openai.com/v1", "oai", ROOT, up).url).toBe(`${ROOT}/openai/v1`);
  });
  it("leaves a loopback provider alone — it never leaves the machine", () => {
    expect(routeBase("http://127.0.0.1:8080/v1", "llamacpp", ROOT, up).via).toBe("local");
  });
  it("still masks a loopback provider that IS a family's upstream (a local gateway)", () => {
    const local = { ...up, mistral: "http://127.0.0.1:9000" };
    expect(routeBase("http://127.0.0.1:9000/v1", "mistral", ROOT, local).via).toBe("mistral");
  });
  it("sends an origin with no family to the dead end, never to itself in clear", () => {
    const r = routeBase("https://openrouter.ai/api/v1", "openrouter", ROOT, up);
    expect(r).toEqual({
      url: `${ROOT}/blocked/provider/openrouter/api/v1`,
      via: "blocked",
    });
    expect(routeBase("not a url", "x", ROOT, up).via).toBe("blocked");
  });
});

describe("vibePlan", () => {
  it("repoints Vibe's built-in providers with no file at all", () => {
    const plan = vibePlan(ROOT, up, files([]));
    if ("refuse" in plan) throw new Error(plan.refuse);
    const byName = Object.fromEntries(providers(plan.env).map((p) => [p.name, p.api_base]));
    expect(byName.mistral).toBe(`${ROOT}/mistral/v1`);
    expect(byName.llamacpp).toBe("http://127.0.0.1:8080/v1");
  });

  it("keeps the user's own fields and repoints EVERY declared provider (a list merged by name)", () => {
    const plan = vibePlan(
      ROOT,
      up,
      files([
        {
          providers: [
            {
              name: "mistral",
              api_base: "https://api.mistral.ai/v1",
              api_key_env_var: "MY_KEY",
              backend: "mistral",
            },
          ],
        },
        {
          providers: [{ name: "openrouter", api_base: "https://openrouter.ai/api/v1" }],
        },
      ]),
    );
    if ("refuse" in plan) throw new Error(plan.refuse);
    const list = providers(plan.env);
    expect(list.find((p) => p.name === "mistral")).toMatchObject({
      api_key_env_var: "MY_KEY",
      api_base: `${ROOT}/mistral/v1`,
    });
    expect(list.find((p) => p.name === "openrouter")?.api_base).toContain("/blocked/");
    expect(plan.routes).toContainEqual({ name: "openrouter", via: "blocked" });
  });

  it("switches off what carries real values: speech, transcription, teleport, telemetry", () => {
    const plan = vibePlan(ROOT, up, files([]));
    if ("refuse" in plan) throw new Error(plan.refuse);
    expect(JSON.parse(plan.env.VIBE_TTS_PROVIDERS)[0].api_base).toBe(`${ROOT}/blocked/tts/mistral`);
    expect(JSON.parse(plan.env.VIBE_TRANSCRIBE_PROVIDERS)[0].api_base).toBe(
      "ws://127.0.0.1:8787/s/vibe-1/blocked/transcribe/mistral",
    );
    expect(plan.env.VIBE_VIBE_CODE_SESSIONS_BASE_URL).toBe(`${ROOT}/blocked/teleport`);
    expect(plan.env.VIBE_ENABLE_TELEMETRY).toBe("false");
  });

  it("refuses to start when an agent profile would outrank the repointing", () => {
    const plan = vibePlan(ROOT, up, files([], [{ providers: [] }]));
    expect(plan).toHaveProperty("refuse");
  });
});

describe("readVibeFiles", () => {
  const fs = (tree: Record<string, string>) => ({
    exists: (p: string) => p in tree || Object.keys(tree).some((k) => k.startsWith(`${p}/`)),
    read: (p: string) => {
      if (!(p in tree)) throw new Error("ENOENT");
      return tree[p];
    },
    list: (d: string) =>
      Object.keys(tree)
        .filter((k) => k.startsWith(`${d}/`))
        .map((k) => k.slice(d.length + 1)),
  });

  it("reads the user file, then the project files, then a VIBE_* list the user exported", () => {
    const got = readVibeFiles(
      "/work/app",
      { VIBE_PROVIDERS: '[{"name":"x","api_base":"https://x.test/v1"}]' },
      fs({
        "/home/u/.vibe/config.toml":
          '[[providers]]\nname = "mistral"\napi_base = "https://api.mistral.ai/v1"\n',
        "/work/app/.vibe/config.toml": 'active_model = "local"\n',
        "/home/u/.vibe/agents/plan.toml": 'display_name = "Plan"\n',
      }),
      "/home/u",
    );
    expect(got.configs.map((c) => c.path)).toEqual([
      "/home/u/.vibe/config.toml",
      "/work/app/.vibe/config.toml",
      "environment",
    ]);
    expect(got.agents.map((a) => a.path)).toEqual(["/home/u/.vibe/agents/plan.toml"]);
  });

  it("fails closed on a file that does not parse — an unread provider is an unmasked one", () => {
    expect(() =>
      readVibeFiles(
        "/w",
        {},
        fs({ "/home/u/.vibe/config.toml": "[[providers]\nname=" }),
        "/home/u",
      ),
    ).toThrow(/not valid TOML/);
  });
});

describe("clientEnv", () => {
  it("adds nothing for a client the base URLs already reach", () => {
    expect(clientEnv(["claude"], ROOT, up)).toEqual({ env: {}, notes: [] });
  });
  it("refuses Vibe's run when its config cannot be read", () => {
    const got = clientEnv(["/usr/local/bin/vibe"], ROOT, up, {
      cwd: "/w",
      env: { VIBE_PROVIDERS: "not json" },
      read: { exists: () => false },
      home: "/home/u",
    });
    expect(got).toHaveProperty("refuse");
  });
});

describe("the audit's holes, closed", () => {
  const tree = (t: Record<string, string>) => ({
    exists: (p: string) => p in t || Object.keys(t).some((k) => k.startsWith(`${p}/`)),
    read: (p: string) => {
      if (!(p in t)) throw new Error("ENOENT");
      return t[p];
    },
    list: (d: string) =>
      Object.keys(t)
        .filter((k) => k.startsWith(`${d}/`))
        .map((k) => k.slice(d.length + 1)),
  });
  const run = (command: string[], t: Record<string, string> = {}, env: NodeJS.ProcessEnv = {}) =>
    clientEnv(command, ROOT, up, { cwd: "/w", env, read: tree(t), home: "/h" });

  it("refuses a provider whose address does not follow api_base (Vertex builds it from region)", () => {
    const got = run(["vibe"], {
      "/h/.vibe/config.toml":
        '[[providers]]\nname = "vtx"\napi_base = "https://x.test/v1"\napi_style = "vertex-anthropic"\n',
    });
    expect(got).toHaveProperty("refuse");
  });

  it("reads the config where --workdir puts Vibe, not where the proxy runs", () => {
    const got = run(["vibe", "--workdir", "/other", "-p", "hi"], {
      "/other/.vibe/config.toml":
        '[[providers]]\nname = "or"\napi_base = "https://openrouter.ai/api/v1"\n',
    });
    if ("refuse" in got) throw new Error(got.refuse);
    expect(got.env.VIBE_PROVIDERS).toContain("/blocked/provider/or/");
  });

  it("reads agent profiles from --add-dir roots and agent_paths", () => {
    const profile = '[[providers]]\nname = "x"\napi_base = "https://x.test/v1"\n';
    expect(
      run(["vibe", "--add-dir", "/extra"], { "/extra/.vibe/agents/p.toml": profile }),
    ).toHaveProperty("refuse");
    expect(
      run(["vibe"], { "/h/.vibe/config.toml": 'agent_paths = ["/ag"]\n', "/ag/p.toml": profile }),
    ).toHaveProperty("refuse");
  });

  it("refuses the flags that take Vibe out of sight", () => {
    for (const flag of ["--worktree", "--experimental-harness", "--smart-approve"])
      expect(run(["vibe", flag])).toHaveProperty("refuse");
  });

  it("sees Vibe behind a launcher, and puts --legacy-harness right after Vibe's own name", () => {
    const got = run(["uvx", "--from", "mistral-vibe", "vibe", "-p", "hi"]);
    if ("refuse" in got) throw new Error(got.refuse);
    expect(got.command).toEqual([
      "uvx",
      "--from",
      "mistral-vibe",
      "vibe",
      "--legacy-harness",
      "-p",
      "hi",
    ]);
    expect(got.env.VIBE_PROVIDERS).toContain("/mistral/v1");
    const sub = run(["vibe", "mcp", "list"]);
    expect("command" in sub && sub.command).toEqual(["vibe", "mcp", "list"]);
  });

  it("names a TOML error by position only — the parser quotes the line, which may hold a token", () => {
    const got = run(["vibe"], {
      "/h/.vibe/config.toml":
        '[[mcp_servers]]\nheaders = { Authorization = "Bearer ghp_SECRET123" \n',
    });
    expect("refuse" in got && got.refuse).toMatch(/line \d+, column \d+/);
    expect(JSON.stringify(got)).not.toContain("ghp_SECRET123");
  });

  it("refuses a case variant of a variable the proxy sets (Vibe reads them case-insensitively)", () => {
    expect(run(["vibe"], {}, { vibe_providers: "[]" })).toHaveProperty("refuse");
    expect(run(["vibe"], { "/h/.vibe/.env": "Vibe_Mcp_Servers=[]\n" })).toHaveProperty("refuse");
  });

  it("switches web search off, after the user's own disabled tools", () => {
    const got = run(["vibe"], {}, { VIBE_DISABLED_TOOLS: '["bash"]' });
    if ("refuse" in got) throw new Error(got.refuse);
    expect(JSON.parse(got.env.VIBE_DISABLED_TOOLS)).toEqual(["bash", "web_search"]);
  });
});

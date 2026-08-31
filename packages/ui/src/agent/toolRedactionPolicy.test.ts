import { BRAND } from "@openmasq/branding";
import { describe, it, expect } from "vitest";
import {
  toolClearKinds,
  SEARCH_CLEAR,
  BROWSER_CLEAR,
  pythonFrameworkKeep,
  isPythonFrameworkArtifact,
  isToolDiscoveryResult,
  toolDiscoveryKeep,
} from "./toolRedactionPolicy";

describe("toolClearKinds", () => {
  it("clears nothing for an ordinary connector (all PII stays redacted)", () => {
    expect(toolClearKinds("gmail", false)).toEqual([]);
    expect(toolClearKinds("stripe", false)).toEqual([]);
    expect(toolClearKinds(undefined, false)).toEqual([]);
  });

  it("clears the full SEARCH set for a public-search connector", () => {
    expect(toolClearKinds("firecrawl", true)).toEqual(SEARCH_CLEAR);
    expect(SEARCH_CLEAR).toEqual(expect.arrayContaining(["location", "company", "path", "apikey", "secret"]));
  });

  it("keeps secret/apikey/path REDACTED for the browser (only clears place/org)", () => {
    const clear = toolClearKinds("browser", false);
    expect(clear).toEqual(BROWSER_CLEAR);
    // The privacy fix: a credential visible on an authenticated page must NOT be cleared.
    expect(clear).not.toContain("secret");
    expect(clear).not.toContain("apikey");
    expect(clear).not.toContain("path");
    expect(clear).toEqual(["location", "company"]);
  });

  it("browser rule wins even if it were somehow also a search category", () => {
    // connectorId "browser" is matched first, so it can never inherit SEARCH_CLEAR.
    expect(toolClearKinds("browser", true)).toEqual(BROWSER_CLEAR);
  });

  it("the batch web reader (web_fetch_many) gets the NARROW browser policy, not SEARCH", () => {
    // It reads untrusted public pages, so place/org are content but secret/apikey/path
    // stay REDACTED (a public page can still expose a leaked key).
    const clear = toolClearKinds("web_fetch_many", false);
    expect(clear).toEqual(BROWSER_CLEAR);
    expect(clear).not.toContain("secret");
    expect(clear).not.toContain("apikey");
    expect(clear).not.toContain("path");
  });

  it("a THIRD-PARTY browser (isBrowser) also gets the NARROW BROWSER_CLEAR, not SEARCH", () => {
    // A BrowserMCP-style connector isn't in the catalog (isSearchConnector=false) and its
    // id isn't "browser", but the caller flags it as a browser via the `browser_*` tool
    // name — it can hit authenticated pages, so secret/apikey/path STAY redacted.
    const clear = toolClearKinds("browsermcp", false, true);
    expect(clear).toEqual(BROWSER_CLEAR);
    expect(clear).not.toContain("secret");
    expect(clear).not.toContain("path");
  });
});

describe("pythonFrameworkKeep", () => {
  it("spares library cache artifacts + the app's own name (never user data)", () => {
    // yfinance/requests_cache announce their cache dir on stdout; the app name rides
    // userData paths libs echo. Faking them derails the model's follow-up code.
    const keep = pythonFrameworkKeep(`cache: /tmp/yfinance_cache (${BRAND.name})`);
    expect(keep).toContain("yfinance_cache");
    expect(keep).toContain("/tmp/yfinance_cache");
    expect(keep).toContain(BRAND.slug);
  });

  it("keeps the bundled package + import identifiers in clear", () => {
    const keep = pythonFrameworkKeep("import matplotlib.pyplot as plt\nimport numpy as np");
    for (const id of ["numpy", "np", "matplotlib", "pyplot", "plt", "scipy", "pandas", "yfinance", "python"]) {
      expect(keep).toContain(id);
    }
  });

  it("harvests submodule names from a site-packages traceback path (no hand-list)", () => {
    // The exact path from the reported bug — scipy/linalg/_lib/... were faked as secrets.
    const trace =
      `File "/Applications/${BRAND.name}.app/Contents/Resources/python-runtime/python/lib/python3.12/` +
      'site-packages/scipy/_lib/array_api_compat/numpy/__init__.py", line 3\n' +
      'File ".../site-packages/scipy/linalg/_basic.py"\n' +
      'File ".../site-packages/numpy/testing/_private/utils.py"';
    const keep = pythonFrameworkKeep(trace);
    for (const id of ["scipy", "_lib", "array_api_compat", "linalg", "_basic", "testing", "_private", "utils"]) {
      expect(keep).toContain(id);
    }
  });

  it("does NOT keep a real name / arbitrary token the code printed (still redacted)", () => {
    // Leak-safe: only known framework tokens are spared; a name in stdout stays redactable.
    const keep = pythonFrameworkKeep('print("client: Julien Sabourdin")\n# result: AcmeCorp');
    expect(keep).not.toContain("Julien");
    expect(keep).not.toContain("Sabourdin");
    expect(keep).not.toContain("AcmeCorp");
  });

  // ── keep-list INJECTION (fake→real oracle) ────────────────────────────────
  // The model authors the code and `mcpAgent` runs it UN-REDACTED, so a prompt-injected
  // `print("site-packages/<fake>")` lands the REAL value on stdout. Sparing it would tell
  // the model what that fake maps to — repeat per entry = the whole vault. Each guard is
  // pinned separately so removing any one turns a test RED.
  it("guard 1 — an unanchored `site-packages/<x>` injects nothing", () => {
    const keep = pythonFrameworkKeep('print("site-packages/Julien")');
    expect(keep).not.toContain("Julien");
  });

  it("guard 2 — a KNOWN-package-prefixed capitalised value is not harvestable", () => {
    // The attacker prefixes a real package to satisfy guard 1; the module-shape guard holds.
    const keep = pythonFrameworkKeep('print("site-packages/scipy/Marie")');
    expect(keep).toContain("scipy");
    expect(keep).not.toContain("Marie");
  });

  it("guard 3 — a value the VAULT holds as real is never spared, even module-shaped", () => {
    // Lowercase + package-prefixed clears guards 1-2; the vault is the backstop, and an
    // oracle needs a vault entry by construction (the fake it echoes maps back to one).
    const text = 'print("site-packages/scipy/aurora")';
    expect(pythonFrameworkKeep(text)).toContain("aurora"); // module-shaped: passes 1+2
    const keep = pythonFrameworkKeep(text, ["aurora"]); // …but it IS a real vault value
    expect(keep).not.toContain("aurora");
    expect(keep).toContain("scipy"); // the genuine framework token still spared
  });

  it("guard 3 is case-insensitive (the vault's casing need not match stdout's)", () => {
    expect(pythonFrameworkKeep('print("site-packages/scipy/aurora")', ["Aurora"])).not.toContain(
      "aurora",
    );
  });

  // ── exchange tickers + pandas artifacts (the ETF-run false positives) ─────────
  it("spares public exchange tickers — suffixed form AND the bare code", () => {
    // The reported scramble: a NER tagged the ETF code `PNAS` as an org/name.
    const keep = pythonFrameworkKeep("'PNAS': 'PNAS.PA', 'CW8': 'CW8.PA'  # Amundi");
    expect(keep).toContain("PNAS.PA");
    expect(keep).toContain("PNAS");
    expect(keep).toContain("CW8.PA");
    expect(keep).toContain("CW8");
  });

  it("does NOT spare a lone ALL-CAPS acronym that never appears suffixed", () => {
    // Only the co-occurrence with an exchange suffix proves it's a ticker.
    expect(pythonFrameworkKeep("client: ACME reference NASA")).not.toContain("ACME");
    expect(pythonFrameworkKeep("client: ACME reference NASA")).not.toContain("NASA");
  });

  it("guard 3 still wins over a ticker shape (a vault-real ticker stays redacted)", () => {
    const keep = pythonFrameworkKeep("'X': 'X.PA'", ["X.PA", "X"]);
    expect(keep).not.toContain("X.PA");
    expect(keep).not.toContain("X");
  });

  it("spares pandas/yfinance output artifacts (the `Name:…dtype:float64` person false-positive)", () => {
    const keep = pythonFrameworkKeep("Name: CW8.PA, dtype: float64");
    expect(keep).toEqual(expect.arrayContaining(["Name", "dtype", "float64", "CW8.PA"]));
  });
});

describe("isPythonFrameworkArtifact (one-shot vault cleanup predicate — strict)", () => {
  it("flags a bundled-runtime / site-packages path (any category)", () => {
    expect(
      isPythonFrameworkArtifact(`/Applications/${BRAND.name}.app/Contents/Resources/python-runtime/x.py`, "path"),
    ).toBe(true);
    expect(isPythonFrameworkArtifact(".../site-packages/scipy/linalg/_basic.py", "path")).toBe(true);
    expect(isPythonFrameworkArtifact("/tmp/yfinance_cache", "path")).toBe(true);
    expect(isPythonFrameworkArtifact("/tmp/yfinance.cache", "path")).toBe(true);
    expect(
      isPythonFrameworkArtifact(`/Users/x/Library/Application Support/${BRAND.name}/python/runs/abc/main.py`, "path"),
    ).toBe(true);
  });

  it("flags an unambiguous top-level package name", () => {
    expect(isPythonFrameworkArtifact("scipy", "company")).toBe(true);
    expect(isPythonFrameworkArtifact("numpy", "secret")).toBe(true);
    expect(isPythonFrameworkArtifact("matplotlib", "apikey")).toBe(true);
  });

  it("flags a snake module id ONLY when mis-tagged secret/apikey", () => {
    expect(isPythonFrameworkArtifact("linalg", "secret")).toBe(true);
    expect(isPythonFrameworkArtifact("_lib", "secret")).toBe(true);
    expect(isPythonFrameworkArtifact("array_api_compat", "apikey")).toBe(true);
    // Same token under a hard-PII category is NOT touched (defensive — never a false match).
    expect(isPythonFrameworkArtifact("linalg", "company")).toBe(false);
  });

  it("NEVER flags a real PII value (destructive-safe)", () => {
    expect(isPythonFrameworkArtifact("Julien Sabourdin", "name")).toBe(false);
    expect(isPythonFrameworkArtifact("acme", "company")).toBe(false); // a real lowercase company
    expect(isPythonFrameworkArtifact("jean@example.com", "email")).toBe(false);
    expect(isPythonFrameworkArtifact("sk-9fA2Xb7Qz", "secret")).toBe(false); // real high-entropy key
    expect(isPythonFrameworkArtifact("/Users/julien/Documents/clients.xlsx", "path")).toBe(false);
  });
});

describe("toolDiscoveryKeep — exempte la métadonnée de découverte d'outils", () => {
  // The real `info execute-sql` result from the reported log (`ClickHouse → Brightpath`,
  // `execute-sql → jade-tom`): an info block with a schema → must be recognised as discovery.
  const infoBlock =
    "name: execute-sql\ntitle: Execute SQL query\ndescription: |-\n  Executes HogQL — PostHog's variant of SQL over ClickHouse.\ninputSchema: '{\"type\":\"object\"}'";
  const toolList = JSON.stringify(["execute-sql", "read-data-schema", "query-trends", "find-organizations", "search-issues", "dashboards-get-all", "insights-list", "query-funnel", "insight-query"]);

  it("reconnaît un bloc info / un listing d'outils comme DÉCOUVERTE", () => {
    expect(isToolDiscoveryResult(infoBlock)).toBe(true);
    expect(isToolDiscoveryResult(toolList)).toBe(true);
    expect(isToolDiscoveryResult('{"matches":["insight-query","query-trends","query-funnel","execute-sql","query-paths","query-logs","query-retention","query-lifecycle"]}')).toBe(true);
  });

  it("garde en clair les NOMS D'OUTILS + termes techniques (la cause de la boucle)", () => {
    const keep = toolDiscoveryKeep(infoBlock);
    expect(keep).toContain("execute-sql");
    expect(keep).toContain("HogQL");
    expect(keep).toContain("ClickHouse");
    // From the tool LISTING, every kebab name is kept.
    expect(toolDiscoveryKeep(toolList)).toContain("read-data-schema");
  });

  it("un résultat de DONNÉES (pas une découverte) n'est PAS exempté", () => {
    // A `call dashboards-get-all` returns dashboard NAMES = data.
    const data = 'count: 1\nresults:\n  - name: Tableau de bord de Camille\n    pinned: true';
    expect(isToolDiscoveryResult(data)).toBe(false);
    expect(toolDiscoveryKeep(data)).toEqual([]);
    // An email in a Gmail result: never discovery, never exempted.
    expect(toolDiscoveryKeep("De: camille.vernay@exemple.fr\nObjet: RDV")).toEqual([]);
  });

  it("GUARD vault : ne garde JAMAIS en clair une valeur que le vault tient pour réelle", () => {
    // Edge case: a kebab slug that's actually a real, known PII value.
    const keep = toolDiscoveryKeep(infoBlock + "\nclient-secret-acme", ["client-secret-acme"]);
    expect(keep).not.toContain("client-secret-acme");
    expect(keep).toContain("execute-sql"); // the rest holds
  });

  it("ne garde QUE des formes identifiant-d'API, jamais une PII dure", () => {
    // Even inside a discovery block, a name/email (non-kebab shapes) is not kept.
    const keep = toolDiscoveryKeep(infoBlock + "\nauteur: Jean Rebour <jean@exemple.fr>");
    expect(keep).not.toContain("Jean Rebour");
    expect(keep.some((k) => k.includes("@"))).toBe(false);
  });
});

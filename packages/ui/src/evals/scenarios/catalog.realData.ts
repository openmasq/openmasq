// « DATA ANALYSIS » scenarios (`real-data-*`) — web→python chains and pure analysis:
// the model must COLLECT figures (live web or inline data), STRUCTURE them, compute,
// and produce a FIGURE in the sandbox. In mock they run on fixtures (satisfiability);
// under OPENMASQ_EVAL_REAL_WEB/_REAL_PY=1 it's the real web and the real baked CPython
// (pandas/numpy/matplotlib present).

import { calls, says } from "../mockModel";
import { lastRealPy, realPyEnabled } from "../realWorld";
import type { Scenario } from "./index";

const DDG = "https://html.duckduckgo.com/html/?q=";

const WEB_GUIDE =
  " (Tu disposes de `web_fetch_many` : pour CHERCHER, récupère d'abord une page de résultats — p.ex. https://html.duckduckgo.com/html/?q=… — puis, si besoin, les pages pertinentes.)";

/** Mock-mode fixture pages — the real thing bypasses them. */
const PAGES: Record<string, string> = {
  [`${DDG}ETF%20PEA%20plus%20performants%202026`]:
    "Classement ETF PEA 2026 — Amundi PEA Nasdaq-100 +28 %, Lyxor PEA S&P 500 +19 %, " +
    "BNP Easy CAC 40 +11 %, Amundi PEA MSCI World +14 %, Lyxor PEA Europe 600 +9 %.",
  [`${DDG}INSEE%20inflation%20France%20indice%20des%20prix`]:
    "INSEE — Indice des prix à la consommation. Inflation annuelle : 2024 2,0 %, 2025 1,4 %, juin 2026 1,1 %.",
  [`${DDG}population%20plus%20grandes%20villes%20Normandie`]:
    "Normandie — Le Havre 165 830, Rouen 114 083, Caen 108 200, Cherbourg 78 549, Évreux 46 349 habitants.",
};

/** The shared assert for FIGURE scenarios: for real, the sandbox must have produced
 *  a non-trivial PNG (the mock only proves satisfiability). A PNG the model saved
 *  ITSELF into the cwd counts too — in the app it's a DELIVERABLE handed to the
 *  user, exactly like a collected figure. */
function assertRealFigure(): void {
  if (!realPyEnabled()) return;
  const runs = lastRealPy.all.length ? lastRealPy.all : lastRealPy.result ? [lastRealPy.result] : [];
  if (!runs.some((r) => r.ok)) {
    throw new Error(`sandbox python en échec : ${runs.at(-1)?.stderr?.slice(0, 300) ?? "(aucun run)"}`);
  }
  const pngs = runs.flatMap((r) => [...r.images, ...r.files.filter((f) => f.name.toLowerCase().endsWith(".png"))]);
  if (!pngs.some((p) => p.base64.length >= 2_000)) {
    throw new Error("aucune figure réelle produite par la sandbox");
  }
}

const PY_FIG = { code: (v: unknown) => typeof v === "string" && /matplotlib|plt\.|\.plot|seaborn/i.test(v) };

export { assertRealFigure };

export const REAL_DATA_SCENARIOS: Scenario[] = [
  // 1. FINANCE: web search → extraction of 5 numeric rows → comparative chart.
  //    The difficulty is the CHAIN (the code's figures come from the web, not the prompt)
  //    and the implicit sort (« les plus performants »).
  {
    name: "real-data-etf-pea",
    prompts: [
      "Trace-moi les 5 ETF les plus performants de l'année 2026 compatibles avec un PEA : cherche leurs performances sur le web, puis génère un graphique en barres comparatif (nom → performance %) avec run_python." +
        WEB_GUIDE,
    ],
    servers: [],
    webPages: PAGES,
    python: () => ({ ok: true, stdout: "figure générée", stderr: "", images: [{ name: "figure_1.png", base64: "iVBORw0KGgoAAAANSUhEUg==" }], files: [] }),
    secrets: [],
    spec: {
      sequence: [{ tool: "web_fetch_many" }, { tool: "run_python", where: PY_FIG }],
      answer: (s) => /etf|pea/i.test(s) && !/je ne peux pas/i.test(s),
    },
    mock: [
      calls({ name: "web_fetch_many", args: { urls: [`${DDG}ETF%20PEA%20plus%20performants%202026`] } }),
      calls({
        name: "run_python",
        args: { code: "import matplotlib.pyplot as plt\nplt.bar(['Nasdaq-100','S&P 500','MSCI World','CAC 40','Europe 600'],[28,19,14,11,9])\nplt.ylabel('%')\nplt.title('ETF PEA 2026')" },
      }),
      says("Voici les 5 ETF PEA les plus performants de 2026, graphique en barres généré."),
    ],
    always: assertRealFigure,
  },

  // 2. INSTITUTIONAL REPORT: find the INSEE data, summarize it, chart it.
  //    Measures reading a DENSE page (the insee.fr site) and the fidelity of the figures.
  {
    name: "real-data-insee-inflation",
    prompts: [
      "Consulte le site de l'INSEE pour trouver un rapport détaillé sur l'inflation en France (indice des prix à la consommation) : résume les chiffres clés, puis génère avec run_python un graphique de l'évolution de l'inflation annuelle sur les dernières années." +
        WEB_GUIDE,
    ],
    servers: [],
    webPages: PAGES,
    python: () => ({ ok: true, stdout: "figure générée", stderr: "", images: [{ name: "figure_1.png", base64: "iVBORw0KGgoAAAANSUhEUg==" }], files: [] }),
    secrets: [],
    spec: {
      sequence: [{ tool: "web_fetch_many" }, { tool: "run_python", where: PY_FIG }],
      answer: (s) => /inflation|ipc|prix/i.test(s) && !/je ne peux pas/i.test(s),
    },
    mock: [
      calls({ name: "web_fetch_many", args: { urls: [`${DDG}INSEE%20inflation%20France%20indice%20des%20prix`] } }),
      calls({
        name: "run_python",
        args: { code: "import matplotlib.pyplot as plt\nplt.plot([2024,2025,2026],[2.0,1.4,1.1],marker='o')\nplt.title('Inflation France (INSEE)')" },
      }),
      says("D'après l'INSEE, l'inflation ralentit : 2,0 % (2024), 1,4 % (2025), 1,1 % (juin 2026). Graphique généré."),
    ],
    always: assertRealFigure,
  },

  // 3. PURE ANALYSIS on INLINE data: descriptive stats + trend + figure.
  //    No web — measures the quality of the analysis CODE (pandas/numpy available) and
  //    the numeric restitution (mean, extremes, growth).
  {
    name: "real-data-analyse-ca",
    prompts: [
      "Voici le chiffre d'affaires mensuel 2025 de mon agence (k€) : jan 12,4 · fév 9,8 · mar 15,1 · avr 14,2 · mai 18,9 · juin 16,4 · juil 8,1 · août 6,5 · sept 19,7 · oct 21,3 · nov 22,8 · déc 24,1. Analyse ces données avec run_python : moyenne, meilleur et pire mois, croissance décembre vs janvier, puis trace la courbe avec sa ligne de tendance.",
    ],
    servers: [],
    python: () => ({
      ok: true,
      stdout: "moyenne 15.8 k€ | meilleur déc 24.1 | pire août 6.5 | croissance +94 %",
      stderr: "",
      images: [{ name: "figure_1.png", base64: "iVBORw0KGgoAAAANSUhEUg==" }],
      files: [],
    }),
    secrets: [],
    spec: {
      sequence: [{ tool: "run_python", where: PY_FIG }],
      answer: (s) => /moyenne|meilleur|croissance/i.test(s) && /\d/.test(s),
    },
    mock: [
      calls({
        name: "run_python",
        args: {
          code: "import numpy as np, matplotlib.pyplot as plt\nca=[12.4,9.8,15.1,14.2,18.9,16.4,8.1,6.5,19.7,21.3,22.8,24.1]\nprint('moyenne',round(np.mean(ca),1))\nx=np.arange(12)\nplt.plot(x,ca,marker='o')\nplt.plot(x,np.poly1d(np.polyfit(x,ca,1))(x),'--')\nplt.title('CA 2025')",
        },
      }),
      says("Moyenne 15,8 k€, meilleur mois décembre (24,1), pire août (6,5), croissance +94 % sur l'année — courbe et tendance tracées."),
    ],
    always: assertRealFigure,
  },

  // 4. CHAIN web → data → CALCULATION: the figures come from the web, the analysis
  //    (relative shares) is computed, the figure produced. The trap being measured:
  //    copying web figures into code WITHOUT inventing them.
  {
    name: "real-data-villes-normandie",
    prompts: [
      "Cherche la population des 5 plus grandes villes de Normandie, puis avec run_python calcule la part relative de chacune (en % du total des cinq) et trace un diagramme circulaire." +
        WEB_GUIDE,
    ],
    servers: [],
    webPages: PAGES,
    python: () => ({ ok: true, stdout: "parts calculées", stderr: "", images: [{ name: "figure_1.png", base64: "iVBORw0KGgoAAAANSUhEUg==" }], files: [] }),
    secrets: [],
    spec: {
      sequence: [{ tool: "web_fetch_many" }, { tool: "run_python", where: { code: (v) => typeof v === "string" && /pie|circulaire|plt\./i.test(v) } }],
      answer: (s) => /havre|rouen|caen/i.test(s) && !/je ne peux pas/i.test(s),
    },
    mock: [
      calls({ name: "web_fetch_many", args: { urls: [`${DDG}population%20plus%20grandes%20villes%20Normandie`] } }),
      calls({
        name: "run_python",
        args: { code: "import matplotlib.pyplot as plt\nplt.pie([165830,114083,108200,78549,46349],labels=['Le Havre','Rouen','Caen','Cherbourg','Évreux'],autopct='%1.0f%%')" },
      }),
      says("Le Havre domine (32 %), devant Rouen (22 %) et Caen (21 %) — diagramme circulaire généré."),
    ],
    always: assertRealFigure,
  },
];

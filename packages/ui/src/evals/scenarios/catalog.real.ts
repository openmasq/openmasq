// "REAL WORLD" scenarios (`real-*`) — live INTERNET search (4 types) and
// GRAPH GENERATION executed in the Python sandbox. In mock mode (scenarios.test)
// they run on fixtures (satisfiability); under OPENMASQ_EVAL_REAL_WEB=1 /
// _REAL_PY=1 the fixtures are bypassed by the real world. The verdicts
// deliberately stay STRUCTURAL (the live web isn't deterministic); the
// security (leak, navigation derived from a fake) is still asserted on every run.

import { calls, says, } from "../mockModel";
import { assertRealFigure } from "./catalog.realData";
import type { Scenario } from "./index";

const DDG = "https://html.duckduckgo.com/html/?q=";

/** Fixture pages for mock mode — in real mode, `realFetchMany` ignores them. */
const PAGES: Record<string, string> = {
  [`${DDG}derni%C3%A8re%20version%20LTS%20de%20Node.js`]: "Node.js — Releases. La version LTS actuelle est la 24.x « Krypton ».",
  [`${DDG}population%20de%20Rouen`]: "Rouen — Wikipédia. La commune comptait 114 083 habitants.",
  [`${DDG}AbortSignal.timeout%20fetch`]: "MDN — AbortSignal.timeout(ms) crée un signal qui s'annule après le délai.",
  [`${DDG}Karl%20Studio%20agence`]: "Karl Studio — agence de design, Évreux. Identité visuelle et sites web.",
};

const WEB_GUIDE =
  " (Tu disposes de `web_fetch_many` : pour CHERCHER, récupère d'abord une page de résultats — p.ex. https://html.duckduckgo.com/html/?q=… — puis, si besoin, les pages pertinentes.)";

const webScenario = (
  name: string,
  prompt: string,
  answerRe: RegExp,
  mockAnswer: string,
  extra?: Partial<Scenario>,
): Scenario => ({
  name,
  prompts: [prompt + WEB_GUIDE],
  servers: [],
  webPages: PAGES,
  secrets: [],
  spec: {
    sequence: [{ tool: "web_fetch_many" }],
    // In real mode the content varies — the verdict is STRUCTURAL (searched, answered
    // non-empty without refusing); the expected form only applies to the mock.
    answer: (s) => s.trim().length > 0 && !/je ne peux pas/i.test(s) && answerRe.test(s),
  },
  mock: [
    (req) => {
      const user = String([...req.messages].reverse().find((m) => m.role === "user")?.content ?? "");
      const q = /« (.+?) »|(?:cherche|recherche|trouve)\s+(.{4,60}?)(?:\.|$)/i.exec(user);
      const query = encodeURIComponent((q?.[1] ?? q?.[2] ?? "test").trim()).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      return calls({ name: "web_fetch_many", args: { urls: [`${DDG}${query}`] } });
    },
    says(mockAnswer),
  ],
  ...extra,
});

export const REAL_SCENARIOS: Scenario[] = [
  // 1. NEWS / data that changes — the "verify before answering" reflex.
  webScenario(
    "real-web-actualite",
    "Quelle est la dernière version LTS de Node.js ? Vérifie sur le web avant de répondre.",
    /node/i,
    "D'après la page consultée, la dernière LTS de Node.js est la 24.x.",
  ),
  // 2. Encyclopedic FACT — one search, one extraction, one number.
  webScenario(
    "real-web-factuel",
    "Quelle est la population de Rouen ? Cherche sur le web et cite le chiffre.",
    /rouen|\d{2,3}[  .]?\d{3}/i,
    "Rouen compte environ 114 083 habitants (source consultée).",
  ),
  // 3. TECHNICAL / documentation — the query is jargon, the reply a usage.
  webScenario(
    "real-web-technique",
    "Cherche sur le web comment utiliser AbortSignal.timeout avec fetch en JavaScript, et donne un exemple d'une ligne.",
    /abortsignal|timeout/i,
    "Exemple : fetch(url, { signal: AbortSignal.timeout(5000) }).",
  ),
  // 4. REDACTED ENTITY — rule 11 on the LIVE web: the model only holds the
  //    fake, the outgoing query must carry the REAL value.
  webScenario(
    "real-web-entite-redacted",
    "Cherche sur le web des informations sur l'agence « Karl Studio » et résume ce que tu trouves en une phrase.",
    /./,
    "C'est une agence de design normande.",
    {
      ner: { "Karl Studio": "company" },
      rules: { company: true },
      // NO global `secrets`: on the LIVE web the PUBLIC name comes back in the
      // results and the SEARCH_CLEAR policy leaves it in clear (it's the substance
      // of the answer) — so the model may legitimately rewrite it. The exact product
      // invariant is finer: the wire USER PROMPT only ever carries the fake
      // (asserted in `always`), and the OUTGOING query carries the real value.
      secrets: [],
      mock: [
        // The model only holds the FAKE (between « … » in its prompt) — it forges its
        // query on it; the wire must un-redact it back to the real value.
        (req) => {
          const user = String([...req.messages].reverse().find((m) => m.role === "user")?.content ?? "");
          const fake = /« (.+?) »/.exec(user)?.[1] ?? "INCONNU";
          return calls({ name: "web_fetch_many", args: { urls: [`${DDG}${encodeURIComponent(`${fake} agence`)}`] } });
        },
        says("C'est une agence de design normande."),
      ],
      always: (run) => {
        // 1. The wire USER message (1st model:in) NEVER carries the real value.
        const first = run.transcript.events.find((e) => e.t === "model:in");
        const userLeg = first && first.t === "model:in"
          ? first.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")
          : "";
        if (/karl studio/i.test(userLeg)) {
          throw new Error("FUITE : la vraie valeur est dans le prompt utilisateur wire");
        }
        // 2. The DISPATCHED query carries the real value (encoded or not) — never the fake.
        const urls = run.transcript.events
          .filter((e) => e.t === "tool:out" && e.name === "web_fetch_many")
          .map((e) => decodeURIComponent(String((e as { args: { url?: unknown } }).args.url ?? "")));
        if (!urls.some((u) => /karl[ +%20]?studio/i.test(u))) {
          throw new Error(`aucune requête web ne porte la vraie valeur — urls: ${urls.join(" · ")}`);
        }
      },
    },
  ),
  // 5. PYTHON GRAPH — REAL execution in the sandbox (seatbelt + baked runtime):
  //    the model's code must produce a FIGURE, checked against the collected PNGs.
  {
    name: "real-py-graphe",
    prompts: [
      "Trace un graphique en barres des montants par client : Karl Studio 18 000 €, Atelier Torbel 7 500 €, Studio Velin 3 200 €. Utilise run_python.",
    ],
    servers: [],
    python: () => ({
      ok: true,
      stdout: "figure générée",
      stderr: "",
      images: [{ name: "figure_1.png", base64: "iVBORw0KGgoAAAANSUhEUg==" }],
      files: [],
    }),
    secrets: [],
    spec: {
      sequence: [{ tool: "run_python", where: { code: (v) => typeof v === "string" && /matplotlib|seaborn|plt|plot/i.test(v) } }],
      answer: (s) => s.trim().length > 0,
    },
    mock: [
      calls({
        name: "run_python",
        args: { code: "import matplotlib.pyplot as plt\nplt.bar(['Karl Studio','Atelier Torbel','Studio Velin'],[18000,7500,3200])\nplt.title('Montants par client')" },
      }),
      says("Voici le graphique des montants par client."),
    ],
    // In REAL mode: at least ONE execution of the run must have produced a non-trivial PNG
    // (figure collected OR saved by the model in the cwd — a deliverable).
    always: assertRealFigure,
  },
];

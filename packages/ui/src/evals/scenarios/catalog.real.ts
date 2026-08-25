// Scénarios « MONDE RÉEL » (`real-*`) — la recherche INTERNET vivante (4 types) et la
// GÉNÉRATION DE GRAPHE exécutée dans la sandbox Python. En mode mock (scenarios.test)
// ils tournent sur fixtures (satisfiabilité) ; sous OPENMASQ_EVAL_REAL_WEB=1 /
// _REAL_PY=1 les fixtures sont court-circuitées par le vrai monde. Les verdicts
// restent volontairement STRUCTURELS (le web vivant n'est pas déterministe) ; la
// sécurité (fuite, navigation dérivée d'un fake) reste assertée à chaque run.

import { calls, says, type MockRequest } from "../mockModel";
import { assertRealFigure } from "./catalog.realData";
import type { Scenario } from "./index";

const DDG = "https://html.duckduckgo.com/html/?q=";

/** Pages fixtures pour le mode mock — en réel, `realFetchMany` les ignore. */
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
    // En réel le contenu varie — le verdict est STRUCTUREL (a cherché, a répondu
    // non-vide sans refuser) ; la forme attendue ne s'applique qu'au mock.
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
  // 1. ACTUALITÉ / donnée qui évolue — le réflexe « vérifier avant de répondre ».
  webScenario(
    "real-web-actualite",
    "Quelle est la dernière version LTS de Node.js ? Vérifie sur le web avant de répondre.",
    /node/i,
    "D'après la page consultée, la dernière LTS de Node.js est la 24.x.",
  ),
  // 2. FACTUEL encyclopédique — une recherche, une extraction, un chiffre.
  webScenario(
    "real-web-factuel",
    "Quelle est la population de Rouen ? Cherche sur le web et cite le chiffre.",
    /rouen|\d{2,3}[  .]?\d{3}/i,
    "Rouen compte environ 114 083 habitants (source consultée).",
  ),
  // 3. TECHNIQUE / documentation — la requête est du jargon, la réponse un usage.
  webScenario(
    "real-web-technique",
    "Cherche sur le web comment utiliser AbortSignal.timeout avec fetch en JavaScript, et donne un exemple d'une ligne.",
    /abortsignal|timeout/i,
    "Exemple : fetch(url, { signal: AbortSignal.timeout(5000) }).",
  ),
  // 4. ENTITÉ REDACTED — règle 11 sur le web VIVANT : le modèle ne tient que le
  //    fake, la requête sortante doit porter la VRAIE valeur.
  webScenario(
    "real-web-entite-redact",
    "Cherche sur le web des informations sur l'agence « Karl Studio » et résume ce que tu trouves en une phrase.",
    /./,
    "C'est une agence de design normande.",
    {
      ner: { "Karl Studio": "company" },
      rules: { company: true },
      // PAS de `secrets` global : sur le web VIVANT le nom PUBLIC revient dans les
      // résultats et la politique SEARCH_CLEAR le laisse en clair (c'est la substance
      // de la réponse) — le modèle peut donc légitimement le réécrire. L'invariant
      // produit exact est plus fin : le PROMPT UTILISATEUR wire ne porte que le fake
      // (assert dans `always`), et la query SORTANTE porte la vraie valeur.
      secrets: [],
      mock: [
        // Le modèle ne tient que le FAKE (entre « … » dans son prompt) — il forge sa
        // query dessus ; le wire doit la un-redact vers la vraie valeur.
        (req) => {
          const user = String([...req.messages].reverse().find((m) => m.role === "user")?.content ?? "");
          const fake = /« (.+?) »/.exec(user)?.[1] ?? "INCONNU";
          return calls({ name: "web_fetch_many", args: { urls: [`${DDG}${encodeURIComponent(`${fake} agence`)}`] } });
        },
        says("C'est une agence de design normande."),
      ],
      always: (run) => {
        // 1. Le message UTILISATEUR wire (1er model:in) ne porte JAMAIS la vraie valeur.
        const first = run.transcript.events.find((e) => e.t === "model:in");
        const userLeg = first && first.t === "model:in"
          ? first.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n")
          : "";
        if (/karl studio/i.test(userLeg)) {
          throw new Error("FUITE : la vraie valeur est dans le prompt utilisateur wire");
        }
        // 2. La query DISPATCHÉE porte la vraie valeur (encodée ou non) — jamais le fake.
        const urls = run.transcript.events
          .filter((e) => e.t === "tool:out" && e.name === "web_fetch_many")
          .map((e) => decodeURIComponent(String((e as { args: { url?: unknown } }).args.url ?? "")));
        if (!urls.some((u) => /karl[ +%20]?studio/i.test(u))) {
          throw new Error(`aucune requête web ne porte la vraie valeur — urls: ${urls.join(" · ")}`);
        }
      },
    },
  ),
  // 5. GRAPHE PYTHON — exécution RÉELLE dans la sandbox (seatbelt + runtime baké) :
  //    le code du modèle doit produire une FIGURE, vérifiée sur les PNG collectés.
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
    // En RÉEL : au moins UNE exécution du run doit avoir produit un PNG non trivial
    // (figure collectée OU sauvegardée par le modèle dans le cwd — un livrable).
    always: assertRealFigure,
  },
];

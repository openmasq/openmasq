import { BRAND } from "@openmasq/branding";
import type { ToolDef } from "@openmasq/llm";
// Préfixe des helpers Python définis par le préambule du runtime (apps/desktop) —
// des noms RUNTIME côté sandbox, donc dérivés de la marque, jamais littéraux ici.
const PY = BRAND.slug;


/**
 * The loop's own META-TOOLS — intercepted in `mcpAgent.ts`, never proxied to an MCP
 * server. Pure data, extracted as a sibling (the loop file is over the LOC cap and
 * rule 1 says new weight lands beside it, not in it). The names are deliberately
 * un-prefixed; `INTERCEPTED_META_TOOLS` is what keeps `canonicalToolName` from letting
 * a connector advertising e.g. `x__run_python` CAPTURE an interception.
 */

/** The code-interpreter tool, offered when the host exposes `run_python`. Intercepted
 *  in the loop (never proxied to an MCP server) — it runs the code in the sandbox and
 *  feeds stdout back to the model while showing any figures inline to the user. */
export const RUN_PYTHON_DEF: ToolDef = {
  name: "run_python",
  description:
    "Exécute du code Python dans un bac à sable et renvoie la sortie stdout. Paquets pré-installés : numpy, pandas, scipy, matplotlib, seaborn (graphiques), yfinance, requests, fpdf2 (PDF), openpyxl (Excel), python-docx (Word). C'est le SEUL bon outil pour CALCULER, analyser des données, TRACER des graphiques et GÉNÉRER des fichiers (PDF/Excel/Word) — ne passe JAMAIS par un connecteur de fichiers (`write_file`) ni par le navigateur. Pour des COURS d'actions/ETF, utilise le helper `" + PY + "_prices(\"SPY VOO QQQ\", period=\"1y\")` — DÉJÀ défini dans l'environnement, appelle-le DIRECTEMENT (aucun `import`, ce n'est PAS un module) ; il renvoie un DataFrame propre, une colonne par ticker. Tu peux lui passer des ISIN (ex `FR0011871110`) : il résout le ticker Yahoo tout seul — inutile de deviner le mnémonique ticker par ticker. N'appelle PAS `yf.download()` ni `yf.Ticker()` toi-même. ⚠️ Réseau RESTREINT à Yahoo Finance (via yfinance/" + PY + "_prices) : AUCUN accès web général — un `requests`/`urllib` vers un site quelconque ÉCHOUE ; pour consulter le web, utilise le navigateur ou `web_fetch_many`, ramène les CHIFFRES, puis calcule ici. Tu NE PEUX PAS installer de paquets (pas de pip/subprocess — aucun accès PyPI) : utilise uniquement ceux listés. Chaque figure seaborn/matplotlib est AUTOMATIQUEMENT affichée — pas besoin de plt.show() ; tout fichier enregistré dans le dossier courant est AUTOMATIQUEMENT remis à l'utilisateur.",
  parameters: {
    type: "object",
    properties: {
      code: { type: "string", description: "Le code Python à exécuter." },
    },
    required: ["code"],
    additionalProperties: false,
  },
};

/** The MÉMOIRE lookup, offered when the host wires `searchMemory`. INTERCEPTED (never
 *  proxied to a server): the store is local + REAL-valued, so the loop un-redacts the
 *  query itself (rule 11 — the model only holds fakes) and re-redacted the result. */
export const MEMORY_SEARCH_DEF: ToolDef = {
  name: "memory_search",
  description:
    "Rechercher dans la mémoire locale de l'utilisateur : des faits durables notés lors de " +
    "conversations précédentes (personnes, organisations, projets, préférences). Utilise cet " +
    "outil quand la demande fait référence à quelque chose que l'utilisateur suppose connu " +
    "(un client, un projet, une habitude) et que le contexte ne le contient pas. Mets dans " +
    "`query` les noms tels qu'ils apparaissent dans la conversation. " +
    // ⚠️ Sans cette phrase le modèle ne voit qu'un outil de LECTURE, en conclut qu'il ne peut
    // pas retenir, et le dit : « Je n'ai pas d'outil pour enregistrer en mémoire » — puis
    // propose Notion. C'est faux ET décourageant : l'app A retenu, hors de la boucle. Un outil
    // d'écriture serait le mauvais correctif (le modèle ne voit que des faux, la mémoire est
    // stockée en RÉEL) ; ce qu'il lui faut, c'est savoir que ce n'est pas son travail.
    "ÉCRIRE en mémoire n'est PAS ton travail et ne demande aucun outil : l'application " +
    "enregistre elle-même, automatiquement, quand l'utilisateur demande de retenir quelque " +
    "chose (« retiens ça », « note-le en mémoire », « mémorise »). N'affirme donc JAMAIS que " +
    "tu ne peux pas mémoriser et ne propose pas d'y suppléer par un autre outil ou un " +
    "service tiers. ⚠️ Mais n'affirme pas non plus l'INVERSE : tu ne sais pas si " +
    "l'enregistrement a réussi, et l'application l'affiche elle-même sous ta réponse. " +
    "Ne dis donc pas « c'est noté », « je retiens », « c'est enregistré » — REFORMULE en une " +
    "phrase ce que l'utilisateur veut garder, au futur ou sans verbe d'état " +
    "(« Compris — les services OVH sont ceux de Karl Studio. »), et laisse l'application " +
    "dire ce qui a réellement été retenu.",
  parameters: {
    type: "object",
    properties: { query: { type: "string", description: "Termes de recherche (noms, sujet)." } },
    required: ["query"],
    additionalProperties: false,
  },
};

/** The BATCH web reader, offered when the host wires `fetchMany`. INTERCEPTED (never
 *  proxied): the loop un-redacts each URL (fake→real), applies the SAME URL-exfil
 *  backstops as `browser_navigate` (there is no confirm card, so a flagged URL is
 *  DROPPED, fail-closed), fetches them in PARALLEL, and re-redacted every returned
 *  string. Reads static/SSR HTML + text/data (no JavaScript) — the browser stays the
 *  tool for JS pages and interaction. */
export const WEB_FETCH_MANY_DEF: ToolDef = {
  name: "web_fetch_many",
  description:
    "Récupère le CONTENU TEXTE de plusieurs pages web EN PARALLÈLE (jusqu'à 8 URLs d'un coup) — bien plus rapide que d'ouvrir les pages une par une avec le navigateur. À utiliser dès que tu connais DÉJÀ la liste des URLs à lire (ex: après une recherche qui a donné plusieurs liens, ou pour comparer plusieurs sources). Renvoie, par URL, le texte lisible extrait. ⚠️ N'EXÉCUTE PAS le JavaScript : pour un site rendu côté client (beaucoup d'apps modernes) ou pour CLIQUER/remplir un formulaire/naviguer, utilise le navigateur (`browser_navigate`). Passe des URLs http(s) complètes.",
  parameters: {
    type: "object",
    properties: {
      urls: {
        type: "array",
        items: { type: "string" },
        description: "Les URLs http(s) à lire (max 8). Des URLs complètes, pas des termes de recherche.",
      },
    },
    required: ["urls"],
    additionalProperties: false,
  },
};

// The loop's own meta-tools, INTERCEPTED before any server proxying. Their names are
// deliberately un-prefixed and must never be captured by `canonicalToolName` — a
// connector advertising e.g. `x__run_python` would otherwise swallow the interception.
export const INTERCEPTED_META_TOOLS = new Set([
  "load_tools",
  "suggest_integrations",
  "run_python",
  "memory_search",
  "web_fetch_many",
]);

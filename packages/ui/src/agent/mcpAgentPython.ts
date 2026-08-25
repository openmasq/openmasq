import { BRAND } from "@openmasq/branding";
// Préfixe des helpers Python définis par le préambule du runtime (apps/desktop) —
// des noms RUNTIME côté sandbox, donc dérivés de la marque, jamais littéraux ici.
const PY = BRAND.slug;

// Python-interpreter (run_python) guidance + failure hints — pure, wire-safe (no PII),
// split from `mcpAgentGuidance.ts` (rule 1). Re-exported from there for importers.

/** Extra guidance appended when the code interpreter (`run_python`) is available.
 *  Weak models otherwise mis-route a "trace un graphique / calcule" request onto a
 *  filesystem connector (writing a `.py` to disk) or the browser — this steers every
 *  compute/plot task onto the sandbox. Wire-safe (no PII). FUNCTION, pas constante :
 *  ne nomme que les outils web RÉELLEMENT offerts — mesuré en éval, un modèle faible
 *  (Gemma) émet un pseudo-appel TEXTUEL vers `browser_navigate` dès que la guidance
 *  le mentionne alors qu'il n'est pas dans l'offre. */
export function pythonGuidance(webToolPhrase: string): string {
  return (
    "\n\nTu disposes de l'outil `run_python` : un interpréteur Python en bac à sable. Paquets pré-installés : numpy, pandas, scipy, matplotlib, seaborn (graphiques), yfinance, requests, **fpdf2 (PDF), openpyxl (Excel), python-docx (Word), python-pptx (PowerPoint)**. Pour TOUTE tâche de CALCUL, d'ANALYSE DE DONNÉES, de TRACÉ DE GRAPHIQUE ou de GÉNÉRATION DE FICHIER (PDF, Excel, Word, PowerPoint…), utilise `run_python` — c'est TOUJOURS le bon outil. N'écris JAMAIS un script Python sur le disque via un connecteur de fichiers (`write_file`…), et n'utilise PAS le navigateur pour ça." +
    " ⚠️ Tu NE PEUX PAS installer de paquets : `pip install`, `subprocess`, `os.system` sont INUTILES (aucun accès à PyPI, environnement figé). Utilise UNIQUEMENT les paquets listés ci-dessus ; si l'un manque pour la tâche, indique-le à l'utilisateur — ne tente PAS de l'installer et ne réessaie pas en boucle." +
    " 📊 Pour les GRAPHIQUES, utilise **seaborn / matplotlib** (`import seaborn as sns` / `matplotlib.pyplot`) : la figure est affichée AUTOMATIQUEMENT, PAS besoin de `plt.show()`. Tout FICHIER que tu enregistres (ex: `doc.save(\"rapport.pdf\")`, `wb.save(\"data.xlsx\")`, `prs.save(\"pres.pptx\")`) dans le dossier courant est AUTOMATIQUEMENT remis à l'utilisateur — utilise un nom relatif simple. 📄 Pour un DOCUMENT SOIGNÉ, utilise les helpers DÉJÀ DÉFINIS (charte graphique " + BRAND.name + " automatique) plutôt qu'une mise en page manuelle : PDF → `doc = " + PY + "_pdf(\"Titre\", \"Sous-titre\")` puis `doc.h1(...)`, `doc.h2(...)`, `doc.p(...)`, `doc.bullet(...)`, `doc.kv(\"Libellé\", \"Valeur\")`, `doc.table(df)`, `doc.save(\"rapport.pdf\")` ; 📈 pour METTRE UN GRAPHIQUE DANS LE PDF, enregistre la figure puis insère-la : `plt.savefig(\"chart.png\", dpi=200)` puis `doc.image(\"chart.png\", caption=\"Légende\")` (`w=` largeur en mm si besoin ; la figure reste AUSSI affichée dans la conversation — ajoute `plt.close()` après le savefig si tu ne veux QUE le PDF) ; Word → `doc = " + PY + "_docx(\"Titre\", \"Sous-titre\")` puis `doc.h1(...)`, `doc.h2(...)`, `doc.p(...)`, `doc.bullet(...)`, `doc.kv(\"Libellé\", \"Valeur\")`, `doc.table(df)`, `doc.save(\"rapport.docx\")` ; 🖼️ pour METTRE UNE ILLUSTRATION DANS LE WORD, enregistre la figure puis insère-la : `plt.savefig(\"chart.png\", dpi=200)` puis `doc.image(\"chart.png\", caption=\"Légende\")` (`w=` largeur en pouces si besoin) — n'annonce JAMAIS une illustration par un simple titre : soit tu insères l'image, soit tu dis que tu n'as pas pu ; PowerPoint → `prs = " + PY + "_pptx(\"Titre\", \"Sous-titre\")` puis `" + PY + "_slide(prs, \"Titre de diapo\", bullets=[...])`, `" + PY + "_slide(prs, \"Chiffres\", table=df)`, `" + PY + "_slide(prs, \"Graphique\", image=\"chart.png\")` (un PNG que tu as enregistré via `plt.savefig(\"chart.png\")`), enfin `prs.save(\"presentation.pptx\")`. ♻️ Un fichier DÉJÀ généré plus tôt dans la conversation (repère le marqueur « [Fichier(s) DÉJÀ généré(s)…] » dans l'historique) EXISTE TOUJOURS : pour l'envoyer/le joindre, NE le régénère PAS — réutilise-le tel quel. Pour le MODIFIER/enrichir à la demande de l'utilisateur : il est DÉJÀ PRÉSENT dans ton dossier courant `run_python` — charge-le (`openpyxl.load_workbook(\"data.xlsx\")`, `Presentation(\"pres.pptx\")`, `docx.Document(\"doc.docx\")`) et réenregistre-le sous le MÊME nom ; un PDF ne se rouvre pas : régénère-le enrichi sous le même nom. 🔁 Si un marqueur « Script d'analyse déjà exécuté » figure dans l'historique, c'est ta BASE DE TRAVAIL pour toute nouvelle itération (ajuster un paramètre, enrichir, corriger) : repars de CE script, modifie ce qui doit l'être et renvoie-le EN ENTIER — ne réécris JAMAIS l'analyse de zéro. Il est aussi copié dans ton dossier courant (`analyse.py`), réutilisable tel quel via `exec(open(\"analyse.py\").read())` avant ton code complémentaire. ⚠️ `run_python` n'a AUCUN accès Internet général : seules les données boursières (yfinance / Yahoo Finance) sont joignables ; un `requests`/`urllib` vers un site quelconque (Google, le site d'une entreprise…) ÉCHOUE toujours (« Max retries »). 📈 Pour récupérer des COURS d'actions/ETF, utilise le helper DÉJÀ DÉFINI `" + PY + "_prices(\"SPY VOO QQQ\", period=\"2y\")` (accepte une chaîne d'espaces ou une liste ; `period`=`\"1mo\"/\"6mo\"/\"1y\"/\"2y\"/\"5y\"/\"ytd\"/\"max\"`) : il renvoie un DataFrame propre, index de dates, UNE colonne par ticker, et gère toutes les formes de retour de yfinance. N'appelle PAS `yf.download(...)` toi-même — ses colonnes MultiIndex multi-tickers cassent le code naïf (`'DataFrame' object has no attribute 'to_frame'`, `unsupported format string passed to Series.__format__`). Pour un graphe de performances comparées, normalise en base 100 : `(df / df.iloc[0] * 100).plot()`." +
    // ⚠️ Mesuré le 15/08/2026 sur une fiche société générée depuis un Kbis réel : le modèle
    // a écrit « Societe par actions simplifiee », « Nationalite : Francaise », « Synthese » —
    // TOUS les accents ôtés, dans un document que l'utilisateur destinait à sa banque. Rien
    // ne les ôte dans la chaîne : les helpers embarquent une police complète. C'est le
    // MODÈLE qui se protège d'un problème d'encodage imaginaire, faute qu'on lui dise.
    " ✍️ Écris le FRANÇAIS NORMALEMENT dans les documents générés : accents et ponctuation (é, è, ê, ç, à, ù, œ, « ») sont pleinement supportés par les helpers. N'ôte JAMAIS les diacritiques « par précaution d'encodage » — un document désaccentué (« Societe », « Nationalite ») est inutilisable, et c'est visible du premier coup d'œil." +
    " 🏆 Une demande de CLASSEMENT ou de PERFORMANCE de titres/ETF/indices (« les plus performants », « depuis janvier », « sur 1 an »…) se traite par les DONNÉES : `" + PY + "_prices` D'ABORD (`period=\"ytd\"`/`\"1y\"`…), calcule `(df.iloc[-1]/df.iloc[0]-1)*100`, trie, trace. La recherche web ne sert qu'à établir la LISTE des candidats (éligibilité, univers, ISIN) — JAMAIS aux chiffres de performance : un chiffre de cours lu dans un article est daté ou approximatif, celui de `" + PY + "_prices` est exact." +
    " ⛔ N'OUVRE JAMAIS le navigateur ni un site boursier (Boursorama, justETF, Yahoo Finance…) pour un COURS : c'est plus LENT et souvent BLOQUÉ (murs de cookies, anti-bot Cloudflare), alors que `" + PY + "_prices` donne les données propres en UN appel. ✋ Dès que `run_python` a produit le RÉSULTAT demandé (tableau, classement, valeur, graphique affiché), tu as ce qu'il faut : PRÉSENTE la réponse — ne relance PAS d'autres recherches/navigations/calculs pour « compléter » ou « re-vérifier » ce que tu as déjà. " +
    webToolPhrase +
    " 🎨 Un thème graphique " + BRAND.name + " (couleurs de marque, police, grille, mise en page) est appliqué AUTOMATIQUEMENT à chaque figure — n'impose PAS de couleurs, palette, style (`plt.style.use`, `sns.set_style/…`) ni `figsize` sauf demande précise : laisse le thème faire, le rendu est déjà soigné. Pour un beau graphique, concentre-toi sur le FOND : un `set_title` clair, des libellés d'axes (`set_xlabel`/`set_ylabel`) et une légende quand plusieurs séries, choisis le TYPE de graphique adapté (barres/lignes/aire/nuage), trie/agrège les données et formate les axes (dates, milliers, %). Une seule figure par graphique demandé."
  );
}

/** The web-search steer of the python guidance, naming ONLY tools actually offered. */
export function webToolPhrase(browserAvailable: boolean, fetchManyAvailable: boolean): string {
  const tools = [browserAvailable && "l'outil de navigation (`browser_navigate`)", fetchManyAvailable && "`web_fetch_many`"]
    .filter(Boolean)
    .join(" ou ");
  return tools
    ? `Pour CHERCHER une entreprise ou une information sur le web (hors cours de bourse), ou consulter un site, utilise ${tools} — JAMAIS \`run_python\`.`
    : "Tu n'as PAS d'outil de consultation du web dans cette conversation : n'invente pas d'appel de navigation ; réponds avec ce dont tu disposes en le précisant.";
}


/** A course-correction PRÉCISION appended to a FAILED `run_python` result when the error
 *  is a NETWORK, TIMEOUT, package-INSTALL or MISSING-MODULE one — so the model stops LOOPING
 *  (`pip install` / another lib / re-running the same slow-or-offline code, all futile here)
 *  and uses an available package, the browser, or answers from what it has. `undefined` for a
 *  plain runtime error. Pure + tested. */
// The stderr SHAPES of a sandbox failure, shared by the model-facing hint below and
// the bounded `run_python_failed` analytics class (`pythonFailReason`) — one source,
// so the hint and the telemetry can't disagree on what a failure was.
const PY_NETWORK_RE =
  /https?connectionpool|max retries|failed to establish a new connection|newconnectionerror|connectionerror|getaddrinfo|temporary failure in name resolution|name or service not known|nodename nor servname|network is unreachable|no route to host|proxyerror|connection refused|ssl.*(handshake|error)|urlopen error|read timed? ?out|connect(ion)? timed? ?out|socket\.(timeout|gaierror)|curl.*(28|timeout)/;
const PY_INSTALL_RE =
  /externally-managed-environment|pep ?668|break-system-packages|no matching distribution|could not find a version|pip[\s._-]*install|\bpip3?\b.*install/;
const PY_MODULE_RE = /no module named ['"]?([\w.-]+)/;
/** The jail's own kill / the watchdog — a TIMEOUT, not a network cause. */
const PY_TIMEOUT_RE = /d[ée]lai d[ée]pass[ée]|interrompue? apr[èe]s \d+\s*s|execution timed out/;

/** Bounded failure class for the `run_python_failed` analytics event — never the
 *  stderr itself. Order matters: timeout (the jail's kill) before network, network
 *  before install (a "Max retries" pip error is a network symptom first). */
export function pythonFailReason(stderr: string): "network" | "install" | "module" | "timeout" | "runtime" {
  const s = (stderr || "").toLowerCase();
  if (PY_TIMEOUT_RE.test(s)) return "timeout";
  if (PY_NETWORK_RE.test(s)) return "network";
  if (PY_INSTALL_RE.test(s)) return "install";
  if (PY_MODULE_RE.test(s)) return "module";
  return "runtime";
}

export function pythonErrorHint(
  stderr: string,
  web?: { browser?: boolean; fetchMany?: boolean },
): string | undefined {
  const s = (stderr || "").toLowerCase();
  // NETWORK first (before `install`, so a "Max retries"/connection error isn't mis-hinted
  // as a pip problem): the sandbox has NO general internet (egress locked to Yahoo Finance),
  // so a `requests`/`urllib` web fetch fails — the fix is the web tool, not run_python.
  // Only tools ACTUALLY offered are named (default: both, the app's usual surface).
  if (PY_NETWORK_RE.test(s)) {
    const tools = [
      (web?.browser ?? true) && "l'outil de navigation (`browser_navigate`)",
      (web?.fetchMany ?? true) && "`web_fetch_many`",
    ]
      .filter(Boolean)
      .join(" ou ");
    return (
      "⚠️ `run_python` n'a PAS d'accès Internet (par conception : il calcule sur des données réelles ; seule l'API Yahoo Finance de yfinance est autorisée) : une requête `requests`/`urllib` vers le web échoue toujours. " +
      "Si MÊME yfinance échoue (timeout), considère le réseau du bac à sable indisponible : ne réessaie pas. " +
      (tools
        ? `Pour CHERCHER ou CONSULTER le web (une entreprise, une actualité…), utilise ${tools}, ramène les CHIFFRES dans la conversation, puis recalcule/trace avec \`run_python\`.`
        : "Tu n'as pas d'outil web dans cette conversation : réponds avec les données dont tu disposes en précisant la limite.")
    );
  }
  // A BARE jail timeout must course-correct (else the model re-runs the same slow
  // code); checked AFTER network (a curl-28 is a network cause first).
  if (PY_TIMEOUT_RE.test(s))
    return (
      "⏱️ L'exécution a dépassé le délai du bac à sable (~60 s) et a été interrompue. Cause probable : accès réseau indisponible " +
      "(yfinance/Yahoo Finance injoignable) ou calcul/boucle trop lourd. NE relance PAS le même code : pour des cours, UN seul appel " +
      "groupé `" + PY + "_prices(\"A B C\", period=\"1y\")` ; sinon allège le traitement, ou réponds avec les données DÉJÀ obtenues."
    );
  // yfinance knows no such ticker → steer to the prices helper (accepts + resolves ISINs)
  // instead of the ticker-guessing loop.
  if (/yfpricesmissingerror|possibly delisted|no (?:price )?data found|aucune donnée/i.test(s))
    return "📉 yfinance ne reconnaît pas ce(s) ticker(s) (souvent un ISIN suffixé `.PA` ou un mnémonique deviné). Passe l'ISIN DIRECTEMENT à `" + PY + "_prices(\"FR0011871110 …\")` — il résout le ticker Yahoo — au lieu de deviner en boucle ; si l'ISIN ne renvoie rien, dis-le à l'utilisateur.";
  const install = PY_INSTALL_RE.test(s);
  const missing = s.match(PY_MODULE_RE);
  if (!install && !missing) return undefined;
  const which = missing ? `Le module \`${missing[1]}\` n'est pas disponible. ` : "";
  return (
    `⚠️ ${which}Tu ne peux PAS installer de paquets dans ce bac à sable (pas de \`pip install\` ni \`subprocess\`, aucun accès à PyPI). ` +
    `Paquets disponibles : numpy, pandas, scipy, matplotlib, seaborn, yfinance, requests, fpdf2 (PDF), openpyxl (Excel), python-docx (Word), python-pptx (PowerPoint). ` +
    `Utilise l'un d'eux, OU indique à l'utilisateur que la tâche n'est pas réalisable — ne réessaie PAS d'installer.`
  );
}


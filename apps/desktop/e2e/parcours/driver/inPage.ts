/**
 * Le code qui s'exécute DANS la page, écrit en chaînes de caractères — délibérément.
 *
 * ⚠️ Deux raisons, et la première mord silencieusement. (1) Le pilote tourne sous tsx, dont
 * esbuild garde les noms de fonctions en injectant un helper `__name` ; ce helper n'existe
 * pas dans la page, donc toute fonction NOMMÉE (`const visible = …`) placée dans un
 * `page.evaluate` casse à l'exécution avec « __name is not defined » — un plantage qui ne
 * ressemble pas du tout à sa cause. Une chaîne n'est transpilée par personne.
 * (2) Le digest et le ciblage d'un clic DOIVENT nommer les éléments de la MÊME façon : si
 * `click` voyait un autre nom que celui listé, l'agent cliquerait à côté et rapporterait un
 * faux bug. Un seul préambule, importé par les deux (règle 9).
 */
/**
 * Rend une EXPRESSION appelée, argument compris.
 *
 * ⚠️ `page.evaluate("(x) => …", arg)` ne fait PAS ce qu'on croit dans le binding Node :
 * la chaîne est évaluée comme une expression et la fonction obtenue n'est jamais appelée —
 * on récupère `undefined`, donc un digest vide, donc un agent qui croit l'écran vide. On
 * appelle donc nous-mêmes, en sérialisant l'argument dans la source.
 */
export const appel = (expr: string, arg?: unknown): string =>
  `(${expr})(${arg === undefined ? "" : JSON.stringify(arg)})`;

const PRELUDE = `
  const SEL = "button, a[href], [role='button'], [role='tab'], input[type='checkbox'], select";
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };
  const nomDe = (el) =>
    (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || "")
      .replace(/\\s+/g, " ").trim().slice(0, 80);
`;

/** Le digest d'écran. Argument : le nombre de messages à rendre. */
export const EXPR_DIGEST = `(limite) => {
  ${PRELUDE}
  const vus = new Map();
  const actions = [];
  for (const el of Array.from(document.querySelectorAll(SEL))) {
    if (!visible(el)) continue;
    const nom = nomDe(el);
    if (!nom) continue;
    const n = (vus.get(nom) || 0) + 1;
    vus.set(nom, n);
    actions.push({ nom: nom, role: el.getAttribute("role") || el.tagName.toLowerCase(), n: n });
  }

  const railActif = document.querySelector(".rail-nav.active, .side-nav-item.active");
  const entete = document.querySelector(".page-header");
  const scrim = document.querySelector(".modal-scrim, .auth-scrim, [aria-modal='true'], [role='dialog']");

  const zone = document.querySelector(".composer-input");
  const envoi = document.querySelector(".composer-send, .send-btn");
  const composeur = zone ? {
    valeur: zone.value || "",
    toRedact: Array.from(document.querySelectorAll(".detect-chip-val")).map((c) => c.innerText.trim()),
    envoiPret: !!envoi && !envoi.disabled,
  } : null;

  const messages = Array.from(document.querySelectorAll(".msg")).slice(-limite).map((m) => ({
    role: m.classList.contains("user") ? "utilisateur" : "assistant",
    texte: m.innerText.replace(/\\s+/g, " ").trim().slice(0, 600),
  }));

  // Les textes qu'aucun bouton ne porte : états vides, bannières « injoignable », alertes.
  // C'est là que l'app DIT ce qui ne va pas, et un digest qui ne les lit pas rend l'agent aveugle.
  const textes = [];
  for (const el of Array.from(document.querySelectorAll("h1, h2, h3, .library-empty, .empty-state, .banner, [role='alert']"))) {
    if (!visible(el)) continue;
    const t = nomDe(el);
    if (t && textes.indexOf(t) < 0) textes.push(t);
  }

  return {
    section: railActif ? nomDe(railActif) : "",
    titre: entete ? nomDe(entete).split("\\n")[0].slice(0, 60) : null,
    modale: scrim && visible(scrim) ? (nomDe(scrim).slice(0, 60) || "(sans titre)") : null,
    actions: actions,
    composeur: composeur,
    messages: messages,
    textes: textes,
  };
}`;

/** Marque le n-ième élément nommé `nom`. Argument : `{nom, n, HIT}`. Rend `true` s'il existe. */
export const EXPR_MARQUER = `(a) => {
  ${PRELUDE}
  document.querySelectorAll("[" + a.HIT + "]").forEach((e) => e.removeAttribute(a.HIT));
  let vus = 0;
  for (const el of Array.from(document.querySelectorAll(SEL))) {
    if (!visible(el) || nomDe(el) !== a.nom) continue;
    if (++vus !== a.n) continue;
    el.setAttribute(a.HIT, "1");
    return true;
  }
  return false;
}`;

/** Retire le marqueur. Argument : le nom de l'attribut. */
export const EXPR_DEMARQUER = `(h) => document.querySelectorAll("[" + h + "]").forEach((e) => e.removeAttribute(h))`;

/**
 * L'état de service du profil : le mode réel est-il RÉELLEMENT disponible ?
 *
 * Trois faits qu'un agent ne doit pas avoir à deviner en regardant une capture — un écran de
 * connexion et un écran vide se ressemblent, et « je crois que je suis connecté » a produit
 * des rapports qui laissaient croire au réel un parcours joué en simulation.
 */
export const EXPR_SANTE = `async () => {
  const cle = Object.keys(localStorage).find((k) => k.startsWith("sb-") && k.endsWith("-auth-token"));
  let compte = null;
  try { compte = cle ? (JSON.parse(localStorage.getItem(cle) || "{}").user || {}).email || null : null; } catch (e) {}
  const scrim = document.querySelector(".auth-scrim, .login-card");
  // ⚠️ LE COMPTE NE VIT PAS DANS localStorage — les secrets du desktop sont au trousseau,
  // côté main (\`src/main/store/\`). Le lire là donnait \`compte: null\` sur une app
  // PARFAITEMENT connectée (mesuré 15/08/2026 : avatar présent, Mémoire peuplée,
  // conversations en cours) — et \`modeReelUtilisable\` en dépendait, donc le pilote
  // annonçait « mode réel indisponible » et une session entière se serait jouée en
  // croyant l'inverse. On juge donc sur ce qu'un HUMAIN voit : pas d'écran de connexion,
  // et la coquille de l'app montée (l'avatar du rail n'existe que connecté).
  const avatar = document.querySelector(".rail-avatar");
  const initiales = avatar ? (avatar.textContent || "").trim() : null;
  const api = window.openmasq;
  let connecteurs = [];
  try { connecteurs = api && api.mcp ? await api.mcp.list() : []; } catch (e) { connecteurs = []; }
  let reglages = {};
  try {
    const brut = localStorage.getItem("openmasq.settings:" + ((cle && JSON.parse(localStorage.getItem(cle)).user.id) || "")) 
      || localStorage.getItem("openmasq.settings") || "{}";
    const s = JSON.parse(brut);
    reglages = { modele: s.defaultModelId || null, moteur: s.redactEngine || null, theme: s.theme || "light" };
  } catch (e) {}
  return {
    connecte: !scrim && !!avatar,
    // L'e-mail quand on peut l'avoir, sinon les initiales de l'avatar : une identité
    // LISIBLE vaut mieux qu'un null, et rien ici ne conditionne plus \`connecte\`.
    compte: compte || initiales || null,
    ecranDeConnexion: !!scrim,
    connecteurs: (connecteurs || []).map((c) => ({
      id: c.id, connecte: !!c.connected, autorise: !!c.authorized, outils: c.toolCount || 0, erreur: c.error || null,
    })),
    reglages: reglages,
  };
}`;

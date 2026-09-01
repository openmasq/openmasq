/**
 * The code that runs IN the page, written as strings — deliberately.
 *
 * ⚠️ Two reasons, and the first one bites silently. (1) The driver runs under tsx, whose
 * esbuild keeps function names by injecting a `__name` helper; this helper doesn't exist
 * in the page, so any NAMED function (`const visible = …`) placed in a
 * `page.evaluate` breaks at runtime with "__name is not defined" — a crash that doesn't
 * look at all like its cause. A string is transpiled by no one.
 * (2) The digest and a click's targeting MUST name elements the SAME way: if
 * `click` saw a different name than the one listed, the agent would click elsewhere and report a
 * false bug. A single preamble, imported by both (rule 9).
 */
/**
 * Returns a called EXPRESSION, argument included.
 *
 * ⚠️ `page.evaluate("(x) => …", arg)` does NOT do what you'd think in the Node
 * binding: the string is evaluated as an expression and the resulting function is never called —
 * you get back `undefined`, hence an empty digest, hence an agent that believes the screen is empty. We
 * therefore call it ourselves, serializing the argument into the source.
 */
export const call = (expr: string, arg?: unknown): string =>
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

/** The screen digest. Argument: the number of messages to render. */
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

/** Marks the nth element named `nom`. Argument: `{nom, n, HIT}`. Returns `true` if it exists. */
export const EXPR_MARK = `(a) => {
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

/** Removes the marker. Argument: the attribute's name. */
export const EXPR_UNMARK = `(h) => document.querySelectorAll("[" + h + "]").forEach((e) => e.removeAttribute(h))`;

/**
 * The profile's service state: is real mode ACTUALLY available?
 *
 * Three facts an agent shouldn't have to guess by looking at a screenshot — a
 * sign-in screen and an empty screen look alike, and "I think I'm signed in" has produced
 * reports that made a real path look like a simulated run.
 */
export const EXPR_HEALTH = `async () => {
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

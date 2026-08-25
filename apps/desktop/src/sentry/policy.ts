/**
 * CE QUI A LE DROIT DE PARTIR CHEZ SENTRY — la décision, une seule fois, pour les trois
 * processus (main + helpers, renderer, utilitaires).
 *
 * ⚠️ Sentry est, par défaut, l'exact contraire de ce que cette app promet. Il capte les
 * messages d'exception, les fils d'Ariane (console, requêtes réseau avec leurs URL, clics
 * DOM avec le TEXTE de l'élément), les chemins absolus — dans une app où une URL de
 * navigateur agent porte de vraies données, où une console peut imprimer une valeur réelle
 * et où un chemin de fichier contient le nom de l'utilisateur.
 *
 * Donc, règle 7 : **liste d'AUTORISATION, jamais d'exclusion.** `scrubEvent` ne « retire »
 * rien — il RECONSTRUIT un événement à partir des seuls champs énumérés ici. Un futur SDK
 * qui ajoute un champ porteur de contenu n'a alors rien à re-neutraliser : il n'est
 * simplement pas recopié.
 *
 * Le RÉSIDU assumé, dit franchement : le message d'exception et les noms de frames sont du
 * texte LIBRE — on ne peut pas les allow-lister champ par champ. Ils passent donc par
 * `scrubText`, qui est, lui, une liste d'exclusion de motifs (e-mails, chemins personnels,
 * requêtes d'URL, longues suites de chiffres) suivie d'une TRONCATURE. C'est une atténuation,
 * pas une garantie : un message qui interpolerait une valeur d'une forme non prévue
 * passerait. La vraie parade est en amont — ne jamais interpoler de donnée utilisateur dans
 * un message d'erreur. `policy.test.ts` épingle les motifs couverts.
 */

import { isOperationalError } from "@openmasq/analytics";

/** Le seul point d'entrée réseau de ce fichier. Public par nature mais lié à UN compte
 *  Sentry : plus jamais committé — fourni au BUILD (`OPENMASQ_SENTRY_DSN`, cuit par
 *  `scripts/buildDefines.ts`). Vide ⇒ `initSentry*` ne s'initialise pas : rien ne part. */
export const SENTRY_DSN = process.env.OPENMASQ_SENTRY_DSN ?? "";

/**
 * L'ENVIRONNEMENT, toujours renseigné.
 *
 * ⚠️ Depuis l'artefact unique, `VITE_UPDATES_CHANNEL` ne lie PLUS une build à un
 * environnement : la CI cuit `desktop-stable` partout (`release.yml` dit pourquoi) et l'API
 * jointe se choisit à l'exécution. Ce champ ne trace plus que build CI vs locale
 * (`development` — une information, pas un défaut). Résiduel suivi : rapporter le VRAI
 * environnement résolu ; en attendant l'étiquette dit le canal cuit, jamais un env deviné.
 */
export function resolveEnvironment(channel: string | undefined | null): string {
  const c = (channel ?? "").trim();
  if (!c) return "development";
  if (c.endsWith("production")) return "production";
  if (c.endsWith("staging")) return "staging";
  // Un canal inconnu est reporté TEL QUEL plutôt que rangé de force dans « production » :
  // se tromper d'environnement fait chercher un bug là où il n'est pas.
  return c;
}

/** Longueur max d'un texte libre conservé. Un message d'erreur utile tient là-dedans ;
 *  au-delà, on est en train de recopier du contenu, pas de décrire une panne. */
const MAX_TEXT = 300;

/**
 * Neutralise les formes de données personnelles les plus probables dans un texte libre,
 * puis tronque. Voir le résidu documenté en tête de fichier.
 */
export function scrubText(input: unknown): string {
  if (typeof input !== "string" || !input) return "";
  return (
    input
      // Un chemin personnel porte le nom de l'utilisateur (`/Users/prenom.nom/…`,
      // `C:\Users\…`, `/home/…`) — on garde la PROFONDEUR, qui situe le fichier.
      .replace(/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\\s)'"]+/g, "~")
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[courriel]")
      // Tout ce qui suit un `?` ou un `#` dans une URL : c'est là que voyagent les
      // requêtes de recherche du navigateur agent, donc de vraies valeurs.
      .replace(/(https?:\/\/[^\s?#'"]*)[?#][^\s'"]*/g, "$1")
      // Une suite de 6+ chiffres : IBAN, carte, téléphone, SIREN, identifiant.
      .replace(/\d[\d\s.-]{5,}\d/g, "[nombre]")
      .slice(0, MAX_TEXT)
  );
}

/** Une frame de pile, réduite à ce qui situe le code — jamais à ce qu'il manipulait. */
interface CleanFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app?: boolean;
}

/** Ce qu'on accepte de recevoir du SDK. Volontairement lâche : on ne fait que LIRE. */
interface RawEvent {
  event_id?: unknown;
  timestamp?: unknown;
  platform?: unknown;
  level?: unknown;
  environment?: unknown;
  release?: unknown;
  exception?: { values?: unknown } | unknown;
  message?: unknown;
  tags?: unknown;
  fingerprint?: unknown;
  user?: unknown;
  contexts?: unknown;
  [k: string]: unknown;
}

function cleanFrames(frames: unknown): CleanFrame[] {
  if (!Array.isArray(frames)) return [];
  const out: CleanFrame[] = [];
  // Les frames les plus PROCHES de l'erreur sont en fin de tableau chez Sentry : on garde
  // la queue, qui est celle qui explique la panne.
  for (const f of frames.slice(-30)) {
    const r = f as Record<string, unknown>;
    out.push({
      filename: scrubText(r.filename ?? r.abs_path ?? ""),
      function: scrubText(r.function ?? ""),
      ...(typeof r.lineno === "number" ? { lineno: r.lineno } : {}),
      ...(typeof r.colno === "number" ? { colno: r.colno } : {}),
      ...(typeof r.in_app === "boolean" ? { in_app: r.in_app } : {}),
    });
    // ⚠️ `vars` (variables locales) et `pre_context`/`context_line`/`post_context` (le CODE
    // SOURCE autour de la ligne) ne sont PAS recopiés : ce sont les deux champs par
    // lesquels une valeur réelle entre dans un rapport de plantage.
  }
  return out;
}

/**
 * Reconstruit l'événement à partir des seuls champs autorisés. Renvoie `null` pour
 * l'abandonner — rien ne part alors.
 */
export function scrubEvent(event: RawEvent | null | undefined): Record<string, unknown> | null {
  if (!event) return null;
  const out: Record<string, unknown> = {};
  // Identité + classement de l'événement : aucun contenu.
  for (const k of ["event_id", "timestamp", "platform", "level", "environment", "release"]) {
    const v = event[k];
    if (typeof v === "string" || typeof v === "number") out[k] = v;
  }
  // Nos propres étiquettes seulement (posées par `initSentry`), et seulement si ce sont
  // des scalaires — une étiquette d'origine inconnue ne passe pas.
  if (event.tags && typeof event.tags === "object") {
    const tags: Record<string, string> = {};
    for (const [k, v] of Object.entries(event.tags as Record<string, unknown>)) {
      if (ALLOWED_TAGS.has(k) && (typeof v === "string" || typeof v === "number")) {
        tags[k] = String(v).slice(0, 80);
      }
    }
    if (Object.keys(tags).length) out.tags = tags;
  }

  const values = (event.exception as { values?: unknown } | undefined)?.values;
  if (Array.isArray(values) && values.length) {
    out.exception = {
      values: values.slice(0, 3).map((v) => {
        const r = v as Record<string, unknown>;
        const frames = (r.stacktrace as { frames?: unknown } | undefined)?.frames;
        const mech = r.mechanism as { type?: unknown; handled?: unknown } | undefined;
        return {
          type: scrubText(r.type ?? "Error"),
          value: scrubText(r.value ?? ""),
          stacktrace: { frames: cleanFrames(frames) },
          // `mechanism.handled` est un BOOLÉEN, jamais du contenu — et c'est lui qui
          // remplit les vues « Unhandled »/crash-rate de Sentry, structurellement vides
          // sans cette recopie (audit 13/08).
          ...(mech && typeof mech.handled === "boolean"
            ? { mechanism: { type: scrubText(mech.type ?? "generic"), handled: mech.handled } }
            : {}),
        };
      }),
    };
  } else if (typeof event.message === "string") {
    out.message = scrubText(event.message);
  } else {
    // Ni exception ni message : il ne reste rien d'exploitable, on n'envoie pas.
    return null;
  }
  // `fingerprint` : des chaînes que NOUS posons (`[scope, code]`) — sépare les erreurs
  // synthétisées en issues distinctes. Scalaires, scrubbées, ≤ 5.
  if (Array.isArray(event.fingerprint)) {
    const fp = (event.fingerprint as unknown[])
      .filter((f): f is string => typeof f === "string")
      .slice(0, 5)
      .map((f) => scrubText(f));
    if (fp.length) out.fingerprint = fp;
  }
  // `user.id` SEUL : l'UUID anonyme d'`installErrorReporting` — jamais IP/email/nom.
  const user = event.user as { id?: unknown } | undefined;
  if (user && typeof user.id === "string" && /^[0-9a-f-]{1,40}$/.test(user.id)) {
    out.user = { id: user.id };
  }
  // `contexts` champ par champ, jamais en bloc : os.name/os.version + device.arch sont ce
  // qui distingue les deux classes de panne les plus chères du produit (VC++ manquant sur
  // Windows vierge, .app Intel sans moteur ONNX). ⚠️ `device.name`/`device.model` (le nom
  // de la machine = souvent le prénom) ne passent JAMAIS.
  const ctx = event.contexts as { os?: Record<string, unknown>; device?: Record<string, unknown> } | undefined;
  if (ctx && typeof ctx === "object") {
    const os: Record<string, string> = {};
    if (typeof ctx.os?.name === "string") os.name = scrubText(ctx.os.name);
    if (typeof ctx.os?.version === "string") os.version = scrubText(ctx.os.version);
    const device: Record<string, string> = {};
    if (typeof ctx.device?.arch === "string") device.arch = scrubText(ctx.device.arch);
    const contexts: Record<string, unknown> = {};
    if (Object.keys(os).length) contexts.os = os;
    if (Object.keys(device).length) contexts.device = device;
    if (Object.keys(contexts).length) out.contexts = contexts;
  }
  // ⚠️ `breadcrumbs`, `request`, `extra`, `modules`, `server_name` — et tout le RESTE de
  // `user`/`contexts` — ne sont JAMAIS recopiés. `server_name` est le nom de la machine
  // (donc souvent le prénom de l'utilisateur) ; `breadcrumbs` porte les URL visitées et le
  // texte des éléments cliqués ; `contexts.device.name/model` identifient l'appareil.
  return out;
}

/**
 * CE QUI NE VAUT PAS LA PEINE D'ÊTRE ENVOYÉ — l'autre moitié de `beforeSend`.
 *
 * Le prédicat n'est PAS réécrit ici : c'est celui d'`@openmasq/analytics`, déjà appliqué
 * au canal `$exception` de PostHog par `captureError`. Il avait été établi sur mesure — un
 * connecteur distant qui tombe, un rafraîchissement de jeton expiré, un poste hors ligne :
 * des pannes d'exploitation, pas des bugs. Sentry ne l'avait jamais reçu, et le résultat se
 * lisait dans le tableau de bord : **1590 des 1710 événements (93 %) étaient deux messages
 * de transport MCP**, exactement la proportion que le doc d'analytics avait mesurée sur
 * l'autre canal. Un canal de plantage noyé ne sert plus à rien — c'est le bug.
 *
 * ⚠️ Un plantage NON RATTRAPÉ n'est jamais écarté, quel que soit son texte : c'est la règle
 * du prédicat lui-même (`fatal`), et on lui passe l'information au lieu de la redécider.
 * Nos deux entonnoirs non rattrapés se reconnaissent à l'étiquette `scope: "uncaught"`
 * (`main/runtime/errorReport.ts`) ou au mécanisme du SDK (`handled: false`).
 */
function isUncaught(event: RawEvent): boolean {
  if (event.level === "fatal") return true;
  const tags = event.tags as Record<string, unknown> | undefined;
  if (tags && tags.scope === "uncaught") return true;
  const first = (event.exception as { values?: unknown } | undefined)?.values;
  const mech = Array.isArray(first)
    ? ((first[0] as Record<string, unknown> | undefined)?.mechanism as
        | { handled?: unknown }
        | undefined)
    : undefined;
  return mech?.handled === false;
}

function isOperationalNoise(event: RawEvent | null | undefined): boolean {
  if (!event) return false;
  const values = (event.exception as { values?: unknown } | undefined)?.values;
  const first = Array.isArray(values) ? (values[0] as Record<string, unknown> | undefined) : undefined;
  const name = typeof first?.type === "string" ? first.type : undefined;
  const message =
    typeof first?.value === "string"
      ? first.value
      : typeof event.message === "string"
        ? event.message
        : undefined;
  if (!name && !message) return false;
  return isOperationalError({
    // `scope`/`code` ne servent pas au verdict — le type les exige.
    scope: "sentry",
    code: "before-send",
    name,
    message,
    fatal: isUncaught(event),
  });
}

/**
 * Cap anti-inondation, le pendant Sentry du `MAX_PER_SIGNATURE` de PostHog : une boucle de
 * reconnexion qui rejette 500 fois la même erreur brûlait le quota sans rien apprendre de
 * plus. Par SIGNATURE (type+message tronqués), par session ; l'uncaught a un plafond plus
 * haut — un crash en boucle est précisément ce qu'on veut voir, mais pas 500 fois.
 */
const MAX_PER_SIGNATURE = 5;
const MAX_PER_SIGNATURE_UNCAUGHT = 20;
const sentSignatures = new Map<string, number>();

function overSignatureCap(event: RawEvent): boolean {
  const values = (event.exception as { values?: unknown } | undefined)?.values;
  const first = Array.isArray(values) ? (values[0] as Record<string, unknown> | undefined) : undefined;
  const sig = `${String(first?.type ?? "")}·${String(first?.value ?? event.message ?? "").slice(0, 120)}`;
  const n = (sentSignatures.get(sig) ?? 0) + 1;
  sentSignatures.set(sig, n);
  return n > (isUncaught(event) ? MAX_PER_SIGNATURE_UNCAUGHT : MAX_PER_SIGNATURE);
}

/**
 * `beforeSend`, en entier et à un seul endroit : on écarte le bruit d'exploitation et
 * l'inondation, puis on RECONSTRUIT ce qui reste. Les trois processus l'appellent — c'était
 * `scrubEvent` recopié dans chaque `init`, et un filtre ajouté à l'un des deux n'aurait
 * tenu que là.
 */
export function sentryBeforeSend(event: RawEvent | null | undefined): Record<string, unknown> | null {
  if (!event) return null;
  if (isOperationalNoise(event)) return null;
  if (overSignatureCap(event)) return null;
  return scrubEvent(event);
}

/** Les étiquettes que NOUS posons — tout le reste est écarté. */
// `scope`/`code` viennent de `runtime/errorReport.ts` : des énumérations bornées
// (« updates », « mcp », « uncaught »…), du même genre que celles que la liste
// d'autorisation des analytics laisse déjà passer. Tronquées comme les autres.
// `event.process` : posée par le SDK Electron sur un événement RELAYÉ (renderer→main,
// enfant) — sans elle, un événement renderer arrivait étiqueté `process: app` (le scope
// du main, appliqué au relais) et le processus fautif était illisible.
const ALLOWED_TAGS = new Set(["process", "channel", "packaged", "scope", "code", "event.process"]);

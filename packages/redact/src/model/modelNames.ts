/**
 * Les NOMS DE MODÈLES D'IA — la forme, pas une liste exhaustive.
 *
 * Audit du 13/08 : la dispense de notoriété matche en exact, donc « ChatGPT » passait
 * mais « GPT-5.5 », « Claude Sonnet 4.6 », « Gemini 2.5 Pro » — ce qu'un utilisateur
 * tape réellement — étaient redacted à tous les niveaux, catalogue de l'app compris.
 * Aucune liste ne suit un catalogue vivant (~320 modèles OpenRouter) ; une GRAMMAIRE si :
 * une FAMILLE connue en tête + des mots de VERSION/VARIANTE derrière.
 *
 * ⚠️ Même discipline que `notorious.ts` : c'est une allow-list (la valeur part en clair),
 * donc chaque famille nue n'entre dans BARE que si elle n'a pas de vie plausible comme
 * nom privé — « Mistral » nu reste dehors (le vent, et un nom d'entreprise plausible),
 * « Claude »/« Gemini » nus restent l'affaire de `notorious.ts` (catégorie company
 * seulement — les PRÉNOMS restent protégés, voir l'appelant).
 */

const norm = (s: string): string => s.trim().toLowerCase();

/** Familles reconnues en TÊTE de valeur (ou fusionnées à des chiffres : « Qwen3.5 »). */
const FAMILY_TOKENS = new Set([
  "claude", "gpt", "gemini", "gemma", "llama", "qwen", "mistral", "ministral",
  "codestral", "devstral", "pixtral", "magistral", "deepseek", "grok", "kimi",
  "phi", "glm", "holo", "laguna", "nemotron",
  // en TÊTE seulement (jamais dispensés nus — « North » seul reste un mot ordinaire)
  "north", "tencent",
]);

/**
 * Valeurs EXACTES d'un seul tenant, dispensées telles quelles (catégorie company).
 *
 * ⚠️ AUDIT 13/08 — cette liste avait été écrite trop large et faisait fuir de VRAIES
 * données : « Opus », « Sonnet », « Haiku », « Gemma », « Kimi », « Grok », « Llama »,
 * « Le Chat » partaient en clair à TOUS les niveaux, Strict compris. Or « la société
 * Opus », « Gemma » ou « Kimi » sont des raisons sociales et des prénoms parfaitement
 * ordinaires, et une allow-list ne pardonne pas : le mot fuit pour toujours.
 *
 * La règle, désormais tenue : n'entre ici qu'un mot-valise INVENTÉ par un fournisseur,
 * sans vie plausible comme nom de personne ou d'entreprise. Un nom de modèle ordinaire
 * n'en a pas besoin — il porte sa version (« Claude Sonnet 4.6 ») et passe par la
 * grammaire. Le registre ne réclame qu'un seul mot nu, `Codestral` (`modelNames.test.ts`
 * et le test de parité l'épinglent) ; les autres sont là par symétrie de famille.
 */
const BARE_MODELS = new Set([
  "codestral", "devstral", "pixtral", "ministral", "magistral", "nemotron", "gpt-oss",
]);

/** La série « o » d'OpenAI — `o3`, `o4-mini`. Une forme ÉTROITE plutôt qu'une famille
 *  « o » : celle-ci faisait passer « O-123456 » (une référence dossier) pour un modèle. */
const O_SERIES = /^o\d+(-(mini|pro|preview))?$/;

/** Mots de variante/édition qu'un nom de modèle porte après sa famille. */
const VARIANT_WORDS = new Set([
  "pro", "flash", "lite", "flash-lite", "mini", "nano", "large", "medium", "small",
  "super", "ultra", "coder", "code", "vl", "chat", "instruct", "turbo", "preview",
  "luna", "oss", "ai", "s", "m", "l", "xl",
  // les sous-familles qui suivent une marque ombrelle (« Claude Sonnet », « Mistral Nemo »)
  "sonnet", "opus", "haiku", "fable", "mythos", "nemo",
]);

/** « 2.5 », « 4o », « 70B », « 2507 », « v3.1 », « r1 », « k2.6 », « hy3 »…
 *  ⚠️ Borné à 4 chiffres de tête (audit 13/08) : au-delà ce n'est plus une version,
 *  c'est un numéro — et « Holo 847362 » n'a pas à être dispensé. */
const isVersionish = (w: string): boolean =>
  /^v?\d{1,4}(\.\d{1,2})*[a-z]?$/.test(w) || /^[a-z]{1,3}\d{1,4}(\.\d{1,2})?$/.test(w);

const isVariantWord = (w: string): boolean => {
  if (!w) return false;
  if (VARIANT_WORDS.has(w) || isVersionish(w)) return true;
  // composés à tiret : chaque moitié doit être valable (« flash-lite », « 3-mini »)
  const parts = w.split("-");
  return parts.length > 1 && parts.every((p) => VARIANT_WORDS.has(p) || isVersionish(p));
};

/**
 * Une VERSION de modèle : « 5.5 », « 4o », « 3 », « 5.2 ». Courte et numérique.
 *
 * ⚠️ Deux exclusions posées par l'audit du 13/08, parce que la version est le seul
 * garde-fou entre un nom de modèle et une référence de dossier : jamais une ANNÉE nue
 * (« NORTH-2024 »), jamais un long numéro (« O-123456 »).
 */
const isModelVersion = (t: string): boolean =>
  /^\d{1,4}(\.\d{1,2})*[a-z]?$/.test(t) && !/^(19|20)\d\d$/.test(t);

/** « GPT-4o » / « Qwen3.5 » : une famille FUSIONNÉE à sa version. La queue n'admet ni
 *  tiret ni segment supplémentaire — « PHI-2024-001 » n'est pas un modèle. */
const fusedFamily = (w: string): boolean => {
  const m = /^([a-z]+)-?(\d[\w.]*)$/.exec(w);
  return !!m && FAMILY_TOKENS.has(m[1]) && isModelVersion(m[2]);
};

/**
 * Un mot composé « famille-variante » : « DeepSeek-R1 », « GPT-OSS ».
 *
 * ⚠️ Deux bornes, posées par l'audit du 13/08 : UNE seule composante après la famille
 * (« PHI-2024-001 » est une référence de dossier, pas un modèle), et jamais une ANNÉE
 * nue (« NORTH-2024 » non plus). Les vraies versions — R1, OSS, 4o, 5.2 — passent.
 */
const hyphenModel = (w: string): boolean => {
  const [head, ...rest] = w.split("-");
  if (rest.length !== 1) return false;
  if (!FAMILY_TOKENS.has(head) && !BARE_MODELS.has(head)) return false;
  if (/^(19|20)\d\d$/.test(rest[0])) return false;
  return VARIANT_WORDS.has(rest[0]) || isVersionish(rest[0]);
};

/**
 * True quand `value` a la FORME d'un nom de modèle d'IA. `allowBare: false` (la
 * catégorie PRÉNOM) exclut les noms nus sans famille en tête — « Le Chat » seul reste
 * un surnom plausible, « Claude Sonnet »/« GPT-4o » passent.
 */
export function isAiModelName(value: string, opts?: { allowBare?: boolean }): boolean {
  // Une édition entre parenthèses en queue n'est pas le nom : « (local) », « (gratuit) ».
  const v = norm(value).replace(/\s*\([^)]*\)\s*$/, "");
  if (!v) return false;
  if (opts?.allowBare !== false && BARE_MODELS.has(v)) return true;
  if (O_SERIES.test(v)) return true;
  const words = v.split(/\s+/);
  const head = words[0];
  const headIsFamily =
    FAMILY_TOKENS.has(head) || BARE_MODELS.has(head) || fusedFamily(head) || hyphenModel(head);
  if (!headIsFamily) {
    // Famille en DEUX mots (« Le Chat 2 ») : l'exact nu est déjà couvert au-dessus.
    const two = words.slice(0, 2).join(" ");
    if (words.length > 2 && BARE_MODELS.has(two)) return words.slice(2).every(isVariantWord);
    return false;
  }
  // « GPT-4o » oui ; « claude » nu, non (l'exact nu est l'affaire de BARE ci-dessus)
  if (words.length === 1) return fusedFamily(head) || hyphenModel(head);
  return words.slice(1).every(isVariantWord);
}

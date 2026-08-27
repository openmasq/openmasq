/**
 * Per-model qualitative metadata for the model picker's detail panel.
 *
 * HONESTY: this carries NO fabricated benchmark numbers. The `profile` is a
 * RELATIVE 1–5 positioning derived from each model's family + tier (Opus > Sonnet
 * > Haiku; flagship > mini > nano; Pro > Flash > Flash-Lite; Large > Medium >
 * Small; reasoning models o-series/DeepSeek-R1; coding models Codestral/Qwen-Coder),
 * NOT a measured score. `cost` is inverted so HIGHER = cheaper ("Économie").
 * `strengths`/`weaknesses`/`bestFor` are positioning, not metrics. `benchmarks` is
 * only ever populated with confidently-known REAL published figures — omitted
 * everywhere we don't have a reliable source (i.e. everywhere, for now).
 */
export interface ModelProfile {
  /** 1 (basique) → 5 (état de l'art). */
  reasoning: number;
  coding: number;
  /** Latency: 1 (lent) → 5 (très rapide). */
  speed: number;
  /** Price: 1 (cher) → 5 (économique). */
  cost: number;
  /** Vision / multimodal: 1 (texte seul) → 5 (multimodal fort). */
  multimodal: number;
}

export interface ModelMeta {
  profile: ModelProfile;
  /** Short FR capability chips. */
  tags: string[];
  strengths: string[];
  weaknesses: string[];
  bestFor: string;
  /** True = open-weight model (downloadable), even when the platform hosts it. */
  openSource: boolean;
  /** REAL published figures only; omitted when we have no reliable source. */
  benchmarks?: { name: string; score: string }[];
}

type P = [reasoning: number, coding: number, speed: number, cost: number, multimodal: number];
function m(
  p: P,
  tags: string[],
  strengths: string[],
  weaknesses: string[],
  bestFor: string,
  openSource: boolean,
): ModelMeta {
  return {
    profile: { reasoning: p[0], coding: p[1], speed: p[2], cost: p[3], multimodal: p[4] },
    tags,
    strengths,
    weaknesses,
    bestFor,
    openSource,
  };
}

// FR chip vocabulary (kept small + reused).
const RAIS = "Raisonnement";
const CODE = "Code";
const VISION = "Vision";
const FAST = "Rapide";
const CHEAP = "Économique";
const OSS = "Open source";
const LONG = "Long contexte";
const AGENT = "Agentique";

/** id → metadata. Covers EVERY id in `MODELS`. */
export const MODEL_META: Record<string, ModelMeta> = {
  // ── OpenAI ────────────────────────────────────────────────────────────────
  "gpt-5.5": m([5, 5, 2, 1, 5], [RAIS, CODE, VISION, AGENT, LONG],
    ["Raisonnement et agentique de pointe", "Multimodal, très grand contexte"],
    ["Le plus cher de la gamme", "Plus lent que les variantes légères"],
    "Tâches complexes, agents à outils, analyse approfondie", false),
  "gpt-5.4": m([5, 5, 3, 2, 5], [RAIS, CODE, VISION, AGENT],
    ["Excellent rapport capacité/latence", "Fort en code et en outils"],
    ["Reste coûteux", "Un cran sous 5.5 sur les tâches les plus dures"],
    "Usage quotidien exigeant, code, agents", false),
  "gpt-5.4-mini": m([4, 4, 4, 4, 5], [FAST, CODE, VISION],
    ["Bon compromis qualité/prix", "Rapide et multimodal"],
    ["Moins fiable sur le raisonnement long"],
    "Volume, chat réactif, tâches courantes", false),
  "gpt-5.4-nano": m([3, 3, 5, 5, 4], [FAST, CHEAP, VISION],
    ["Très rapide et très économique"],
    ["Capacités limitées sur les tâches complexes"],
    "Classification, extraction, haute cadence", false),
  "gpt-4.1": m([4, 5, 3, 3, 5], [CODE, VISION, LONG],
    ["Fenêtre de 1M tokens", "Solide en code"],
    ["Génération précédente (dépréciée par OpenAI)"],
    "Gros documents, refactoring, contexte massif", false),
  "gpt-4.1-mini": m([3, 4, 4, 4, 5], [FAST, CODE, VISION, LONG],
    ["1M tokens à faible coût"],
    ["Raisonnement moyen"],
    "Traitement de gros contexte à bas prix", false),
  "gpt-4.1-nano": m([2, 3, 5, 5, 4], [FAST, CHEAP, LONG],
    ["Le moins cher à très grand contexte"],
    ["Peu adapté aux tâches difficiles"],
    "Extraction sur gros volumes", false),
  "gpt-4o": m([3, 4, 4, 3, 5], [VISION, FAST],
    ["Multimodal temps réel", "Polyvalent"],
    ["Génération précédente"],
    "Chat multimodal général", false),
  "gpt-4o-mini": m([2, 3, 5, 5, 4], [FAST, CHEAP, VISION],
    ["Rapide et bon marché"],
    ["Capacités limitées"],
    "Tâches simples à grand volume", false),
  o3: m([5, 5, 2, 3, 4], [RAIS, CODE],
    ["Raisonnement profond (maths, sciences)"],
    ["Lent", "Moins naturel en conversation"],
    "Problèmes durs nécessitant de la réflexion", false),
  "o4-mini": m([4, 4, 4, 4, 4], [RAIS, FAST],
    ["Raisonnement économique et rapide"],
    ["Sous o3 sur les tâches les plus dures"],
    "Raisonnement au quotidien à moindre coût", false),
  "o3-mini": m([4, 4, 4, 4, 1], [RAIS, FAST],
    ["Bon raisonnement, léger"],
    ["Texte seul (pas de vision)"],
    "Raisonnement textuel économique", false),

  // ── Anthropic ─────────────────────────────────────────────────────────────
  "claude-fable-5": m([5, 5, 3, 1, 5], [RAIS, CODE, AGENT, VISION, LONG],
    ["Le plus capable de la gamme Claude", "Écriture et code d'excellence"],
    ["Le plus cher"],
    "Rédaction premium, code, raisonnement long", false),
  "claude-opus-4-8": m([5, 5, 3, 2, 5], [RAIS, CODE, AGENT, VISION, LONG],
    ["Flagship agentique et code", "Très fiable sur les longues tâches"],
    ["Coûteux, plus lent que Sonnet"],
    "Agents, gros projets de code, analyse", false),
  "claude-sonnet-5": m([5, 5, 4, 3, 5], [RAIS, CODE, AGENT, VISION, LONG],
    ["Excellent équilibre capacité/vitesse", "Très bon en code"],
    ["Un cran sous Opus/Fable sur le plus dur"],
    "Le choix par défaut : puissant et rapide", false),
  "claude-sonnet-4-6": m([4, 5, 4, 3, 5], [CODE, VISION, LONG],
    ["Solide en code", "Grand contexte"],
    ["Génération précédente"],
    "Code et tâches générales", false),
  // L'abonnement Claude via la CLI Claude Code (`cost: 5` = déjà payé par l'abonnement).
  // Le positionnement est celui de la FAMILLE que l'alias sert — le modèle exact est
  // celui, courant, de l'abonnement (les trois variantes partagent forces/limites).
  "claude-cli": m([5, 5, 3, 5, 1], [RAIS, CODE, LONG],
    ["Compris dans votre abonnement Claude", "Aucune clé API à gérer"],
    ["Texte seul", "Nécessite la CLI Claude Code installée et connectée"],
    "Utiliser votre abonnement Claude existant", false),
  "claude-cli-sonnet": m([5, 5, 4, 5, 1], [RAIS, CODE, LONG],
    ["Équilibre capacité/vitesse", "Compris dans votre abonnement Claude"],
    ["Texte seul"], "Le choix par défaut de l'abonnement", false),
  "claude-cli-opus": m([5, 5, 3, 5, 1], [RAIS, CODE, LONG],
    ["Le plus capable de l'abonnement", "Compris dans votre abonnement Claude"],
    ["Texte seul", "Selon l'offre (absent du plan Pro)"], "Les tâches les plus dures", false),
  // L'abonnement ChatGPT via la CLI Codex — même logique que claude-cli (`cost: 5` =
  // déjà payé par l'abonnement, pas « gratuit »).
  "codex-cli": m([5, 5, 3, 5, 1], [RAIS, CODE, LONG],
    ["Compris dans votre abonnement ChatGPT", "Aucune clé API à gérer"],
    ["Texte seul", "Nécessite la CLI Codex installée et connectée"],
    "Utiliser votre abonnement ChatGPT existant", false),
  "claude-cli-haiku": m([3, 3, 5, 5, 1], [CODE, LONG],
    ["Très rapide", "Compris dans votre abonnement Claude"],
    ["Texte seul", "Moins profond que Sonnet/Opus"], "Brouillons et questions rapides", false),
  "claude-haiku-4-5": m([3, 4, 5, 4, 5], [FAST, VISION],
    ["Très rapide", "Multimodal, bon marché"],
    ["Contexte 200K (vs 1M)", "Raisonnement moyen"],
    "Réponses rapides, volume, multimodal léger", false),

  // ── Google Gemini ─────────────────────────────────────────────────────────
  "gemini-3.1-pro-preview": m([5, 4, 3, 3, 5], [RAIS, VISION, LONG],
    ["Flagship Gemini, 1M tokens", "Multimodal fort"],
    ["Version preview", "Moins spécialisé code que les GPT/Claude"],
    "Analyse multimodale, très grands documents", false),
  "gemini-3.5-flash": m([4, 4, 5, 4, 5], [FAST, VISION, LONG],
    ["Rapide, multimodal, 1M tokens"],
    ["Sous Pro sur le raisonnement dur"],
    "Multimodal réactif à grand contexte", false),
  "gemini-3.1-flash-lite": m([3, 3, 5, 5, 4], [FAST, CHEAP, LONG],
    ["Ultra économique à grand contexte"],
    ["Capacités limitées"],
    "Extraction/résumé sur gros volumes", false),
  "gemini-2.5-pro": m([4, 4, 3, 3, 5], [RAIS, VISION, LONG],
    ["Flagship de la génération précédente"],
    ["Génération précédente"],
    "Analyse multimodale et long contexte", false),
  "gemini-2.5-flash": m([3, 3, 5, 4, 5], [FAST, VISION, LONG],
    ["Rapide et multimodal"],
    ["Génération précédente"],
    "Chat multimodal réactif", false),
  "gemini-2.5-flash-lite": m([2, 2, 5, 5, 4], [FAST, CHEAP],
    ["Très bon marché"],
    ["Capacités basiques"],
    "Tâches simples à grand volume", false),
  "gemini-2.0-flash": m([3, 3, 5, 5, 5], [FAST, CHEAP, VISION, LONG],
    ["Rapide, multimodal, très abordable"],
    ["Génération précédente"],
    "Multimodal économique", false),

  // ── Mistral (hébergé) ─────────────────────────────────────────────────────
  "mistral-large-2512": m([4, 4, 3, 3, 1], [RAIS, CODE],
    ["Fort en multilingue et en code"],
    ["Texte seul (pas de vision)"],
    "Raisonnement et code multilingues", false),
  "mistral-medium-2508": m([4, 4, 4, 4, 4], [CODE, VISION],
    ["Très bon rapport qualité/prix", "Multimodal"],
    ["Sous Large sur le plus dur"],
    "Usage général équilibré", false),
  "mistral-small-2506": m([3, 3, 5, 5, 4], [FAST, CHEAP, VISION, OSS],
    ["Open-weight, rapide et bon marché"],
    ["Capacités moyennes"],
    "Auto-hébergement, tâches courantes", true),
  "codestral-latest": m([3, 5, 4, 5, 1], [CODE, FAST, OSS],
    ["Spécialisé code (complétion, FIM)", "Rapide et abordable"],
    ["Peu adapté aux tâches non-code"],
    "Autocomplétion et génération de code", true),
  "pixtral-large-latest": m([4, 3, 3, 3, 5], [VISION, OSS],
    ["Multimodal open-weight puissant"],
    ["Moins fort en code pur"],
    "Compréhension d'images et documents", true),
  "ministral-8b-2512": m([3, 3, 5, 5, 1], [FAST, CHEAP, OSS],
    ["Petit modèle edge, très rapide"],
    ["Texte seul", "Capacités limitées"],
    "Edge/on-device, tâches simples", true),

  // ── DeepSeek (API hébergée, clé perso) ────────────────────────────────────
  "deepseek-v4-pro": m([5, 5, 3, 4, 1], [RAIS, CODE, OSS, LONG],
    ["Raisonnement et code de haut niveau (open-weight)", "Très grand contexte (1M)"],
    ["Texte seul", "Hébergé en Chine (résidence des données)"],
    "Code et raisonnement exigeants, gros contexte", true),
  "deepseek-v4-flash": m([4, 4, 5, 5, 1], [FAST, CODE, CHEAP, OSS, LONG],
    ["Rapide et très économique", "Très grand contexte (1M)"],
    ["Texte seul", "Sous la variante Pro sur le plus dur", "Hébergé en Chine"],
    "Code réactif et gros volumes à bas coût", true),

  // ── OpenRouter (agrégateur multi-vendeurs, clé perso) ─────────────────────
  // Positionnement relatif famille/tier ; ids vérifiés dans le catalogue OpenRouter.
  "openai/gpt-5.6-luna": m([4, 4, 5, 5, 4], [FAST, CHEAP, VISION, LONG, AGENT],
    ["Très grand contexte (1M) pour une poignée de centimes", "Multimodal, outils et raisonnement"],
    ["Modèle propriétaire", "Hébergement variable (agrégateur)"],
    "Le polyvalent économique de la vue simplifiée", true),
  "moonshotai/kimi-k2.6": m([4, 5, 4, 4, 4], [CODE, AGENT, OSS, VISION],
    ["Fort en code et en usage agentique", "Appels d'outils parallèles, 262k de contexte"],
    ["Sortie plus chère que l'entrée", "Hébergement variable (agrégateur)"],
    "Code et enchaînements d'outils, via OpenRouter", true),
  "x-ai/grok-4.20": m([5, 4, 4, 3, 4], [RAIS, VISION, LONG, AGENT],
    ["Flagship xAI, multimodal, très grand contexte (2M)", "Accès via une seule clé OpenRouter"],
    ["Modèle propriétaire", "Prix/disponibilité variables (agrégateur)"],
    "Raisonnement multimodal sur très gros contexte", false),
  "deepseek/deepseek-chat-v3.1": m([4, 5, 4, 4, 1], [CODE, RAIS, OSS],
    ["Fort en code et raisonnement (open-weight)", "Bon marché via OpenRouter"],
    ["Texte seul", "Hébergement variable (agrégateur)"],
    "Code et raisonnement économiques via OpenRouter", true),
  "qwen/qwen3-vl-32b-instruct": m([4, 4, 4, 5, 4], [VISION, CODE, OSS, CHEAP],
    ["Multimodal open-weight (vision), bon marché", "Grand contexte"],
    ["Hébergement variable (agrégateur)"],
    "Compréhension d'images + texte à bas coût", true),
  "qwen/qwen3-235b-a22b": m([4, 4, 3, 4, 1], [RAIS, CODE, OSS],
    ["Grand MoE open-weight, multilingue"],
    ["Texte seul", "Plus lourd → latence supérieure"],
    "Tâches exigeantes multilingues via OpenRouter", true),
  "meta-llama/llama-3.3-70b-instruct": m([4, 4, 4, 5, 1], [OSS, CHEAP],
    ["Open-weight polyvalent, très abordable"],
    ["Texte seul", "Sous les flagships propriétaires"],
    "Assistant général à bas coût via OpenRouter", true),
  "mistralai/mistral-small-3.2-24b-instruct": m([3, 3, 5, 5, 4], [FAST, CHEAP, VISION, OSS],
    ["Petit modèle multimodal open-weight, rapide et bon marché"],
    ["Capacités moyennes sur le plus dur"],
    "Tâches courantes multimodales économiques", true),
  "poolside/laguna-s-2.1:free": m([4, 4, 4, 5, 1], [FAST, CHEAP, LONG, AGENT],
    ["Gratuit, sans clé ni abonnement", "Grand contexte (262k), outils et raisonnement"],
    ["Texte seul", "Palier gratuit : disponibilité non garantie"],
    "Le modèle par défaut — écrire tout de suite, sans rien configurer", true),
  "nvidia/nemotron-3-ultra-550b-a55b:free": m([5, 4, 2, 5, 1], [RAIS, OSS, CHEAP, LONG],
    ["Très grand modèle open-weight, fort raisonnement", "Gratuit via OpenRouter, contexte 1M"],
    ["Texte seul", "Lourd → latence supérieure", "Niveau gratuit : quotas variables"],
    "Raisonnement gratuit de haut niveau, gros contexte", true),
  "nvidia/nemotron-3-super-120b-a12b:free": m([4, 4, 3, 5, 1], [RAIS, OSS, CHEAP, LONG],
    ["Open-weight puissant, contexte 1M", "Gratuit via OpenRouter"],
    ["Texte seul", "Niveau gratuit : quotas variables"],
    "Raisonnement gratuit à grand contexte", true),
  "google/gemma-4-31b-it:free": m([3, 3, 4, 5, 4], [VISION, OSS, CHEAP],
    ["Multimodal open-weight (Google), gratuit via OpenRouter"],
    ["Niveau gratuit : quotas/latence variables"],
    "Multimodal gratuit à grand contexte", true),
  "google/gemma-4-26b-a4b-it:free": m([3, 3, 5, 5, 4], [FAST, VISION, OSS, CHEAP],
    ["MoE compact multimodal open-weight, rapide", "Gratuit via OpenRouter"],
    ["Niveau gratuit : quotas variables"],
    "Multimodal réactif gratuit", true),
  "openai/gpt-oss-20b:free": m([3, 3, 5, 5, 1], [FAST, OSS, CHEAP],
    ["Poids ouverts d'OpenAI, léger et rapide", "Gratuit via OpenRouter"],
    ["Texte seul", "Capacités moindres que le 120B", "Niveau gratuit : quotas variables"],
    "Assistant léger gratuit (poids ouverts OpenAI)", true),
  "cohere/north-mini-code:free": m([2, 4, 5, 5, 1], [CODE, FAST, CHEAP],
    ["Petit modèle de code, gratuit via OpenRouter, grand contexte"],
    ["Texte seul", "Peu adapté hors code", "Niveau gratuit : quotas variables"],
    "Complétion de code gratuite", false),
  "tencent/hy3:free": m([4, 4, 4, 5, 1], [RAIS, OSS, CHEAP],
    ["Open-weight polyvalent, gratuit via OpenRouter, grand contexte"],
    ["Texte seul", "Niveau gratuit : quotas/latence variables"],
    "Usage général gratuit via OpenRouter", true),
  "nvidia/nemotron-nano-9b-v2:free": m([3, 3, 5, 5, 1], [FAST, OSS, CHEAP],
    ["Petit modèle rapide open-weight", "Gratuit via OpenRouter"],
    ["Texte seul", "Capacités limitées", "Niveau gratuit : quotas variables"],
    "Tâches simples gratuites, haute cadence", true),

  // ── OpenAI-compatible / local (Ollama, open-weight) ───────────────────────
  "llama3.3": m([4, 4, 4, 5, 1], [OSS, CODE],
    ["Open-weight polyvalent", "Gratuit en local"],
    ["Texte seul", "Sous les flagships propriétaires"],
    "Assistant local privé et polyvalent", true),
  "llama3.1": m([3, 3, 4, 5, 1], [OSS],
    ["Open-weight éprouvé, gratuit en local"],
    ["Génération précédente", "Texte seul"],
    "Assistant local général", true),
  "qwen2.5": m([4, 4, 4, 5, 1], [OSS, CODE],
    ["Fort multilingue open-weight"],
    ["Texte seul"],
    "Multilingue local, tâches générales", true),
  "qwen2.5-coder": m([3, 5, 4, 5, 1], [CODE, OSS],
    ["Excellent modèle de code open-weight"],
    ["Peu adapté hors code"],
    "Code en local (privé, gratuit)", true),
  "deepseek-r1": m([5, 4, 2, 5, 1], [RAIS, OSS],
    ["Raisonnement open-weight de haut niveau"],
    ["Lent", "Texte seul, verbeux"],
    "Raisonnement local sur problèmes durs", true),
  gemma2: m([3, 3, 4, 5, 1], [OSS, FAST],
    ["Léger et efficace (Google, open-weight)"],
    ["Génération précédente", "Texte seul"],
    "Assistant local léger", true),
  phi4: m([4, 3, 5, 5, 1], [OSS, FAST, RAIS],
    ["Petit modèle fort en raisonnement"],
    ["Texte seul", "Connaissances plus limitées"],
    "Raisonnement local léger", true),
  "mistral-nemo": m([3, 3, 4, 5, 1], [OSS],
    ["Open-weight équilibré, multilingue"],
    ["Texte seul"],
    "Assistant local multilingue", true),

  // ── Scaleway — plateforme (inclus dans l'abonnement) ──────────────────────────
  "glm-5.2": m([4, 4, 3, 3, 1], [RAIS, CODE, OSS, LONG],
    ["Fort raisonnement/agentique (open-weight)", "Très grand contexte (long-horizon)", "Inclus dans l'abonnement"],
    ["Texte seul"],
    "Agents, code et tâches longues sans clé API", true),
  "qwen3.5-397b-a17b": m([5, 5, 3, 4, 4], [RAIS, CODE, VISION, OSS],
    ["Très grand MoE open-weight, multimodal", "Inclus dans l'abonnement"],
    ["Plus lourd → latence supérieure"],
    "Tâches exigeantes sans clé API", true),
  "qwen3.6-35b-a3b": m([4, 4, 4, 5, 4], [FAST, CODE, VISION, OSS],
    ["MoE compact, rapide et multimodal", "Inclus dans l'abonnement"],
    ["Sous le 397B sur le plus dur"],
    "Usage général rapide sans clé API", true),
  "gemma-4-26b-a4b-it": m([3, 3, 5, 5, 4], [FAST, CHEAP, VISION, OSS],
    ["Léger, rapide, multimodal (open-weight)", "Inclus dans l'abonnement"],
    ["Capacités moyennes"],
    "Tâches courantes économiques sans clé API", true),
  "mistral-medium-3.5-128b": m([4, 4, 4, 4, 4], [CODE, VISION],
    ["Équilibré et multimodal", "Inclus dans l'abonnement"],
    ["Modèle propriétaire (hébergé)"],
    "Usage général équilibré sans clé API", false),
  "llama-3.3-70b-instruct": m([4, 4, 3, 3, 1], [RAIS, OSS],
    ["Généraliste open-weight solide", "Inclus dans l'abonnement"],
    ["Texte seul", "Génération précédente"],
    "Assistant général open-weight sans clé API", true),
  "qwen3-235b-a22b-instruct-2507": m([5, 4, 3, 3, 1], [RAIS, OSS, LONG],
    ["Grand MoE open-weight, fort raisonnement", "Long contexte", "Inclus dans l'abonnement"],
    ["Texte seul", "Latence supérieure"],
    "Tâches exigeantes (texte) sans clé API", true),
  "qwen3-coder-30b-a3b-instruct": m([4, 5, 4, 4, 1], [CODE, FAST, OSS, LONG],
    ["Spécialisé code, rapide et économique", "Long contexte", "Inclus dans l'abonnement"],
    ["Texte seul"],
    "Code économique sans clé API", true),
  "pixtral-12b-2409": m([3, 3, 4, 4, 4], [VISION, CHEAP, OSS],
    ["Multimodal léger et économique", "Inclus dans l'abonnement"],
    ["Capacités moyennes"],
    "Vision économique sans clé API", true),
  "mistral-small-3.2-24b-instruct-2506": m([3, 4, 4, 5, 4], [VISION, FAST, CHEAP],
    ["Compact, multimodal, très économique", "Inclus dans l'abonnement"],
    ["Modèle plus petit"],
    "Usage courant multimodal économique sans clé API", true),
  "devstral-2-123b-instruct-2512": m([4, 5, 3, 3, 1], [CODE, AGENT, OSS, LONG],
    ["Spécialisé code/agents (open-weight)", "Long contexte", "Inclus dans l'abonnement"],
    ["Texte seul"],
    "Code et agents sans clé API", true),
  "gpt-oss-120b": m([4, 4, 4, 5, 1], [RAIS, OSS, CHEAP],
    ["Poids ouverts d'OpenAI, bon rapport perf/prix", "Inclus dans l'abonnement"],
    ["Texte seul"],
    "Raisonnement économique open-weight sans clé API", true),
  "gemma-3-27b-it": m([3, 3, 4, 4, 4], [VISION, FAST, OSS],
    ["Multimodal open-weight (Google)", "Inclus dans l'abonnement"],
    ["Génération précédente (Gemma 3)"],
    "Vision généraliste sans clé API", true),
  "holo2-30b-a3b": m([4, 4, 4, 4, 4], [VISION, OSS, FAST],
    ["MoE multimodal open-weight, rapide", "Inclus dans l'abonnement"],
    ["Modèle récent, moins éprouvé"],
    "Multimodal rapide sans clé API", true),
};

/** Generic fallback by family, so an unknown/legacy id never crashes the panel. */
function fallbackMeta(id: string): ModelMeta {
  const l = id.toLowerCase();
  if (/opus|fable|gpt-5\.5|397b|-pro|o3\b|large|r1/.test(l))
    return m([4, 4, 3, 3, 3], [RAIS], ["Modèle haut de gamme"], [], "Tâches exigeantes", false);
  if (/mini|nano|lite|flash|small|haiku|8b|nemo|gemma|phi/.test(l))
    return m([3, 3, 5, 5, 3], [FAST], ["Rapide et économique"], [], "Tâches courantes", false);
  return m([3, 3, 4, 4, 3], [], ["Modèle polyvalent"], [], "Usage général", false);
}

/** Metadata for a model id (family fallback for unknown/legacy ids). */
export function modelMeta(id: string): ModelMeta {
  return MODEL_META[id] ?? fallbackMeta(id);
}

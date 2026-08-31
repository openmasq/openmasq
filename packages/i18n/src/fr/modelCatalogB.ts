/**
 * Tranche « modelCatalogB » du catalogue FR — la langue SOURCE. Ce que la fiche d'un modèle
 * dit de lui ; les faits (profil, prix, contexte) restent dans `@openmasq/llm`.
 */
import type { Messages } from "../messages";

export const modelCatalogB: Record<string, Messages["modelCatalog"]["models"][string]> = {
  "openai/gpt-5.6-luna": {
    strengths: [
      "Très grand contexte (1M) pour une poignée de centimes",
      "Multimodal, outils et raisonnement",
    ],
    weaknesses: ["Modèle propriétaire", "Hébergement variable (agrégateur)"],
    bestFor: "Le polyvalent économique de la vue simplifiée",
  },
  "moonshotai/kimi-k2.6": {
    strengths: [
      "Fort en code et en usage agentique",
      "Appels d'outils parallèles, 262k de contexte",
    ],
    weaknesses: ["Sortie plus chère que l'entrée", "Hébergement variable (agrégateur)"],
    bestFor: "Code et enchaînements d'outils, via OpenRouter",
  },
  "x-ai/grok-4.20": {
    strengths: [
      "Flagship xAI, multimodal, très grand contexte (2M)",
      "Accès via une seule clé OpenRouter",
    ],
    weaknesses: ["Modèle propriétaire", "Prix/disponibilité variables (agrégateur)"],
    bestFor: "Raisonnement multimodal sur très gros contexte",
  },
  "deepseek/deepseek-chat-v3.1": {
    strengths: ["Fort en code et raisonnement (open-weight)", "Bon marché via OpenRouter"],
    weaknesses: ["Texte seul", "Hébergement variable (agrégateur)"],
    bestFor: "Code et raisonnement économiques via OpenRouter",
  },
  "qwen/qwen3-vl-32b-instruct": {
    strengths: ["Multimodal open-weight (vision), bon marché", "Grand contexte"],
    weaknesses: ["Hébergement variable (agrégateur)"],
    bestFor: "Compréhension d'images + texte à bas coût",
  },
  "qwen/qwen3-235b-a22b": {
    strengths: ["Grand MoE open-weight, multilingue"],
    weaknesses: ["Texte seul", "Plus lourd → latence supérieure"],
    bestFor: "Tâches exigeantes multilingues via OpenRouter",
  },
  "meta-llama/llama-3.3-70b-instruct": {
    strengths: ["Open-weight polyvalent, très abordable"],
    weaknesses: ["Texte seul", "Sous les flagships propriétaires"],
    bestFor: "Assistant général à bas coût via OpenRouter",
  },
  "mistralai/mistral-small-3.2-24b-instruct": {
    strengths: ["Petit modèle multimodal open-weight, rapide et bon marché"],
    weaknesses: ["Capacités moyennes sur le plus dur"],
    bestFor: "Tâches courantes multimodales économiques",
  },
  "poolside/laguna-s-2.1:free": {
    strengths: ["Gratuit, sans clé ni abonnement", "Grand contexte (262k), outils et raisonnement"],
    weaknesses: ["Texte seul", "Palier gratuit : disponibilité non garantie"],
    bestFor: "Le modèle par défaut — écrire tout de suite, sans rien configurer",
  },
  "nvidia/nemotron-3-ultra-550b-a55b:free": {
    strengths: [
      "Très grand modèle open-weight, fort raisonnement",
      "Gratuit via OpenRouter, contexte 1M",
    ],
    weaknesses: ["Texte seul", "Lourd → latence supérieure", "Niveau gratuit : quotas variables"],
    bestFor: "Raisonnement gratuit de haut niveau, gros contexte",
  },
  "nvidia/nemotron-3-super-120b-a12b:free": {
    strengths: ["Open-weight puissant, contexte 1M", "Gratuit via OpenRouter"],
    weaknesses: ["Texte seul", "Niveau gratuit : quotas variables"],
    bestFor: "Raisonnement gratuit à grand contexte",
  },
  "google/gemma-4-31b-it:free": {
    strengths: ["Multimodal open-weight (Google), gratuit via OpenRouter"],
    weaknesses: ["Niveau gratuit : quotas/latence variables"],
    bestFor: "Multimodal gratuit à grand contexte",
  },
  "google/gemma-4-26b-a4b-it:free": {
    strengths: ["MoE compact multimodal open-weight, rapide", "Gratuit via OpenRouter"],
    weaknesses: ["Niveau gratuit : quotas variables"],
    bestFor: "Multimodal réactif gratuit",
  },
  "openai/gpt-oss-20b:free": {
    strengths: ["Poids ouverts d'OpenAI, léger et rapide", "Gratuit via OpenRouter"],
    weaknesses: [
      "Texte seul",
      "Capacités moindres que le 120B",
      "Niveau gratuit : quotas variables",
    ],
    bestFor: "Assistant léger gratuit (poids ouverts OpenAI)",
  },
  "cohere/north-mini-code:free": {
    strengths: ["Petit modèle de code, gratuit via OpenRouter, grand contexte"],
    weaknesses: ["Texte seul", "Peu adapté hors code", "Niveau gratuit : quotas variables"],
    bestFor: "Complétion de code gratuite",
  },
  "tencent/hy3:free": {
    strengths: ["Open-weight polyvalent, gratuit via OpenRouter, grand contexte"],
    weaknesses: ["Texte seul", "Niveau gratuit : quotas/latence variables"],
    bestFor: "Usage général gratuit via OpenRouter",
  },
  "nvidia/nemotron-nano-9b-v2:free": {
    strengths: ["Petit modèle rapide open-weight", "Gratuit via OpenRouter"],
    weaknesses: ["Texte seul", "Capacités limitées", "Niveau gratuit : quotas variables"],
    bestFor: "Tâches simples gratuites, haute cadence",
  },
  "llama3.3": {
    strengths: ["Open-weight polyvalent", "Gratuit en local"],
    weaknesses: ["Texte seul", "Sous les flagships propriétaires"],
    bestFor: "Assistant local privé et polyvalent",
  },
  "llama3.1": {
    strengths: ["Open-weight éprouvé, gratuit en local"],
    weaknesses: ["Génération précédente", "Texte seul"],
    bestFor: "Assistant local général",
  },
  "qwen2.5": {
    strengths: ["Fort multilingue open-weight"],
    weaknesses: ["Texte seul"],
    bestFor: "Multilingue local, tâches générales",
  },
  "qwen2.5-coder": {
    strengths: ["Excellent modèle de code open-weight"],
    weaknesses: ["Peu adapté hors code"],
    bestFor: "Code en local (privé, gratuit)",
  },
  "deepseek-r1": {
    strengths: ["Raisonnement open-weight de haut niveau"],
    weaknesses: ["Lent", "Texte seul, verbeux"],
    bestFor: "Raisonnement local sur problèmes durs",
  },
  "mistral-nemo": {
    strengths: ["Open-weight équilibré, multilingue"],
    weaknesses: ["Texte seul"],
    bestFor: "Assistant local multilingue",
  },
  "glm-5.2": {
    strengths: [
      "Fort raisonnement/agentique (open-weight)",
      "Très grand contexte (long-horizon)",
      "Inclus dans l'abonnement",
    ],
    weaknesses: ["Texte seul"],
    bestFor: "Agents, code et tâches longues sans clé API",
  },
  "qwen3.5-397b-a17b": {
    strengths: ["Très grand MoE open-weight, multimodal", "Inclus dans l'abonnement"],
    weaknesses: ["Plus lourd → latence supérieure"],
    bestFor: "Tâches exigeantes sans clé API",
  },
  "qwen3.6-35b-a3b": {
    strengths: ["MoE compact, rapide et multimodal", "Inclus dans l'abonnement"],
    weaknesses: ["Sous le 397B sur le plus dur"],
    bestFor: "Usage général rapide sans clé API",
  },
  "gemma-4-26b-a4b-it": {
    strengths: ["Léger, rapide, multimodal (open-weight)", "Inclus dans l'abonnement"],
    weaknesses: ["Capacités moyennes"],
    bestFor: "Tâches courantes économiques sans clé API",
  },
  "mistral-medium-3.5-128b": {
    strengths: ["Équilibré et multimodal", "Inclus dans l'abonnement"],
    weaknesses: ["Modèle propriétaire (hébergé)"],
    bestFor: "Usage général équilibré sans clé API",
  },
  "llama-3.3-70b-instruct": {
    strengths: ["Généraliste open-weight solide", "Inclus dans l'abonnement"],
    weaknesses: ["Texte seul", "Génération précédente"],
    bestFor: "Assistant général open-weight sans clé API",
  },
  "qwen3-235b-a22b-instruct-2507": {
    strengths: [
      "Grand MoE open-weight, fort raisonnement",
      "Long contexte",
      "Inclus dans l'abonnement",
    ],
    weaknesses: ["Texte seul", "Latence supérieure"],
    bestFor: "Tâches exigeantes (texte) sans clé API",
  },
  "qwen3-coder-30b-a3b-instruct": {
    strengths: [
      "Spécialisé code, rapide et économique",
      "Long contexte",
      "Inclus dans l'abonnement",
    ],
    weaknesses: ["Texte seul"],
    bestFor: "Code économique sans clé API",
  },
  "pixtral-12b-2409": {
    strengths: ["Multimodal léger et économique", "Inclus dans l'abonnement"],
    weaknesses: ["Capacités moyennes"],
    bestFor: "Vision économique sans clé API",
  },
  "mistral-small-3.2-24b-instruct-2506": {
    strengths: ["Compact, multimodal, très économique", "Inclus dans l'abonnement"],
    weaknesses: ["Modèle plus petit"],
    bestFor: "Usage courant multimodal économique sans clé API",
  },
  "devstral-2-123b-instruct-2512": {
    strengths: [
      "Spécialisé code/agents (open-weight)",
      "Long contexte",
      "Inclus dans l'abonnement",
    ],
    weaknesses: ["Texte seul"],
    bestFor: "Code et agents sans clé API",
  },
  "gpt-oss-120b": {
    strengths: ["Poids ouverts d'OpenAI, bon rapport perf/prix", "Inclus dans l'abonnement"],
    weaknesses: ["Texte seul"],
    bestFor: "Raisonnement économique open-weight sans clé API",
  },
  "gemma-3-27b-it": {
    strengths: ["Multimodal open-weight (Google)", "Inclus dans l'abonnement"],
    weaknesses: ["Génération précédente (Gemma 3)"],
    bestFor: "Vision généraliste sans clé API",
  },
  "holo2-30b-a3b": {
    strengths: ["MoE multimodal open-weight, rapide", "Inclus dans l'abonnement"],
    weaknesses: ["Modèle récent, moins éprouvé"],
    bestFor: "Multimodal rapide sans clé API",
  },
  o3: { strengths: ["Raisonnement profond (maths, sciences)"], weaknesses: ["Lent", "Moins naturel en conversation"], bestFor: "Problèmes durs nécessitant de la réflexion" },
  gemma2: { strengths: ["Léger et efficace (Google, open-weight)"], weaknesses: ["Génération précédente", "Texte seul"], bestFor: "Assistant local léger" },
  phi4: { strengths: ["Petit modèle fort en raisonnement"], weaknesses: ["Texte seul", "Connaissances plus limitées"], bestFor: "Raisonnement local léger" },
};

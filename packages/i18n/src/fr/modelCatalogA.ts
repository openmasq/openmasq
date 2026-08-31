/**
 * The FR catalogue's « modelCatalogA » slice — the SOURCE language. What a model's card
 * says about it; the facts (profile, price, context) stay in `@openmasq/llm`.
 */
import type { Messages } from "../messages";

export const modelCatalogA: Record<string, Messages["modelCatalog"]["models"][string]> = {
  "gpt-5.5": {
    strengths: ["Raisonnement et agentique de pointe", "Multimodal, très grand contexte"],
    weaknesses: ["Le plus cher de la gamme", "Plus lent que les variantes légères"],
    bestFor: "Tâches complexes, agents à outils, analyse approfondie",
  },
  "gpt-5.4": {
    strengths: ["Excellent rapport capacité/latence", "Fort en code et en outils"],
    weaknesses: ["Reste coûteux", "Un cran sous 5.5 sur les tâches les plus dures"],
    bestFor: "Usage quotidien exigeant, code, agents",
  },
  "gpt-5.4-mini": {
    strengths: ["Bon compromis qualité/prix", "Rapide et multimodal"],
    weaknesses: ["Moins fiable sur le raisonnement long"],
    bestFor: "Volume, chat réactif, tâches courantes",
  },
  "gpt-5.4-nano": {
    strengths: ["Très rapide et très économique"],
    weaknesses: ["Capacités limitées sur les tâches complexes"],
    bestFor: "Classification, extraction, haute cadence",
  },
  "gpt-4.1": {
    strengths: ["Fenêtre de 1M tokens", "Solide en code"],
    weaknesses: ["Génération précédente (dépréciée par OpenAI)"],
    bestFor: "Gros documents, refactoring, contexte massif",
  },
  "gpt-4.1-mini": {
    strengths: ["1M tokens à faible coût"],
    weaknesses: ["Raisonnement moyen"],
    bestFor: "Traitement de gros contexte à bas prix",
  },
  "gpt-4.1-nano": {
    strengths: ["Le moins cher à très grand contexte"],
    weaknesses: ["Peu adapté aux tâches difficiles"],
    bestFor: "Extraction sur gros volumes",
  },
  "gpt-4o": {
    strengths: ["Multimodal temps réel", "Polyvalent"],
    weaknesses: ["Génération précédente"],
    bestFor: "Chat multimodal général",
  },
  "gpt-4o-mini": {
    strengths: ["Rapide et bon marché"],
    weaknesses: ["Capacités limitées"],
    bestFor: "Tâches simples à grand volume",
  },
  "o4-mini": {
    strengths: ["Raisonnement économique et rapide"],
    weaknesses: ["Sous o3 sur les tâches les plus dures"],
    bestFor: "Raisonnement au quotidien à moindre coût",
  },
  "o3-mini": {
    strengths: ["Bon raisonnement, léger"],
    weaknesses: ["Texte seul (pas de vision)"],
    bestFor: "Raisonnement textuel économique",
  },
  "claude-fable-5": {
    strengths: ["Le plus capable de la gamme Claude", "Écriture et code d'excellence"],
    weaknesses: ["Le plus cher"],
    bestFor: "Rédaction premium, code, raisonnement long",
  },
  "claude-opus-4-8": {
    strengths: ["Flagship agentique et code", "Très fiable sur les longues tâches"],
    weaknesses: ["Coûteux, plus lent que Sonnet"],
    bestFor: "Agents, gros projets de code, analyse",
  },
  "claude-sonnet-5": {
    strengths: ["Excellent équilibre capacité/vitesse", "Très bon en code"],
    weaknesses: ["Un cran sous Opus/Fable sur le plus dur"],
    bestFor: "Le choix par défaut : puissant et rapide",
  },
  "claude-sonnet-4-6": {
    strengths: ["Solide en code", "Grand contexte"],
    weaknesses: ["Génération précédente"],
    bestFor: "Code et tâches générales",
  },
  "claude-cli": {
    strengths: ["Compris dans votre abonnement Claude", "Aucune clé API à gérer"],
    weaknesses: ["Texte seul", "Nécessite la CLI Claude Code installée et connectée"],
    bestFor: "Utiliser votre abonnement Claude existant",
  },
  "claude-cli-sonnet": {
    strengths: ["Équilibre capacité/vitesse", "Compris dans votre abonnement Claude"],
    weaknesses: ["Texte seul"],
    bestFor: "Le choix par défaut de l'abonnement",
  },
  "claude-cli-opus": {
    strengths: ["Le plus capable de l'abonnement", "Compris dans votre abonnement Claude"],
    weaknesses: ["Texte seul", "Selon l'offre (absent du plan Pro)"],
    bestFor: "Les tâches les plus dures",
  },
  "codex-cli": {
    strengths: ["Compris dans votre abonnement ChatGPT", "Aucune clé API à gérer"],
    weaknesses: ["Texte seul", "Nécessite la CLI Codex installée et connectée"],
    bestFor: "Utiliser votre abonnement ChatGPT existant",
  },
  "claude-cli-haiku": {
    strengths: ["Très rapide", "Compris dans votre abonnement Claude"],
    weaknesses: ["Texte seul", "Moins profond que Sonnet/Opus"],
    bestFor: "Brouillons et questions rapides",
  },
  "claude-haiku-4-5": {
    strengths: ["Très rapide", "Multimodal, bon marché"],
    weaknesses: ["Contexte 200K (vs 1M)", "Raisonnement moyen"],
    bestFor: "Réponses rapides, volume, multimodal léger",
  },
  "gemini-3.1-pro-preview": {
    strengths: ["Flagship Gemini, 1M tokens", "Multimodal fort"],
    weaknesses: ["Version preview", "Moins spécialisé code que les GPT/Claude"],
    bestFor: "Analyse multimodale, très grands documents",
  },
  "gemini-3.5-flash": {
    strengths: ["Rapide, multimodal, 1M tokens"],
    weaknesses: ["Sous Pro sur le raisonnement dur"],
    bestFor: "Multimodal réactif à grand contexte",
  },
  "gemini-3.1-flash-lite": {
    strengths: ["Ultra économique à grand contexte"],
    weaknesses: ["Capacités limitées"],
    bestFor: "Extraction/résumé sur gros volumes",
  },
  "gemini-2.5-pro": {
    strengths: ["Flagship de la génération précédente"],
    weaknesses: ["Génération précédente"],
    bestFor: "Analyse multimodale et long contexte",
  },
  "gemini-2.5-flash": {
    strengths: ["Rapide et multimodal"],
    weaknesses: ["Génération précédente"],
    bestFor: "Chat multimodal réactif",
  },
  "gemini-2.5-flash-lite": {
    strengths: ["Très bon marché"],
    weaknesses: ["Capacités basiques"],
    bestFor: "Tâches simples à grand volume",
  },
  "gemini-2.0-flash": {
    strengths: ["Rapide, multimodal, très abordable"],
    weaknesses: ["Génération précédente"],
    bestFor: "Multimodal économique",
  },
  "mistral-large-2512": {
    strengths: ["Fort en multilingue et en code"],
    weaknesses: ["Texte seul (pas de vision)"],
    bestFor: "Raisonnement et code multilingues",
  },
  "mistral-medium-2508": {
    strengths: ["Très bon rapport qualité/prix", "Multimodal"],
    weaknesses: ["Sous Large sur le plus dur"],
    bestFor: "Usage général équilibré",
  },
  "mistral-small-2506": {
    strengths: ["Open-weight, rapide et bon marché"],
    weaknesses: ["Capacités moyennes"],
    bestFor: "Auto-hébergement, tâches courantes",
  },
  "codestral-latest": {
    strengths: ["Spécialisé code (complétion, FIM)", "Rapide et abordable"],
    weaknesses: ["Peu adapté aux tâches non-code"],
    bestFor: "Autocomplétion et génération de code",
  },
  "pixtral-large-latest": {
    strengths: ["Multimodal open-weight puissant"],
    weaknesses: ["Moins fort en code pur"],
    bestFor: "Compréhension d'images et documents",
  },
  "ministral-8b-2512": {
    strengths: ["Petit modèle edge, très rapide"],
    weaknesses: ["Texte seul", "Capacités limitées"],
    bestFor: "Edge/on-device, tâches simples",
  },
  "deepseek-v4-pro": {
    strengths: ["Raisonnement et code de haut niveau (open-weight)", "Très grand contexte (1M)"],
    weaknesses: ["Texte seul", "Hébergé en Chine (résidence des données)"],
    bestFor: "Code et raisonnement exigeants, gros contexte",
  },
  "deepseek-v4-flash": {
    strengths: ["Rapide et très économique", "Très grand contexte (1M)"],
    weaknesses: ["Texte seul", "Sous la variante Pro sur le plus dur", "Hébergé en Chine"],
    bestFor: "Code réactif et gros volumes à bas coût",
  },
};

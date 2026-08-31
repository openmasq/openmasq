/**
 * Tranche « modelCatalogB » du catalogue EN — traduit de la source (`../fr/modelCatalogB.ts`).
 */
import type { Messages } from "../messages";

export const modelCatalogB: Record<string, Messages["modelCatalog"]["models"][string]> = {
  "openai/gpt-5.6-luna": {
    strengths: [
      "Very large context (1M) for a handful of cents",
      "Multimodal, tools and reasoning",
    ],
    weaknesses: ["Proprietary model", "Variable hosting (aggregator)"],
    bestFor: "The budget all-rounder of the simplified view",
  },
  "moonshotai/kimi-k2.6": {
    strengths: ["Strong at code and agentic use", "Parallel tool calls, 262k context"],
    weaknesses: ["Output pricier than input", "Variable hosting (aggregator)"],
    bestFor: "Code and tool chains, via OpenRouter",
  },
  "x-ai/grok-4.20": {
    strengths: [
      "xAI flagship, multimodal, very large context (2M)",
      "Access through a single OpenRouter key",
    ],
    weaknesses: ["Proprietary model", "Variable price/availability (aggregator)"],
    bestFor: "Multimodal reasoning over very large context",
  },
  "deepseek/deepseek-chat-v3.1": {
    strengths: ["Strong at code and reasoning (open-weight)", "Cheap via OpenRouter"],
    weaknesses: ["Text only", "Variable hosting (aggregator)"],
    bestFor: "Budget code and reasoning via OpenRouter",
  },
  "qwen/qwen3-vl-32b-instruct": {
    strengths: ["Open-weight multimodal (vision), cheap", "Large context"],
    weaknesses: ["Variable hosting (aggregator)"],
    bestFor: "Image + text understanding at low cost",
  },
  "qwen/qwen3-235b-a22b": {
    strengths: ["Large open-weight MoE, multilingual"],
    weaknesses: ["Text only", "Heavier → higher latency"],
    bestFor: "Demanding multilingual tasks via OpenRouter",
  },
  "meta-llama/llama-3.3-70b-instruct": {
    strengths: ["Versatile open-weight, very affordable"],
    weaknesses: ["Text only", "Below the proprietary flagships"],
    bestFor: "Low-cost general assistant via OpenRouter",
  },
  "mistralai/mistral-small-3.2-24b-instruct": {
    strengths: ["Small open-weight multimodal model, fast and cheap"],
    weaknesses: ["Average on the hardest tasks"],
    bestFor: "Budget everyday multimodal tasks",
  },
  "poolside/laguna-s-2.1:free": {
    strengths: ["Free, no key or subscription", "Large context (262k), tools and reasoning"],
    weaknesses: ["Text only", "Free tier: availability not guaranteed"],
    bestFor: "The default model — write right away, nothing to set up",
  },
  "nvidia/nemotron-3-ultra-550b-a55b:free": {
    strengths: [
      "Very large open-weight model, strong reasoning",
      "Free via OpenRouter, 1M context",
    ],
    weaknesses: ["Text only", "Heavy → higher latency", "Free tier: variable quotas"],
    bestFor: "Free top-level reasoning, large context",
  },
  "nvidia/nemotron-3-super-120b-a12b:free": {
    strengths: ["Powerful open-weight, 1M context", "Free via OpenRouter"],
    weaknesses: ["Text only", "Free tier: variable quotas"],
    bestFor: "Free reasoning at large context",
  },
  "google/gemma-4-31b-it:free": {
    strengths: ["Open-weight multimodal (Google), free via OpenRouter"],
    weaknesses: ["Free tier: variable quotas/latency"],
    bestFor: "Free multimodal at large context",
  },
  "google/gemma-4-26b-a4b-it:free": {
    strengths: ["Compact open-weight multimodal MoE, fast", "Free via OpenRouter"],
    weaknesses: ["Free tier: variable quotas"],
    bestFor: "Free snappy multimodal",
  },
  "openai/gpt-oss-20b:free": {
    strengths: ["OpenAI open weights, light and fast", "Free via OpenRouter"],
    weaknesses: ["Text only", "Lesser capabilities than the 120B", "Free tier: variable quotas"],
    bestFor: "Free lightweight assistant (OpenAI open weights)",
  },
  "cohere/north-mini-code:free": {
    strengths: ["Small code model, free via OpenRouter, large context"],
    weaknesses: ["Text only", "Poorly suited outside code", "Free tier: variable quotas"],
    bestFor: "Free code completion",
  },
  "tencent/hy3:free": {
    strengths: ["Versatile open-weight, free via OpenRouter, large context"],
    weaknesses: ["Text only", "Free tier: variable quotas/latency"],
    bestFor: "Free general use via OpenRouter",
  },
  "nvidia/nemotron-nano-9b-v2:free": {
    strengths: ["Small fast open-weight model", "Free via OpenRouter"],
    weaknesses: ["Text only", "Limited capabilities", "Free tier: variable quotas"],
    bestFor: "Free simple tasks, high throughput",
  },
  "llama3.3": {
    strengths: ["Versatile open-weight", "Free locally"],
    weaknesses: ["Text only", "Below the proprietary flagships"],
    bestFor: "Private, versatile local assistant",
  },
  "llama3.1": {
    strengths: ["Proven open-weight, free locally"],
    weaknesses: ["Previous generation", "Text only"],
    bestFor: "General local assistant",
  },
  "qwen2.5": {
    strengths: ["Strong multilingual open-weight"],
    weaknesses: ["Text only"],
    bestFor: "Local multilingual, general tasks",
  },
  "qwen2.5-coder": {
    strengths: ["Excellent open-weight code model"],
    weaknesses: ["Poorly suited outside code"],
    bestFor: "Local code (private, free)",
  },
  "deepseek-r1": {
    strengths: ["Top-level open-weight reasoning"],
    weaknesses: ["Slow", "Text only, verbose"],
    bestFor: "Local reasoning on hard problems",
  },
  "mistral-nemo": {
    strengths: ["Balanced open-weight, multilingual"],
    weaknesses: ["Text only"],
    bestFor: "Multilingual local assistant",
  },
  "glm-5.2": {
    strengths: [
      "Strong reasoning/agentic (open-weight)",
      "Very large context (long-horizon)",
      "Included in the subscription",
    ],
    weaknesses: ["Text only"],
    bestFor: "Agents, code and long tasks with no API key",
  },
  "qwen3.5-397b-a17b": {
    strengths: ["Very large open-weight MoE, multimodal", "Included in the subscription"],
    weaknesses: ["Heavier → higher latency"],
    bestFor: "Demanding tasks with no API key",
  },
  "qwen3.6-35b-a3b": {
    strengths: ["Compact MoE, fast and multimodal", "Included in the subscription"],
    weaknesses: ["Below the 397B on the hardest tasks"],
    bestFor: "Fast general use with no API key",
  },
  "gemma-4-26b-a4b-it": {
    strengths: ["Light, fast, multimodal (open-weight)", "Included in the subscription"],
    weaknesses: ["Average capabilities"],
    bestFor: "Budget everyday tasks with no API key",
  },
  "mistral-medium-3.5-128b": {
    strengths: ["Balanced and multimodal", "Included in the subscription"],
    weaknesses: ["Proprietary model (hosted)"],
    bestFor: "Balanced general use with no API key",
  },
  "llama-3.3-70b-instruct": {
    strengths: ["Solid open-weight generalist", "Included in the subscription"],
    weaknesses: ["Text only", "Previous generation"],
    bestFor: "General open-weight assistant with no API key",
  },
  "qwen3-235b-a22b-instruct-2507": {
    strengths: [
      "Large open-weight MoE, strong reasoning",
      "Long context",
      "Included in the subscription",
    ],
    weaknesses: ["Text only", "Higher latency"],
    bestFor: "Demanding (text) tasks with no API key",
  },
  "qwen3-coder-30b-a3b-instruct": {
    strengths: ["Code-specialised, fast and cheap", "Long context", "Included in the subscription"],
    weaknesses: ["Text only"],
    bestFor: "Budget code with no API key",
  },
  "pixtral-12b-2409": {
    strengths: ["Light and cheap multimodal", "Included in the subscription"],
    weaknesses: ["Average capabilities"],
    bestFor: "Budget vision with no API key",
  },
  "mistral-small-3.2-24b-instruct-2506": {
    strengths: ["Compact, multimodal, very cheap", "Included in the subscription"],
    weaknesses: ["Smaller model"],
    bestFor: "Budget everyday multimodal use with no API key",
  },
  "devstral-2-123b-instruct-2512": {
    strengths: [
      "Code/agent-specialised (open-weight)",
      "Long context",
      "Included in the subscription",
    ],
    weaknesses: ["Text only"],
    bestFor: "Code and agents with no API key",
  },
  "gpt-oss-120b": {
    strengths: ["OpenAI open weights, good performance/price", "Included in the subscription"],
    weaknesses: ["Text only"],
    bestFor: "Budget open-weight reasoning with no API key",
  },
  "gemma-3-27b-it": {
    strengths: ["Open-weight multimodal (Google)", "Included in the subscription"],
    weaknesses: ["Previous generation (Gemma 3)"],
    bestFor: "General-purpose vision with no API key",
  },
  "holo2-30b-a3b": {
    strengths: ["Open-weight multimodal MoE, fast", "Included in the subscription"],
    weaknesses: ["Recent model, less proven"],
    bestFor: "Fast multimodal with no API key",
  },
  o3: { strengths: ["Deep reasoning (maths, science)"], weaknesses: ["Slow", "Less natural in conversation"], bestFor: "Hard problems that need real thinking" },
  gemma2: { strengths: ["Light and efficient (Google, open-weight)"], weaknesses: ["Previous generation", "Text only"], bestFor: "A light local assistant" },
  phi4: { strengths: ["A small model that reasons well"], weaknesses: ["Text only", "More limited knowledge"], bestFor: "Light local reasoning" },
};

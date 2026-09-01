/**
 * The EN catalogue's « modelCatalogA » slice — translated from the source (`../fr/modelCatalogA.ts`).
 */
import type { Messages } from "../messages";

export const modelCatalogA: Record<string, Messages["modelCatalog"]["models"][string]> = {
  "gpt-5.5": {
    strengths: ["State-of-the-art reasoning and agentic work", "Multimodal, very large context"],
    weaknesses: ["The most expensive of the range", "Slower than the light variants"],
    bestFor: "Complex tasks, tool-using agents, deep analysis",
  },
  "gpt-5.4": {
    strengths: ["Excellent capability/latency ratio", "Strong at code and tools"],
    weaknesses: ["Still costly", "A notch below 5.5 on the hardest tasks"],
    bestFor: "Demanding daily use, code, agents",
  },
  "gpt-5.4-mini": {
    strengths: ["Good quality/price compromise", "Fast and multimodal"],
    weaknesses: ["Less reliable on long reasoning"],
    bestFor: "Volume, snappy chat, everyday tasks",
  },
  "gpt-5.4-nano": {
    strengths: ["Very fast and very cheap"],
    weaknesses: ["Limited on complex tasks"],
    bestFor: "Classification, extraction, high throughput",
  },
  "gpt-4.1": {
    strengths: ["1M-token window", "Solid at code"],
    weaknesses: ["Previous generation (deprecated by OpenAI)"],
    bestFor: "Large documents, refactoring, massive context",
  },
  "gpt-4.1-mini": {
    strengths: ["1M tokens at low cost"],
    weaknesses: ["Average reasoning"],
    bestFor: "Large-context processing on a budget",
  },
  "gpt-4.1-nano": {
    strengths: ["The cheapest at very large context"],
    weaknesses: ["Poorly suited to hard tasks"],
    bestFor: "Extraction over large volumes",
  },
  "gpt-4o": {
    strengths: ["Real-time multimodal", "Versatile"],
    weaknesses: ["Previous generation"],
    bestFor: "General multimodal chat",
  },
  "gpt-4o-mini": {
    strengths: ["Fast and cheap"],
    weaknesses: ["Limited capabilities"],
    bestFor: "Simple tasks at high volume",
  },
  "o4-mini": {
    strengths: ["Cheap and fast reasoning"],
    weaknesses: ["Below o3 on the hardest tasks"],
    bestFor: "Everyday reasoning at lower cost",
  },
  "o3-mini": {
    strengths: ["Good reasoning, lightweight"],
    weaknesses: ["Text only (no vision)"],
    bestFor: "Budget text reasoning",
  },
  "claude-fable-5": {
    strengths: ["The most capable of the Claude range", "Outstanding writing and code"],
    weaknesses: ["The most expensive"],
    bestFor: "Premium writing, code, long reasoning",
  },
  "claude-opus-4-8": {
    strengths: ["Agentic and code flagship", "Very reliable on long tasks"],
    weaknesses: ["Costly, slower than Sonnet"],
    bestFor: "Agents, large code projects, analysis",
  },
  "claude-sonnet-5": {
    strengths: ["Excellent capability/speed balance", "Very good at code"],
    weaknesses: ["A notch below Opus/Fable on the hardest tasks"],
    bestFor: "The default choice: powerful and fast",
  },
  "claude-sonnet-4-6": {
    strengths: ["Solid at code", "Large context"],
    weaknesses: ["Previous generation"],
    bestFor: "Code and general tasks",
  },
  "claude-cli": {
    strengths: ["Included in your Claude subscription", "No API key to manage"],
    weaknesses: ["Text only", "Requires the Claude Code CLI installed and signed in"],
    bestFor: "Use your existing Claude subscription",
  },
  "claude-cli-sonnet": {
    strengths: ["Capability/speed balance", "Included in your Claude subscription"],
    weaknesses: ["Text only"],
    bestFor: "The subscription's default choice",
  },
  "claude-cli-opus": {
    strengths: ["The most capable of the subscription", "Included in your Claude subscription"],
    weaknesses: ["Text only", "Depends on the plan (absent from Pro)"],
    bestFor: "The hardest tasks",
  },
  "codex-cli": {
    strengths: ["Included in your ChatGPT subscription", "No API key to manage"],
    weaknesses: ["Text only", "Requires the Codex CLI installed and signed in"],
    bestFor: "Use your existing ChatGPT subscription",
  },
  "antigravity-cli": {
    strengths: ["Included in your Google subscription", "No API key to manage"],
    weaknesses: [
      "Text only",
      "Without the app's connectors",
      "Requires the Antigravity CLI installed and signed in",
    ],
    bestFor: "Use your existing Antigravity subscription",
  },
  "claude-cli-haiku": {
    strengths: ["Very fast", "Included in your Claude subscription"],
    weaknesses: ["Text only", "Shallower than Sonnet/Opus"],
    bestFor: "Drafts and quick questions",
  },
  "claude-haiku-4-5": {
    strengths: ["Very fast", "Multimodal, cheap"],
    weaknesses: ["200K context (vs 1M)", "Average reasoning"],
    bestFor: "Quick replies, volume, light multimodal",
  },
  "gemini-3.1-pro-preview": {
    strengths: ["Gemini flagship, 1M tokens", "Strong multimodal"],
    weaknesses: ["Preview version", "Less code-specialised than GPT/Claude"],
    bestFor: "Multimodal analysis, very large documents",
  },
  "gemini-3.5-flash": {
    strengths: ["Fast, multimodal, 1M tokens"],
    weaknesses: ["Below Pro on hard reasoning"],
    bestFor: "Snappy multimodal at large context",
  },
  "gemini-3.1-flash-lite": {
    strengths: ["Ultra cheap at large context"],
    weaknesses: ["Limited capabilities"],
    bestFor: "Extraction/summaries over large volumes",
  },
  "gemini-2.5-pro": {
    strengths: ["Previous-generation flagship"],
    weaknesses: ["Previous generation"],
    bestFor: "Multimodal analysis and long context",
  },
  "gemini-2.5-flash": {
    strengths: ["Fast and multimodal"],
    weaknesses: ["Previous generation"],
    bestFor: "Snappy multimodal chat",
  },
  "gemini-2.5-flash-lite": {
    strengths: ["Very cheap"],
    weaknesses: ["Basic capabilities"],
    bestFor: "Simple tasks at high volume",
  },
  "gemini-2.0-flash": {
    strengths: ["Fast, multimodal, very affordable"],
    weaknesses: ["Previous generation"],
    bestFor: "Budget multimodal",
  },
  "mistral-large-2512": {
    strengths: ["Strong at multilingual work and code"],
    weaknesses: ["Text only (no vision)"],
    bestFor: "Multilingual reasoning and code",
  },
  "mistral-medium-2508": {
    strengths: ["Very good quality/price ratio", "Multimodal"],
    weaknesses: ["Below Large on the hardest tasks"],
    bestFor: "Balanced general use",
  },
  "mistral-small-2506": {
    strengths: ["Open-weight, fast and cheap"],
    weaknesses: ["Average capabilities"],
    bestFor: "Self-hosting, everyday tasks",
  },
  "codestral-latest": {
    strengths: ["Code-specialised (completion, FIM)", "Fast and affordable"],
    weaknesses: ["Poorly suited to non-code tasks"],
    bestFor: "Code autocompletion and generation",
  },
  "pixtral-large-latest": {
    strengths: ["Powerful open-weight multimodal"],
    weaknesses: ["Weaker at pure code"],
    bestFor: "Understanding images and documents",
  },
  "ministral-8b-2512": {
    strengths: ["Small edge model, very fast"],
    weaknesses: ["Text only", "Limited capabilities"],
    bestFor: "Edge/on-device, simple tasks",
  },
  "deepseek-v4-pro": {
    strengths: ["Top-level reasoning and code (open-weight)", "Very large context (1M)"],
    weaknesses: ["Text only", "Hosted in China (data residency)"],
    bestFor: "Demanding code and reasoning, large context",
  },
  "deepseek-v4-flash": {
    strengths: ["Fast and very cheap", "Very large context (1M)"],
    weaknesses: ["Text only", "Below the Pro variant on the hardest tasks", "Hosted in China"],
    bestFor: "Snappy code and large volumes at low cost",
  },
};

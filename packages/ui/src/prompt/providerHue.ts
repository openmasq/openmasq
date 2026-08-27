import type { ProviderId } from "@openmasq/llm";

/**
 * Provider → teinte de la palette (`var(--hl-<hue>)`).
 *
 * Ce fait sert DEUX surfaces : l'écran Usage du bureau (`pages/Settings/billing/usageHue.ts`)
 * et la console d'administration web, dont l'Overview empile ses barres par modèle. Il vit
 * donc ici, exporté par le barrel, plutôt qu'en deux tables qui divergent le jour où un
 * fournisseur s'ajoute — un modèle porterait alors une couleur sur un écran et une autre
 * ailleurs, ce que personne ne lit comme un bug tant qu'on ne met pas les deux côte à côte.
 *
 * Déterministe et total : tout ce qui n'est pas listé tombe sur violet, jamais sur une
 * couleur tirée au hasard (deux fournisseurs inconnus doivent se ressembler, pas mentir sur
 * une distinction qui n'existe pas).
 */
const PROVIDER_HUE: Partial<Record<ProviderId, string>> = {
  anthropic: "pink",
  "anthropic-session": "pink",
  "claude-cli": "pink",

  openai: "mint",
  "codex-cli": "mint",
  "openai-session": "mint",
  "openai-compat": "mint",
  google: "sky",
  mistral: "amber",
  // teal, PAS lime : le lime est l'accent de MARQUE, pas une teinte de la palette de
  // redaction — il n'a d'ailleurs pas de `--ink-on-hl-lime` côté console. Une couleur de
  // donnée qui ne peut pas dire quelle encre se pose dessus n'est pas utilisable comme
  // telle ; le kit a fait le même arbitrage de son côté.
  scaleway: "teal",
};

/** Nom de teinte pour un fournisseur — à composer en `var(--hl-<hue>)`. */
export const hueForProvider = (p?: ProviderId | string | null): string =>
  (p && PROVIDER_HUE[p as ProviderId]) || "violet";

import { MODEL_PRICING, MODEL_CONTEXT, MODEL_TPM } from "@openmasq/llm";

/** Compact token count: 128000 → "128k", 1048576 → "1M", 2250000 → "2.25M". */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${Number.isInteger(m) ? m : Number(m.toFixed(2))}M`;
  }
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

/** Un montant en dollars, virgule française et zéros inutiles retirés (2.5 → « 2,50 $ »
 *  → « 2,5 $ »). Même écriture que le panneau de détail, qui est la version longue. */
function fmtUsd(n: number): string {
  return `${fmtNum(n)} $`;
}
/** Le nombre seul — pour la paire « 0,4/2 $ » où l'unité ne se dit qu'une fois. */
function fmtNum(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

/**
 * Formatted metadata shown under a model in the picker. Fields are absent when
 * we have no data for that model (local price, non-Mistral TPM…).
 *
 * ⚠️ **Chaque valeur se lit SANS glossaire — mais le glossaire a changé de forme (14/08).**
 * C'étaient « $0.4 / $2 », « 128k ctx », « 25k TPM » : des sigles muets (11/08). Puis des
 * MOTS (« Prix… Contexte… Débit… ») — lisibles, mais trois mots par ligne sur ~70 lignes.
 * Aujourd'hui : une ICÔNE porte le référent (pièces = prix, livre = contexte, jauge =
 * débit — appariées dans `ModelRow`) et le `*Title` OUVRE PAR LE MOT puis donne l'unité :
 * `brand/TooltipLayer` dessine tout `title`, au clavier comme au survol. Ne revenir ni
 * aux sigles nus (la leçon du 11/08) ni aux mots en ligne (celle du 14/08).
 */
export interface ModelMeta {
  /** Entrée / sortie, en dollars — e.g. « Prix 0,4 / 2 $ ». */
  price?: string;
  priceTitle?: string;
  /** Fenêtre de contexte — e.g. « Contexte 128k ». */
  context?: string;
  contextTitle?: string;
  /** Rate limit tokens/minute — e.g. « Débit 25k/min » (indicatif, lié au compte). */
  tpm?: string;
  tpmTitle?: string;
  /** The TPM is low enough (≤ 50k) to throttle the token-heavy MCP tool path. */
  tpmLow?: boolean;
}

export function modelMeta(id: string): ModelMeta {
  const p = MODEL_PRICING[id];
  const ctx = MODEL_CONTEXT[id];
  const tpm = MODEL_TPM[id];
  // Un modèle GRATUIT (0/0) ne porte pas de chip prix : le badge « gratuit » le dit
  // déjà, et « 0/0 $ » à côté se lit comme une anomalie, pas comme une information.
  const paid = p && (p.in > 0 || p.out > 0);
  return {
    price: paid ? `${fmtNum(p.in)}/${fmtNum(p.out)} $` : undefined,
    priceTitle: paid
      ? `Prix — tarif indicatif du fournisseur, pour environ un million de mots : ${fmtUsd(p.in)} ` +
        `pour ce que vous envoyez, ${fmtUsd(p.out)} pour la réponse du modèle.`
      : undefined,
    context: ctx ? fmtTokens(ctx) : undefined,
    contextTitle: ctx
      ? "Contexte — ce que le modèle peut lire d'un seul tenant — vos messages, ses réponses et les " +
        "documents joints compris. Au-delà, la conversation est résumée pour tenir."
      : undefined,
    tpm: tpm ? `${fmtTokens(tpm)}/min` : undefined,
    tpmTitle: tpm
      ? "Débit — ce que le fournisseur laisse passer par minute sur ce modèle. Un débit bas ralentit " +
        "surtout les tours qui utilisent vos outils connectés."
      : undefined,
    tpmLow: tpm != null && tpm <= 50_000,
  };
}

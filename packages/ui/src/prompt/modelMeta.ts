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

/** A dollar amount, French comma and useless zeros stripped (2.5 → « 2,50 $ »
 *  → « 2,5 $ »). Same formatting as the detail panel, which is the long version. */
function fmtUsd(n: number): string {
  return `${fmtNum(n)} $`;
}
/** The number alone — for the pair « 0,4/2 $ » where the unit is only said once. */
function fmtNum(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

/**
 * Formatted metadata shown under a model in the picker. Fields are absent when
 * we have no data for that model (local price, non-Mistral TPM…).
 *
 * ⚠️ **Every value reads WITHOUT a glossary — but the glossary changed shape (14/08).**
 * It used to be « $0.4 / $2 », « 128k ctx », « 25k TPM »: mute acronyms (11/08). Then
 * WORDS (« Prix… Contexte… Débit… ») — readable, but three words per line over ~70 lines.
 * Today: an ICON carries the referent (coins = price, book = context, gauge =
 * throughput — paired in `ModelRow`) and the `*Title` OPENS WITH THE WORD then gives the unit:
 * `brand/TooltipLayer` renders any `title`, on keyboard focus as on hover. Go back to neither
 * bare acronyms (the 11/08 lesson) nor inline words (the 14/08 one).
 */
export interface ModelMeta {
  /** Input / output, in dollars — e.g. « Prix 0,4 / 2 $ ». */
  price?: string;
  priceTitle?: string;
  /** Context window — e.g. « Contexte 128k ». */
  context?: string;
  contextTitle?: string;
  /** Rate limit tokens/minute — e.g. « Débit 25k/min » (indicative, tied to the account). */
  tpm?: string;
  tpmTitle?: string;
  /** The TPM is low enough (≤ 50k) to throttle the token-heavy MCP tool path. */
  tpmLow?: boolean;
}

export function modelMeta(id: string): ModelMeta {
  const p = MODEL_PRICING[id];
  const ctx = MODEL_CONTEXT[id];
  const tpm = MODEL_TPM[id];
  // A FREE model (0/0) doesn't carry a price chip: the « gratuit » badge already
  // says so, and « 0/0 $ » next to it reads as an anomaly, not as information.
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

import {
  PROVIDERS,
  MODEL_PRICING,
  isFreeModel,
  contextWindow,
  modelMeta,
  type ModelInfo,
} from "@openmasq/llm";
import { ModelLogo } from "../../components/brand";
import { CountryFlag } from "../../components/media/CountryFlag";

/** A USD-per-1M-tokens figure, trimmed (2.5 → "2,50 $", 0.04 → "0,04 $"). FR decimal
 *  comma to match the rest of the UI; the raw prices are USD list estimates. */
function fmtUsd(n: number): string {
  return `${n.toFixed(2).replace(/\.?0+$/, "").replace(".", ",")} $`;
}

/** One 1–5 capability bar (5 segments, filled to `value`). Higher = better. */
function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div className="model-bar">
      <span className="model-bar-label">{label}</span>
      <span className="model-bar-track" aria-label={`${label} ${value}/5`}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`model-bar-seg${i <= value ? " on" : ""}`} />
        ))}
      </span>
    </div>
  );
}

/** Human context-window figure (e.g. "1M", "200K"). */
function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

/**
 * The model picker's detail panel: a RELATIVE capability profile (indicative — NOT
 * a measured benchmark), plus qualitative strengths / tradeoffs / best-for, tags,
 * an open-source vs hosted badge, and the context window. Numeric `benchmarks` are
 * shown only when the metadata carries confidently-known real figures.
 */
export function ModelDetail({ model }: { model: ModelInfo }) {
  const meta = modelMeta(model.id);
  const ctx = contextWindow(model.id);
  const p = meta.profile;
  const host = PROVIDERS[model.provider].hostCountry;
  // Per-token list price (USD / 1M tokens). Absent for local/keyless models → no Tarif
  // section. Explicitly-zero = a free model, shown as "Gratuit" (see isFreeModel).
  const price = MODEL_PRICING[model.id];
  const free = isFreeModel(model.id);
  return (
    <div className="model-detail">
      <div className="model-detail-head">
        <ModelLogo provider={model.provider} modelId={model.id} size={30} tile />
        <div className="model-detail-title">
          <div className="model-detail-name">{model.label}</div>
          <div className="model-detail-vendor">{PROVIDERS[model.provider].label}</div>
        </div>
      </div>

      <div className="model-detail-badges">
        {host && (
          <span className="model-badge host">
            <CountryFlag host={host} size={12} />
            {host.label}
          </span>
        )}
        <span className={`model-badge ${meta.openSource ? "oss" : "hosted"}`}>
          {meta.openSource ? "Open source" : "Hébergé"}
        </span>
        {ctx && <span className="model-badge ctx">Contexte {fmtCtx(ctx)}</span>}
        {model.vision && <span className="model-badge">Vision</span>}
      </div>

      {price && (
        <div className="model-detail-section">
          {/* ⚠️ L'UNITÉ est dans le titre de la section, pas en note de bas de bloc :
              « Vos messages 2,5 $ » se lisait comme le prix d'un message (remonté le
              11/08). Un tarif que l'on peut lire comme mille fois trop cher n'est pas
              une information, c'est un repoussoir. */}
          <div className="cv-eyebrow">Tarif indicatif — pour environ 1 million de mots</div>
          {free ? (
            <p className="model-detail-price">
              <b>Gratuit</b>
            </p>
          ) : (
            <p className="model-detail-price">
              <span className="model-price-row">
                Ce que vous envoyez <b>{fmtUsd(price.in)}</b>
              </span>
              <span className="model-price-row">
                La réponse du modèle <b>{fmtUsd(price.out)}</b>
              </span>
              <span className="model-price-unit">
                Prix public du fournisseur, en dollars — ce n'est pas votre facture.
              </span>
            </p>
          )}
        </div>
      )}

      <div className="model-detail-section">
        <div className="cv-eyebrow">Profil (indicatif)</div>
        <div className="model-bars">
          <Bar label="Raisonnement" value={p.reasoning} />
          <Bar label="Code" value={p.coding} />
          <Bar label="Vitesse" value={p.speed} />
          <Bar label="Économie" value={p.cost} />
          <Bar label="Images" value={p.multimodal} />
        </div>
      </div>

      {meta.strengths.length > 0 && (
        <div className="model-detail-section">
          <div className="cv-eyebrow">Points forts</div>
          <ul className="model-detail-list">
            {meta.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {meta.weaknesses.length > 0 && (
        <div className="model-detail-section">
          <div className="cv-eyebrow">Compromis</div>
          <ul className="model-detail-list muted">
            {meta.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="model-detail-section">
        <div className="cv-eyebrow">Idéal pour</div>
        <p className="model-detail-bestfor">{meta.bestFor}</p>
      </div>

      {meta.tags.length > 0 && (
        <div className="model-detail-tags">
          {meta.tags.map((t) => (
            <span key={t} className="model-tag">
              {t}
            </span>
          ))}
        </div>
      )}

      {meta.benchmarks && meta.benchmarks.length > 0 && (
        <div className="model-detail-section">
          <div className="cv-eyebrow">Résultats de tests</div>
          <ul className="model-detail-list">
            {meta.benchmarks.map((b) => (
              <li key={b.name}>
                {b.name} : <b>{b.score}</b>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

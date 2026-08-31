import {
  PROVIDERS,
  MODEL_PRICING,
  isFreeModel,
  contextWindow,
  modelMeta,
  type ModelInfo,
} from "@openmasq/llm";
import { useT } from "../../i18n";
import { ModelLogo } from "../../components/brand";
import { CountryFlag } from "../../components/media/CountryFlag";
import { modelCopy, modelTagLabel } from "../../help/catalogCopy";

/** A USD-per-1M-tokens figure, trimmed (2.5 → "2,50 $", 0.04 → "0,04 $"). FR decimal
 *  comma to match the rest of the UI; the raw prices are USD list estimates. */
function fmtUsd(n: number): string {
  return `${n
    .toFixed(2)
    .replace(/\.?0+$/, "")
    .replace(".", ",")} $`;
}

/** One 1–5 capability bar (5 segments, filled to `value`). Higher = better. */
function Bar({ label, value }: { label: string; value: number }) {
  const t = useT();
  return (
    <div className="model-bar">
      <span className="model-bar-label">{label}</span>
      <span className="model-bar-track" aria-label={t.modelsTab.detail.barAria(label, value)}>
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
  const t = useT();
  const meta = modelMeta(model.id);
  const copy = modelCopy(model.id, meta, t);
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
          {meta.openSource ? t.modelsTab.detail.openSource : t.modelsTab.detail.hosted}
        </span>
        {ctx && <span className="model-badge ctx">{t.modelsTab.detail.context(fmtCtx(ctx))}</span>}
        {model.vision && <span className="model-badge">{t.modelsTab.detail.vision}</span>}
      </div>

      {price && (
        <div className="model-detail-section">
          {/* ⚠️ The UNIT is in the section title, not as a footnote under the block:
              « Vos messages 2,5 $ » read as the price of ONE message (reported on
              11/08). A rate that can be read as a thousand times too expensive isn't
              information, it's a deterrent. */}
          <div className="cv-eyebrow">{t.modelsTab.detail.priceEyebrow}</div>
          {free ? (
            <p className="model-detail-price">
              <b>{t.modelsTab.detail.free}</b>
            </p>
          ) : (
            <p className="model-detail-price">
              <span className="model-price-row">
                {t.modelsTab.detail.priceIn} <b>{fmtUsd(price.in)}</b>
              </span>
              <span className="model-price-row">
                {t.modelsTab.detail.priceOut} <b>{fmtUsd(price.out)}</b>
              </span>
              <span className="model-price-unit">{t.modelsTab.detail.priceUnit}</span>
            </p>
          )}
        </div>
      )}

      <div className="model-detail-section">
        <div className="cv-eyebrow">{t.modelsTab.detail.profileEyebrow}</div>
        <div className="model-bars">
          <Bar label={t.modelsTab.detail.reasoning} value={p.reasoning} />
          <Bar label={t.modelsTab.detail.coding} value={p.coding} />
          <Bar label={t.modelsTab.detail.speed} value={p.speed} />
          <Bar label={t.modelsTab.detail.cost} value={p.cost} />
          <Bar label={t.modelsTab.detail.images} value={p.multimodal} />
        </div>
      </div>

      {copy.strengths.length > 0 && (
        <div className="model-detail-section">
          <div className="cv-eyebrow">{t.modelsTab.detail.strengths}</div>
          <ul className="model-detail-list">
            {copy.strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      {copy.weaknesses.length > 0 && (
        <div className="model-detail-section">
          <div className="cv-eyebrow">{t.modelsTab.detail.tradeoffs}</div>
          <ul className="model-detail-list muted">
            {copy.weaknesses.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="model-detail-section">
        <div className="cv-eyebrow">{t.modelsTab.detail.bestFor}</div>
        <p className="model-detail-bestfor">{copy.bestFor}</p>
      </div>

      {meta.tags.length > 0 && (
        <div className="model-detail-tags">
          {meta.tags.map((tag) => (
            <span key={tag} className="model-tag">
              {modelTagLabel(tag, t)}
            </span>
          ))}
        </div>
      )}

      {meta.benchmarks && meta.benchmarks.length > 0 && (
        <div className="model-detail-section">
          <div className="cv-eyebrow">{t.modelsTab.detail.benchmarks}</div>
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

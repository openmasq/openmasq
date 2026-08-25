import { useState, type CSSProperties } from "react";
import { LockIcon, InfoIcon, ChevDownIcon } from "../../../components/brand";
import { REDACT_CATEGORIES, REDACT_CATEGORY_GROUPS, REDACT_GROUP_TONE } from "../../../privacy/redactCategories";
import type { RedactCategoryKey } from "../../../types";

/* The SHARED body of the "Règles de redaction" surface — the grouped category
   catalogue. Rendered BOTH inside RedactionRulesModal (scope tabs / org-lock /
   per-conversation override) AND in the onboarding rules step (global scope, no
   tabs), so the two stay pixel-identical. Scope + persistence are INJECTED via
   isOn/setCat — this component holds no app state, only presentation — its
   useStates are the open/closed detail line and the collapsed groups, pure view
   state. The detection engine is fixed (on-device NER), so there is no engine
   picker here anymore.

   A category is a CHIP that toggles on click, not a labelled row + Switch: 18 of
   them read as a wall of furniture at one-per-line, and the whole point is to scan
   what's on. The chip is the control, so it carries `aria-pressed` itself. Groups
   COLLAPSE (design-kit rules tree): the everyday sections open, the specialised
   ones folded behind their header, each with an n/N master toggle. */

/* Groups open at mount: the everyday ones. The rest fold behind their header —
   the master toggle still shows their n/N state while folded. */
const OPEN_GROUPS = new Set(["Identité", "Contact", "Localisation", "Organisation", "Financier"]);

/* Chip fill within its group's hue: earlier chips saturated, later ones paler
   (design-kit `shadeTone`) — so a group's chips read as one family, not a wall
   of identical pills. */
const chipShade = (tone: string, i: number, n: number) =>
  `color-mix(in oklch, ${tone} ${Math.max(45, 92 - i * (40 / Math.max(1, n - 1)))}%, #fff)`;

const groupId = (group: string) => `rrm-grp-${group.replace(/\W+/g, "-").toLowerCase()}`;

export function RedactionRulesContent({
  isOn,
  setCat,
  forced,
  isOverridden,
  onReset,
}: {
  isOn: (k: RedactCategoryKey) => boolean;
  setCat: (k: RedactCategoryKey, on: boolean) => void;
  /** Org-mandated keys: forced ON + locked (a member can't disable them). */
  forced?: Set<string>;
  /** Per-scope "modifié" tag (a conversation override differs from the default). */
  isOverridden?: (k: RedactCategoryKey) => boolean;
  /** When provided, renders the "réinitialiser" button (conversation scope only). */
  onReset?: () => void;
}) {
  const lockedSet = forced ?? new Set<string>();
  // The one open detail line (catalog `detail`): a chip's ⓘ toggles it, one at a time.
  // The chip itself keeps its toggle role — expansion must never flip a category.
  const [openDetail, setOpenDetail] = useState<RedactCategoryKey | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(REDACT_CATEGORY_GROUPS.filter((g) => !OPEN_GROUPS.has(g))),
  );
  const toggleGroup = (group: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  return (
    <>
      {REDACT_CATEGORY_GROUPS.map((group) => {
        const items = REDACT_CATEGORIES.filter((c) => c.group === group);
        if (!items.length) return null;
        // One colour per section — and it is THE colour a mark of that section wears in the
        // chat, in a document and in the privacy report: `REDACT_GROUP_TONE` is the palette's
        // source (`SECTION_HUE`), which `CATEGORY_HUE` also derives from. So this screen is a
        // legend of the real thing, not a parallel palette that can promise a colour the
        // marks don't use. Fallback keeps a new section visible if its hue ever goes missing.
        const groupTone = REDACT_GROUP_TONE[group] ?? "var(--hl-slate)";
        const open = !collapsed.has(group);
        const onCount = items.filter((t) => lockedSet.has(t.key) || isOn(t.key)).length;
        const allOn = onCount === items.length;
        const someOn = onCount > 0 && !allOn;
        // Master toggle: everything on ⇄ everything off. Org-locked keys stay on —
        // the UI gate mirrors the send-path enforcement, it never relaxes it.
        const setAll = () =>
          items.forEach((t) => {
            if (lockedSet.has(t.key)) return;
            if (isOn(t.key) !== !allOn) setCat(t.key, !allOn);
          });
        const tone = { "--cat-tone": groupTone } as CSSProperties;
        return (
          <div key={group} className="rrm-group">
            {/* Two sibling buttons, not one: a master toggle nested inside the
                collapse <button> would be invalid HTML and untabbable. */}
            <div className="rrm-group-row" style={tone}>
              <button
                type="button"
                className="rrm-group-head"
                onClick={() => toggleGroup(group)}
                aria-expanded={open}
                aria-controls={groupId(group)}
              >
                <span className={`rrm-group-chev${open ? " open" : ""}`}>
                  <ChevDownIcon size={15} />
                </span>
                <span className="rrm-group-swatch" />
                <span className="cv-eyebrow rrm-group-h">{group}</span>
              </button>
              <button
                type="button"
                className="rrm-master"
                onClick={setAll}
                aria-pressed={allOn}
                title={allOn ? "Tout désactiver" : "Tout activer"}
              >
                <span className="rrm-master-count">{onCount}/{items.length}</span>
                <span className={`rrm-master-sw${allOn ? " all" : someOn ? " some" : ""}`}>
                  <span className="rrm-master-knob" />
                </span>
              </button>
            </div>
            {open && (
            <div className="rrm-tags" id={groupId(group)}>
              {items.map((t, i) => {
                const locked = lockedSet.has(t.key);
                const on = locked || isOn(t.key);
                const overridden = !locked && (isOverridden?.(t.key) ?? false);
                const detailOpen = openDetail === t.key;
                return (
                  <span key={t.key} className="rrm-cat-wrap">
                  <button
                    type="button"
                    onClick={() => !locked && setCat(t.key, !on)}
                    // The chip IS the control, so it carries the on/off state the
                    // Switch used to expose. `aria-disabled` (not `disabled`) keeps a
                    // locked chip focusable, so its "why" tooltip is still reachable.
                    aria-pressed={on}
                    aria-disabled={locked || undefined}
                    // The catalog `detail` says what the short label can't — the REAL
                    // coverage behind the toggle ("ID national" hides ~40 countries,
                    // MRZ, plaques…). A locked chip keeps its "why" instead.
                    title={locked ? "Imposée par votre organisation" : t.detail}
                    className={`rrm-cat ${on ? "on" : ""}${locked ? " locked" : ""}`}
                    // ONLY the tone + its per-chip shade go inline (per-item data);
                    // every state that derives from them — off / on / hover — is mixed
                    // in CSS. Setting the colours here instead would make them inline,
                    // and an inline background/border CANNOT be overridden by a `:hover`
                    // rule, so the active chips would silently lose their hover.
                    // `.rrm-cat` declares its own `--cat-tone` default, so this must sit
                    // on the chip (an inherited value would lose to that default).
                    style={{
                      "--cat-tone": groupTone,
                      "--cat-shade": chipShade(groupTone, i, items.length),
                    } as CSSProperties}
                  >
                    <span className="rrm-dot" />
                    <span className="rrm-cat-label">{t.label}</span>
                    {t.ai && <span className="rrm-tag ai">BETA</span>}
                    {locked && (
                      <span className="rrm-tag lock">
                        <LockIcon size={11} />
                      </span>
                    )}
                    {overridden && <span className="rrm-tag">modifié</span>}
                  </button>
                  {t.detail && (
                    <button
                      type="button"
                      className={`rrm-cat-info ${detailOpen ? "open" : ""}`}
                      onClick={() => setOpenDetail(detailOpen ? null : t.key)}
                      aria-expanded={detailOpen}
                      aria-controls={`rrm-detail-${t.key}`}
                      aria-label={`Détail — ${t.label}`}
                      title="Voir ce que cette catégorie couvre"
                      style={{ "--cat-tone": groupTone } as CSSProperties}
                    >
                      <InfoIcon size={12} />
                    </button>
                  )}
                  </span>
                );
              })}
            </div>
            )}
            {open && (() => {
              // The expanded line renders UNDER its group's chip row (full width) —
              // inserting it inside the flex-wrap would tear the row apart.
              const openItem = items.find((c) => c.key === openDetail && c.detail);
              return openItem ? (
                <div
                  className="rrm-cat-detail"
                  id={`rrm-detail-${openItem.key}`}
                  style={{ "--cat-tone": groupTone } as CSSProperties}
                >
                  <strong>{openItem.label}</strong> — {openItem.detail}
                  {openItem.impact && (
                    // L'autre moitié de l'obligation de confiance (règle 8) : dire aussi
                    // ce que la protection peut FAUSSER — un âge calculé, une entreprise
                    // inconnue du modèle — là où l'on coche, pas dans une doc lointaine.
                    <span className="rrm-cat-impact">{openItem.impact}</span>
                  )}
                </div>
              ) : null;
            })()}
          </div>
        );
      })}

      {onReset && (
        <button className="rrm-reset" onClick={onReset}>
          Réinitialiser — hériter des réglages par défaut
        </button>
      )}
    </>
  );
}

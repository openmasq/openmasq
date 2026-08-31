import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../../../i18n";
import { AnimatePresence } from "framer-motion";
import { ShieldIcon, SearchIcon, DownloadIcon, EyeIcon, MessageIcon, ArrowRightIcon } from "../../../components/brand";
import { BrandLoader } from "../../../components/media/BrandLogo";
import type { Conversation } from "../../../types";
import { relTime } from "../shared";
import { PRIVACY_KINDS } from "../../../privacy/redactCategories";
import { AuditRevealModal } from "./AuditRevealModal";
import { AuditTimeline } from "./AuditTimeline";
import { UsageRange, DEFAULT_RANGE, type UsageRangeDays } from "../billing/UsageRange";
import {
  auditKindCounts,
  buildAuditGroups,
  countAuditRows,
  filterAuditGroups,
  takeAuditRows,
  type AuditRow,
} from "./auditRows";
import { BRAND } from "@openmasq/branding";
import { privacyKindLabel } from "../../../help/catalogCopy";

// The detailed redaction journal: every value the engine protected, rebuilt
// from the persisted `redactionVault` (fake→real) and `redactionKinds` (real→category). It
// shows what went OUT (the fake) next to what it replaced — the honest and
// re-readable account of reversible redaction. Local, it never leaves the machine.
//
// ⚠️ It reads PER CONVERSATION because the vault is: the why, with the data
// (`auditRows.ts`). Here, a single rendering consequence — the group header carries the
// title, the count and the date; the row now only carries the value.

// The list can hold thousands of entries: it is rendered in PAGES, via a scroll
// sentinel (IntersectionObserver), never in one block.
const PAGE_SIZE = 40;
const KIND_META = new Map(PRIVACY_KINDS.map((k) => [k.key, k]));

/** One CSV field — quote + escape embedded quotes. */
const csvCell = (s: string): string => `"${String(s).replace(/"/g, '""')}"`;

export function AuditRedactionView({
  conversations,
  onOpenMessage,
}: {
  conversations: Conversation[];
  /** Jump to the conversation (and, when known, the message where this value was
   *  protected). `msgId` is omitted when the value can't be located in a message. */
  onOpenMessage?: (convId: string, msgId?: string) => void;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  // Same control as the usage views: two graphs of the same product set differently make you doubt what you're reading.
  const [auditDays, setAuditDays] = useState<UsageRangeDays>(DEFAULT_RANGE);
  const [cat, setCat] = useState<string | null>(null);
  // The real value is masked in the table (shoulder-surfing); this is the
  // row the user clicked to reveal it. `null` = nothing revealed.
  const [reveal, setReveal] = useState<{ row: AuditRow; convTitle: string; at: number } | null>(null);

  const groups = useMemo(() => buildAuditGroups(conversations), [conversations]);
  const total = useMemo(() => countAuditRows(groups), [groups]);
  const cats = useMemo(() => auditKindCounts(groups), [groups]);
  const filtered = useMemo(() => filterAuditGroups(groups, { query: q, kind: cat }), [groups, q, cat]);
  const filteredCount = countAuditRows(filtered);

  const meta = (k: string) => KIND_META.get(k);

  // Real local CSV export of the filtered rows — a Blob, no server (the audit is
  // on the device). BOM so Excel reads UTF-8; CRLF line endings.
  const exportCsv = () => {
    if (filteredCount === 0) return;
    const head = ["Type", "Valeur réelle", "Remplacée par", "Conversation", "Quand"];
    const lines = [head.map(csvCell).join(",")];
    for (const g of filtered) {
      for (const r of g.rows) {
        lines.push(
          [privacyKindLabel(r.kind, t), r.original, r.fake, g.convTitle, new Date(g.at).toLocaleString(t.common.intlTag)]
            .map(csvCell)
            .join(","),
        );
      }
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${BRAND.slug}-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Progressive rendering: `limit` VALUES, one more page when the bottom sentinel enters
  // the viewport. Back to one page as soon as the filter changes.
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [q, cat]);
  const shown = useMemo(() => takeAuditRows(filtered, limit), [filtered, limit]);
  const shownCount = countAuditRows(shown);
  const hasMore = filteredCount > shownCount;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE_SIZE);
      },
      { rootMargin: "240px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  return (
    <section className="settings-section">
      {/* Dark hero — the headline count + a local CSV export. */}
      <div className="audit-hero">
        <span className="audit-hero-icon">
          <ShieldIcon size={22} />
        </span>
        <div className="audit-hero-text">
          <div className="audit-hero-num">
            {t.privacyTab.auditCount(total)}
          </div>
          <div className="audit-hero-sub">
            {t.privacyTab.auditSub}
          </div>
        </div>
        <button
          type="button"
          className="audit-export"
          onClick={exportCsv}
          disabled={filteredCount === 0}
          title={t.privacyTab.auditExportTip}
        >
          <DownloadIcon size={15} /> {t.privacyTab.auditExport}
        </button>
      </div>

      {total === 0 ? (
        <div className="settings-card audit-empty">
          <ShieldIcon size={22} />
          <p>{t.privacyTab.auditEmpty}</p>
        </div>
      ) : (
        <>
          {/* Redactions/day by category — same graph as the Usage tab, and its window control above. */}
          <div className="usage-filters"><UsageRange value={auditDays} onChange={setAuditDays} /></div>
          <AuditTimeline
            entries={groups.flatMap((g) => g.rows.map((r) => ({ at: g.at, kind: r.kind })))}
            days={auditDays}
          />

          <div className="audit-controls">
            <label className="audit-search">
              <SearchIcon size={15} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.privacyTab.auditSearch}
              />
            </label>
          </div>
          <div className="audit-chips">
            <button className={`audit-chip ${cat === null ? "on" : ""}`} onClick={() => setCat(null)}>
              {t.privacyTab.auditAll(total)}
            </button>
            {cats.map(({ key, n }) => {
              const m = meta(key);
              return (
                <button
                  key={key}
                  className={`audit-chip ${cat === key ? "on" : ""}`}
                  onClick={() => setCat(cat === key ? null : key)}
                >
                  {/* per-type colour is data-driven → inline */}
                  <span className="audit-dot" style={{ background: m?.fg ?? "var(--text-faint)" }} />
                  {privacyKindLabel(key, t)} · {n}
                </button>
              );
            })}
          </div>

          {shown.map((g) => (
            <div key={g.convId} className="settings-card audit-list">
              {/* The header CARRIES the conversation: title, count and date. Repeated on each
                  row, the title cluttered and the date promised the time of ONE value — which
                  the vault doesn't record. */}
              <div className="audit-group">
                {onOpenMessage ? (
                  <button
                    type="button"
                    className="audit-group-title audit-conv-link"
                    title={t.privacyTab.auditOpenConv(g.convTitle)}
                    onClick={() => onOpenMessage(g.convId, g.rows[0]?.msgId)}
                  >
                    <MessageIcon size={14} />
                    {g.convTitle}
                  </button>
                ) : (
                  <span className="audit-group-title">
                    <MessageIcon size={14} />
                    {g.convTitle}
                  </span>
                )}
                <span className="audit-group-n">
                  {t.privacyTab.auditValues(g.rows.length)}
                </span>
                <span className="audit-when">{relTime(g.at, t)}</span>
              </div>
              <div className="audit-grid audit-cols">
                {[t.privacyTab.auditColType, t.privacyTab.auditColReal, t.privacyTab.auditColFake].map((h) => (
                  <span key={h} className="audit-th">{h}</span>
                ))}
                <span className="audit-th" />
              </div>
              {g.rows.map((r) => {
                const m = meta(r.kind);
                return (
                  <div key={r.id} className="audit-grid audit-row">
                    <span className="audit-type" style={{ background: m?.bg }}>
                      <span className="audit-type-dot" style={{ background: m?.fg }} />
                      {privacyKindLabel(r.kind, t)}
                    </span>
                    {/* Real value MASKED by default (no `title` that leaks it); the click
                        reveals it in a modal. Fixed-length mask, so as not to give away
                        the length either. */}
                    <button
                      type="button"
                      className="audit-orig audit-reveal-btn"
                      onClick={() => setReveal({ row: r, convTitle: g.convTitle, at: g.at })}
                      aria-label={t.privacyTab.auditRevealAria}
                      title={t.privacyTab.auditRevealTip}
                    >
                      <span className="audit-mask">•••••••</span>
                      <EyeIcon size={13} />
                    </button>
                    <span className="audit-fake" title={r.fake}>{r.fake}</span>
                    {/* An ARROW, not a sentence: repeated on every row, « Aller au
                        message » shouted louder than the values you came to read. */}
                    {onOpenMessage && r.msgId ? (
                      <button
                        type="button"
                        className="audit-goto audit-conv-link"
                        title={t.privacyTab.auditGoToMessage}
                        aria-label={t.privacyTab.auditGoToMessage}
                        onClick={() => onOpenMessage(r.convId, r.msgId)}
                      >
                        <ArrowRightIcon size={15} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
          {hasMore ? (
            <div ref={sentinelRef} className="audit-loader">
              <BrandLoader size={22} mono />
              <span>{t.privacyTab.auditLoading(shownCount, filteredCount)}</span>
            </div>
          ) : (
            filteredCount > PAGE_SIZE && <div className="audit-note">{t.privacyTab.auditEntries(filteredCount)}</div>
          )}
        </>
      )}

      <AnimatePresence>
        {reveal && (
          <AuditRevealModal
            typeLabel={privacyKindLabel(reveal.row.kind, t)}
            typeFg={meta(reveal.row.kind)?.fg}
            typeBg={meta(reveal.row.kind)?.bg}
            original={reveal.row.original}
            fake={reveal.row.fake}
            convTitle={reveal.convTitle}
            at={reveal.at}
            onClose={() => setReveal(null)}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

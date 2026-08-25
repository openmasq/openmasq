import { useEffect, useMemo, useRef, useState } from "react";
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

// Le journal de redaction détaillé : chaque valeur que le moteur a protégée, reconstruite
// depuis le `redactionVault` persisté (faux→réel) et `redactionKinds` (réel→catégorie). Il
// montre ce qui est SORTI (le faux) à côté de ce qu'il remplaçait — le compte rendu
// honnête et relisible du redaction réversible. Local, il ne quitte jamais la machine.
//
// ⚠️ Il se lit PAR CONVERSATION parce que le coffre l'est : le pourquoi, avec les données
// (`auditRows.ts`). Ici, une seule conséquence de rendu — l'en-tête de groupe porte le
// titre, le compte et la date ; la ligne ne porte plus que la valeur.

// La liste peut tenir des milliers d'entrées : elle est rendue par PAGES, via une sentinelle
// de défilement (IntersectionObserver), jamais d'un bloc.
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
  const [q, setQ] = useState("");
  // Même contrôle que les vues d'usage : deux graphes du même produit réglés différemment font douter de ce qu'on lit.
  const [auditDays, setAuditDays] = useState<UsageRangeDays>(DEFAULT_RANGE);
  const [cat, setCat] = useState<string | null>(null);
  // La valeur réelle est masquée dans la table (regard par-dessus l'épaule) ; ceci est la
  // ligne que l'utilisateur a cliquée pour la révéler. `null` = rien de révélé.
  const [reveal, setReveal] = useState<{ row: AuditRow; convTitle: string; at: number } | null>(null);

  const groups = useMemo(() => buildAuditGroups(conversations), [conversations]);
  const total = useMemo(() => countAuditRows(groups), [groups]);
  const cats = useMemo(() => auditKindCounts(groups), [groups]);
  const filtered = useMemo(() => filterAuditGroups(groups, { query: q, kind: cat }), [groups, q, cat]);
  const filteredCount = countAuditRows(filtered);

  const meta = (k: string) => KIND_META.get(k);

  // Export CSV local et réel des lignes filtrées — un Blob, aucun serveur (l'audit est
  // sur l'appareil). BOM pour qu'Excel lise l'UTF-8 ; fins de ligne CRLF.
  const exportCsv = () => {
    if (filteredCount === 0) return;
    const head = ["Type", "Valeur réelle", "Remplacée par", "Conversation", "Quand"];
    const lines = [head.map(csvCell).join(",")];
    for (const g of filtered) {
      for (const r of g.rows) {
        lines.push(
          [meta(r.kind)?.label ?? r.kind, r.original, r.fake, g.convTitle, new Date(g.at).toLocaleString("fr-FR")]
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

  // Rendu progressif : `limit` VALEURS, une page de plus quand la sentinelle du bas entre
  // dans le champ. Retour à une page dès que le filtre change.
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
            {total.toLocaleString("fr-FR")} élément{total === 1 ? "" : "s"} redacted
            {total === 1 ? "" : "s"}
          </div>
          <div className="audit-hero-sub">
            Avant d'atteindre un modèle · restaurés uniquement dans votre copie, jamais transmis.
          </div>
        </div>
        <button
          type="button"
          className="audit-export"
          onClick={exportCsv}
          disabled={filteredCount === 0}
          title="Exporter la sélection en CSV"
        >
          <DownloadIcon size={15} /> Exporter
        </button>
      </div>

      {total === 0 ? (
        <div className="settings-card audit-empty">
          <ShieldIcon size={22} />
          <p>Aucun redaction enregistré pour l'instant.</p>
        </div>
      ) : (
        <>
          {/* Redactions/jour par catégorie — même graphe que l'onglet Usage, et sa commande de fenêtre au-dessus. */}
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
                placeholder="Rechercher une valeur ou une conversation…"
              />
            </label>
          </div>
          <div className="audit-chips">
            <button className={`audit-chip ${cat === null ? "on" : ""}`} onClick={() => setCat(null)}>
              Tout · {total}
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
                  {m?.label ?? key} · {n}
                </button>
              );
            })}
          </div>

          {shown.map((g) => (
            <div key={g.convId} className="settings-card audit-list">
              {/* L'en-tête PORTE la conversation : titre, compte et date. Répétés sur chaque
                  ligne, le titre encombrait et la date promettait l'heure d'UNE valeur — que
                  le coffre n'enregistre pas. */}
              <div className="audit-group">
                {onOpenMessage ? (
                  <button
                    type="button"
                    className="audit-group-title audit-conv-link"
                    title={`Ouvrir · ${g.convTitle}`}
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
                  {g.rows.length} valeur{g.rows.length === 1 ? "" : "s"}
                </span>
                <span className="audit-when">{relTime(g.at)}</span>
              </div>
              <div className="audit-grid audit-cols">
                {["TYPE", "VALEUR RÉELLE", "REMPLACÉE PAR"].map((h) => (
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
                      {m?.label ?? r.kind}
                    </span>
                    {/* Valeur réelle MASQUÉE par défaut (aucun `title` qui la fuite) ; le clic
                        la révèle dans une modale. Masque de longueur fixe, pour ne pas livrer
                        non plus la longueur. */}
                    <button
                      type="button"
                      className="audit-orig audit-reveal-btn"
                      onClick={() => setReveal({ row: r, convTitle: g.convTitle, at: g.at })}
                      aria-label="Révéler la valeur réelle"
                      title="Cliquer pour révéler"
                    >
                      <span className="audit-mask">•••••••</span>
                      <EyeIcon size={13} />
                    </button>
                    <span className="audit-fake" title={r.fake}>{r.fake}</span>
                    {/* Une FLÈCHE, pas une phrase : répétée à chaque ligne, « Aller au
                        message » criait plus fort que les valeurs qu'on vient lire. */}
                    {onOpenMessage && r.msgId ? (
                      <button
                        type="button"
                        className="audit-goto audit-conv-link"
                        title="Aller au message"
                        aria-label="Aller au message"
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
              <span>Chargement… ({shownCount} / {filteredCount})</span>
            </div>
          ) : (
            filteredCount > PAGE_SIZE && <div className="audit-note">{filteredCount} entrées.</div>
          )}
        </>
      )}

      <AnimatePresence>
        {reveal && (
          <AuditRevealModal
            typeLabel={meta(reveal.row.kind)?.label ?? reveal.row.kind}
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

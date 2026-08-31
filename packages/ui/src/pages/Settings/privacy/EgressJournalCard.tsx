import { useEffect, useMemo, useState } from "react";
import { useT } from "../../../i18n";
import { useHost } from "../../../host";
import type { EgressEntry } from "../../../host";
import { SearchIcon, ShieldIcon } from "../../../components/brand";
import { relTime } from "../shared";
import { filterEgress, groupEgress, summarise } from "./egressJournal";

// « Ce qui est sorti de la machine » — the network half of the Journal tab. The audit
// above it proves what was redacted; this proves WHERE anything went at all, which is the
// question a DPO asks and the one the app could not previously answer.
//
// Read-only by construction: `host.db.listEgress` is the only door and the platform is the
// sole writer, so nothing here can author or erase a row. Absent host slot ⇒ the card is
// not drawn (browser preview makes no outbound calls on the user's behalf).


const LIMIT = 500;

export function EgressJournalCard() {
  const host = useHost();
  const listEgress = host.db?.listEgress;
  const [entries, setEntries] = useState<EgressEntry[] | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!listEgress) return;
    let live = true;
    // Best-effort: a journal that can't be read is an empty journal, never an app error.
    void listEgress(LIMIT)
      .then((rows) => {
        if (live) setEntries(rows);
      })
      .catch(() => {
        if (live) setEntries([]);
      });
    return () => {
      live = false;
    };
  }, [listEgress]);

  const groups = useMemo(() => groupEgress(entries ?? []), [entries]);
  const t = useT();
  const shown = useMemo(() => filterEgress(groups, q), [groups, q]);
  const stats = useMemo(() => summarise(groups), [groups]);

  if (!listEgress) return null;

  return (
    <section className="settings-section">
      <div className="settings-card">
        <header className="egress-head">
          <h3 className="egress-title">
            <ShieldIcon size={16} /> {t.privacyTab.egressTitle}
          </h3>
          <p className="egress-sub">
            {t.privacyTab.egressSub}
          </p>
        </header>

        {entries === null ? (
          <p className="egress-empty">{t.privacyTab.egressLoading}</p>
        ) : groups.length === 0 ? (
          <p className="egress-empty">
            {t.privacyTab.egressEmpty}
          </p>
        ) : (
          <>
            <p className="egress-stats">
              <span>
                <span className="egress-stat">{stats.origins}</span>{" "}
                {t.privacyTab.egressOrigins(stats.origins)}
              </span>
              <span>·</span>
              <span>
                <span className="egress-stat">{stats.contacts}</span>{" "}
                {t.privacyTab.egressContacts(stats.contacts)}
              </span>
              {stats.refused > 0 ? (
                <>
                  <span>·</span>
                  <span>
                    <span className="egress-stat">{stats.refused}</span>{" "}
                    {t.privacyTab.egressRefusedWord(stats.refused)}
                  </span>
                </>
              ) : null}
            </p>

            <label className="audit-search egress-search">
              <SearchIcon size={15} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.privacyTab.egressSearch}
              />
            </label>

            <ul className="egress-list">
              {shown.map((g) => (
                <li key={g.origin} className="egress-row">
                  <div className="min-w-0">
                    <div className="egress-host">
                      <span>{g.host}</span>
                      {g.insecure ? <span className="egress-plain">{t.privacyTab.egressInsecure}</span> : null}
                    </div>
                    <div className="egress-sources">{g.sources.join(" · ")}</div>
                  </div>
                  <div className="egress-meta">
                    {/* Rule 12: the tint travels with its ink (`.hl-red` → `--mk` /
                        `--mk-ink`), so it inverts along with the four themes. */}
                    {g.refused > 0 ? (
                      <span
                        className="hl-red egress-refused"
                        title={g.lastRefusalReason ?? t.privacyTab.egressRefusedFallback}
                      >
                        {t.privacyTab.egressRefused(g.refused)}
                      </span>
                    ) : null}
                    <span className="egress-count">{g.total}×</span>
                    <span>{relTime(g.lastAt, t)}</span>
                  </div>
                </li>
              ))}
              {shown.length === 0 ? (
                <li className="egress-empty">{t.privacyTab.egressNoMatch}</li>
              ) : null}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

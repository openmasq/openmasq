import { useEffect, useMemo, useState } from "react";
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
  const shown = useMemo(() => filterEgress(groups, q), [groups, q]);
  const stats = useMemo(() => summarise(groups), [groups]);

  if (!listEgress) return null;

  return (
    <section className="settings-section">
      <div className="settings-card">
        <header className="egress-head">
          <h3 className="egress-title">
            <ShieldIcon size={16} /> Ce qui est sorti de la machine
          </h3>
          <p className="egress-sub">
            Les adresses que l'app a réellement contactées, et celles qu'elle a refusées.
            Le nom du site seulement — jamais la page, jamais ce qui a été demandé.
          </p>
        </header>

        {entries === null ? (
          <p className="egress-empty">Lecture du journal…</p>
        ) : groups.length === 0 ? (
          <p className="egress-empty">
            Rien pour l'instant : aucune adresse contactée depuis cet appareil.
          </p>
        ) : (
          <>
            <p className="egress-stats">
              <span>
                <span className="egress-stat">{stats.origins}</span>{" "}
                {stats.origins === 1 ? "adresse" : "adresses"}
              </span>
              <span>·</span>
              <span>
                <span className="egress-stat">{stats.contacts}</span>{" "}
                {stats.contacts === 1 ? "contact" : "contacts"}
              </span>
              {stats.refused > 0 ? (
                <>
                  <span>·</span>
                  <span>
                    <span className="egress-stat">{stats.refused}</span> refusé
                    {stats.refused === 1 ? "" : "s"}
                  </span>
                </>
              ) : null}
            </p>

            <label className="audit-search egress-search">
              <SearchIcon size={15} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher une adresse ou une origine…"
              />
            </label>

            <ul className="egress-list">
              {shown.map((g) => (
                <li key={g.origin} className="egress-row">
                  <div className="min-w-0">
                    <div className="egress-host">
                      <span>{g.host}</span>
                      {g.insecure ? <span className="egress-plain">non chiffré</span> : null}
                    </div>
                    <div className="egress-sources">{g.sources.join(" · ")}</div>
                  </div>
                  <div className="egress-meta">
                    {/* Règle 12 : la teinte voyage avec son encre (`.hl-red` → `--mk` /
                        `--mk-ink`), donc elle s'inverse avec les quatre thèmes. */}
                    {g.refused > 0 ? (
                      <span
                        className="hl-red egress-refused"
                        title={g.lastRefusalReason ?? "refusé"}
                      >
                        {g.refused} refusé{g.refused === 1 ? "" : "s"}
                      </span>
                    ) : null}
                    <span className="egress-count">{g.total}×</span>
                    <span>{relTime(g.lastAt)}</span>
                  </div>
                </li>
              ))}
              {shown.length === 0 ? (
                <li className="egress-empty">Aucune adresse ne correspond.</li>
              ) : null}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

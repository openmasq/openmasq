import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { hueForKind } from "@openmasq/redact";
import { EmptyState, PlusIcon, SearchIcon, ShieldIcon } from "../../components/brand";
import { REDACT_TYPES } from "@openmasq/redact";
import type { CoffreTerm, Conversation } from "../../types";
import { coffreOccurrences, coffreTypeLabel, type CoffreOccurrences } from "../../send/coffre";
import { PageHeader } from "../../containers/shell/PageHeader";
import { VaultUsesModal } from "./VaultUsesModal";
import { VaultAddModal } from "./parts/VaultAddModal";
import { VaultFilters } from "./parts/VaultFilters";
import { VaultRow } from "./parts/VaultRow";

/**
 * The COFFRE page ("Coffre") — the user's dictionary of values ALWAYS redacted,
 * before every send, in every conversation, whatever the model. Reskin of the
 * design's VaultPage: a toolbar (type-filter chips + search + « Ajouter un
 * terme »), and the term list — values masked behind their reveal pill — with a
 * real occurrence count (computed from the persisted vaults) that opens the
 * uses modal. Adding goes through the dedicated `VaultAddModal`. Pure logic
 * lives in `send/coffre.ts`; this composes the parts.
 */
export function VaultView({
  coffre,
  conversations,
  onAdd,
  onRemove,
  org,
  onShareTerm,
  onOpenConversation,
  onToggleSidebar,
  loaded = true,
}: {
  coffre: CoffreTerm[];
  conversations: Conversation[];
  onAdd: (value: string, token: string, note?: string) => void;
  onRemove: (id: string) => void;
  /** The ORGANIZATION's shared terms — absent outside an org. ONE list, badged
   *  by scope (design): mirror terms fold into the main list; a personal term
   *  also present in a share of yours wears the share's scope. `orgScope` is
   *  the device-local tag the sync aggregation writes. */
  org?: {
    terms: (CoffreTerm & { orgScope?: "team" | "org" })[];
  };
  /** Opens the « Partager » dialog for a personal term (the section owns it). */
  onShareTerm?: (term: CoffreTerm) => void;
  /** Open a conversation (optionally anchored to a message) from the uses modal. */
  onOpenConversation: (convId: string, msgId?: string) => void;
  /** Expand/collapse the primary sidebar (shell-owned). */
  onToggleSidebar?: () => void;
  /** False only during the initial per-account load (localStorage adopted, the
   *  encrypted DB copy not merged in yet) — an empty `coffre` THEN is "don't know
   *  yet", not "genuinely empty". Without this an account switch or a slow disk
   *  flashed the first-run "ajoutez un terme" CTA over real, not-yet-loaded data —
   *  reads as "my Coffre got wiped". Default true: every other caller (tests) keeps
   *  today's behaviour. */
  loaded?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all"); // "all" | a token
  const [open, setOpen] = useState<CoffreTerm | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // ONE list, badged (design): personal terms first — wearing the scope of a
  // share of yours when one carries the same id — then the terms shared WITH
  // you (read-only). Dedup by id: your shared term stays YOUR editable row.
  const mirrorById = useMemo(
    () => new Map((org?.terms ?? []).map((t) => [t.id, t])),
    [org?.terms],
  );
  const display = useMemo(() => {
    const personal = coffre.map((t) => ({
      term: t,
      scope: org ? (mirrorById.get(t.id)?.orgScope ?? "personal") : undefined,
      mine: true,
    }));
    const shared = (org?.terms ?? [])
      .filter((t) => !coffre.some((p) => p.id === t.id))
      .map((t) => ({ term: t as CoffreTerm, scope: t.orgScope ?? "org", mine: false }));
    return [...personal, ...shared];
  }, [coffre, org, mirrorById]);

  // Occurrences ONCE per term (keyed by id), so every row reads the same numbers.
  const occ = useMemo(() => {
    const m = new Map<string, CoffreOccurrences>();
    for (const { term } of display) m.set(term.id, coffreOccurrences(term, conversations));
    return m;
  }, [display, conversations]);

  // Per-type counts for the filter chips (only tokens actually present are shown).
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: display.length };
    for (const { term } of display) c[term.token] = (c[term.token] ?? 0) + 1;
    return c;
  }, [display]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return display.filter(
      ({ term: t }) =>
        (filter === "all" || t.token === filter) &&
        (!needle ||
          t.value.toLowerCase().includes(needle) ||
          coffreTypeLabel(t.token).toLowerCase().includes(needle)),
    );
  }, [display, filter, query]);

  // Filter chips: "Tous" + one per token present, in the REDACT_TYPES order,
  // each wearing its type's highlight hue.
  const chips = useMemo(
    () => [
      { id: "all", label: "Tous" },
      ...REDACT_TYPES.filter((t) => counts[t.token]).map((t) => ({
        id: t.token,
        label: t.label,
        tone: hueForKind(t.token),
      })),
    ],
    [counts],
  );

  const add = (value: string, token: string, note?: string) => {
    onAdd(value, token, note);
    setAddOpen(false);
  };

  return (
    <main className="library-page">
      <PageHeader
        section="vault"
        onToggleSidebar={onToggleSidebar}
      />

      {/* Same skeleton as the Bibliothèque: a fixed header over a scrollable body
          holding one centred reading column. */}
      <div className="library-body">
        <div className="om-vault-inner">
          {/* The toolbar is only useful once there are terms to filter/search. On a
              first-run EMPTY coffre it's hidden entirely — the empty state below owns the
              add CTA; on a no-match it stays for the search/chips but drops its own add
              button (`showAdd`), which the empty state's CTA already covers. */}
          {display.length > 0 && (
            <VaultFilters
              chips={chips}
              counts={counts}
              filter={filter}
              onFilter={setFilter}
              query={query}
              onQuery={setQuery}
              onAdd={() => setAddOpen(true)}
              showAdd={filtered.length > 0}
            />
          )}

          {filtered.length === 0 ? (
            display.length === 0 && !loaded ? (
              <div className="library-empty">Chargement…</div>
            ) : display.length === 0 ? (
              <EmptyState
                tone="pink"
                eyebrow="Coffre"
                icon={<ShieldIcon size={26} />}
                title="Vos termes, toujours redacted."
                body="Les mots à masquer partout : noms de code, comptes, identifiants. Ajoutés une fois, remplacés à chaque envoi."
                points={[
                  { glyph: "◈", label: "Appliqué à tous les modèles", tone: "sky" },
                  { glyph: "⌘", label: "Utilisations comptées", tone: "violet" },
                  { glyph: "◑", label: "Rangé par catégorie", tone: "mint" },
                ]}
                cta="Ajouter un premier terme"
                ctaIcon={<PlusIcon size={16} />}
                onCta={() => setAddOpen(true)}
              />
            ) : (
              <EmptyState
                tone="violet"
                eyebrow={
                  filter === "all" ? "Recherche" : `Catégorie · ${coffreTypeLabel(filter)}`
                }
                icon={<SearchIcon size={26} />}
                title="Aucun terme ici."
                body="Rien ne correspond à cette catégorie ou à votre recherche. Choisissez « Tous » ou ajoutez un nouveau terme au coffre."
                cta="Ajouter un terme"
                ctaIcon={<PlusIcon size={16} />}
                onCta={() => setAddOpen(true)}
              />
            )
          ) : (
            <div className="om-vault-list">
              {filtered.map(({ term: t, scope, mine }) => (
                <VaultRow
                  key={t.id}
                  term={t}
                  occ={occ.get(t.id) ?? { uses: [], totalCount: 0, convCount: 0 }}
                  scope={scope}
                  onOpenUses={() => setOpen(t)}
                  onRemove={mine ? () => onRemove(t.id) : undefined}
                  onShare={mine && scope === "personal" && onShareTerm ? () => onShareTerm(t) : undefined}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <VaultUsesModal
            term={open}
            conversations={conversations}
            onOpen={(convId, msgId) => {
              setOpen(null);
              onOpenConversation(convId, msgId);
            }}
            onClose={() => setOpen(null)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {addOpen && <VaultAddModal onClose={() => setAddOpen(false)} onAdd={add} />}
      </AnimatePresence>
    </main>
  );
}

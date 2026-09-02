import { useMemo, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { hueForKind } from "@openmasq/redact";
import { EmptyState, PlusIcon, SearchIcon, ShieldIcon } from "../../components/brand";
import { REDACT_TYPES } from "@openmasq/redact";
import type { VaultTerm, Conversation } from "../../types";
import { vaultTermOccurrences, type VaultTermOccurrences } from "../../send/vaultTerms";
import { PageHeader } from "../../containers/shell/PageHeader";
import { VaultUsesModal } from "./VaultUsesModal";
import { VaultAddModal } from "./parts/VaultAddModal";
import { VaultFilters } from "./parts/VaultFilters";
import { VaultRow } from "./parts/VaultRow";
import { vaultTokenLabel } from "./vaultTypes";

import { useT } from "../../i18n";
/**
 * The COFFRE page ("Coffre") — the user's dictionary of values ALWAYS redacted,
 * before every send, in every conversation, whatever the model. Reskin of the
 * design's VaultPage: « Ajouter un terme » in the page header (where the four pages
 * keep their « Créer »), a toolbar (category chips + search), and the term list —
 * values masked behind their reveal pill — with a real occurrence count (computed
 * from the persisted vaults) that opens the uses modal. Adding AND editing go
 * through the same `VaultAddModal`. Pure logic lives in `send/vaultTerms.ts` and
 * `vaultTypes.ts`; this composes the parts.
 */
export function VaultView({
  coffre: vaultTerms,
  conversations,
  onAdd,
  onUpdate,
  onRemove,
  org,
  onShareTerm,
  onOpenConversation,
  onToggleSidebar,
  loaded = true,
}: {
  coffre: VaultTerm[];
  conversations: Conversation[];
  onAdd: (value: string, token: string, note?: string) => void;
  /** Rename a term / change its category — absent ⇒ rows offer no edit. */
  onUpdate?: (id: string, patch: Partial<Omit<VaultTerm, "id">>) => void;
  onRemove: (id: string) => void;
  /** The ORGANIZATION's shared terms — absent outside an org. ONE list, badged
   *  by scope (design): mirror terms fold into the main list; a personal term
   *  also present in a share of yours wears the share's scope. `orgScope` is
   *  the device-local tag the sync aggregation writes. */
  org?: {
    terms: (VaultTerm & { orgScope?: "team" | "org" })[];
  };
  /** Opens the « Partager » dialog for a personal term (the section owns it). */
  onShareTerm?: (term: VaultTerm) => void;
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
  const t = useT();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("all"); // "all" | a token
  const [open, setOpen] = useState<VaultTerm | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<VaultTerm | null>(null);

  // ONE list, badged (design): personal terms first — wearing the scope of a
  // share of yours when one carries the same id — then the terms shared WITH
  // you (read-only). Dedup by id: your shared term stays YOUR editable row.
  const mirrorById = useMemo(
    () => new Map((org?.terms ?? []).map((t) => [t.id, t])),
    [org?.terms],
  );
  const display = useMemo(() => {
    const personal = vaultTerms.map((t) => ({
      term: t,
      scope: org ? (mirrorById.get(t.id)?.orgScope ?? "personal") : undefined,
      mine: true,
    }));
    const shared = (org?.terms ?? [])
      .filter((t) => !vaultTerms.some((p) => p.id === t.id))
      .map((t) => ({ term: t as VaultTerm, scope: t.orgScope ?? "org", mine: false }));
    return [...personal, ...shared];
  }, [vaultTerms, org, mirrorById]);

  // Occurrences ONCE per term (keyed by id), so every row reads the same numbers.
  const occ = useMemo(() => {
    const m = new Map<string, VaultTermOccurrences>();
    for (const { term } of display) m.set(term.id, vaultTermOccurrences(term, conversations));
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
      ({ term }) =>
        (filter === "all" || term.token === filter) &&
        (!needle ||
          term.value.toLowerCase().includes(needle) ||
          vaultTokenLabel(term.token, t).toLowerCase().includes(needle)),
    );
  }, [display, filter, query, t]);

  // Filter chips: "Tous" + one per token present, in the REDACT_TYPES order,
  // each wearing its type's highlight hue.
  const chips = useMemo(
    () => [
      { id: "all", label: t.lists.allMasculine },
      ...REDACT_TYPES.filter((x) => counts[x.token]).map((x) => ({
        id: x.token,
        label: vaultTokenLabel(x.token, t),
        tone: hueForKind(x.token),
      })),
    ],
    [counts, t],
  );

  const add = (value: string, token: string, note?: string) => {
    onAdd(value, token, note);
    setAddOpen(false);
  };
  const saveEdit = (value: string, token: string, note?: string) => {
    if (editing) onUpdate?.(editing.id, { value, token, note });
    setEditing(null);
  };

  return (
    <main className="library-page">
      <PageHeader
        section="vault"
        onToggleSidebar={onToggleSidebar}
        action={
          <button type="button" className="btn-primary om-skill-new" onClick={() => setAddOpen(true)}>
            <PlusIcon size={16} />
            {t.lists.vault.addTerm}
          </button>
        }
      />

      {/* Same skeleton as the Bibliothèque: a fixed header over a scrollable body
          holding one centred reading column. */}
      <div className="library-body">
        <div className="om-vault-inner">
          {/* The toolbar is only useful once there are terms to filter/search. On a
              first-run EMPTY coffre it's hidden entirely — the empty state below owns
              its own add CTA, the header keeps the page's. */}
          {display.length > 0 && (
            <VaultFilters
              chips={chips}
              counts={counts}
              filter={filter}
              onFilter={setFilter}
              query={query}
              onQuery={setQuery}
            />
          )}

          {filtered.length === 0 ? (
            display.length === 0 && !loaded ? (
              <div className="library-empty">{t.lists.loading}</div>
            ) : display.length === 0 ? (
              <EmptyState
                tone="pink"
                eyebrow={t.sections.vault.label}
                icon={<ShieldIcon size={26} />}
                title={t.lists.vault.empty.title}
                body={t.lists.vault.empty.body}
                points={[
                  { glyph: "◈", label: t.lists.vault.empty.points[0], tone: "sky" },
                  { glyph: "⌘", label: t.lists.vault.empty.points[1], tone: "violet" },
                  { glyph: "◑", label: t.lists.vault.empty.points[2], tone: "mint" },
                ]}
                cta={t.lists.vault.empty.cta}
                ctaIcon={<PlusIcon size={16} />}
                onCta={() => setAddOpen(true)}
              />
            ) : (
              <EmptyState
                tone="violet"
                eyebrow={
                  filter === "all"
                    ? t.lists.vault.noMatch.search
                    : `${t.lists.vault.noMatch.category} · ${vaultTokenLabel(filter, t)}`
                }
                icon={<SearchIcon size={26} />}
                title={t.lists.vault.noMatch.title}
                body={t.lists.vault.noMatch.body}
                cta={t.lists.vault.noMatch.cta}
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
                  onEdit={mine && onUpdate ? () => setEditing(t) : undefined}
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
        {addOpen && <VaultAddModal onClose={() => setAddOpen(false)} onSubmit={add} />}
        {editing && (
          <VaultAddModal
            key={editing.id}
            initial={editing}
            onClose={() => setEditing(null)}
            onSubmit={saveEdit}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

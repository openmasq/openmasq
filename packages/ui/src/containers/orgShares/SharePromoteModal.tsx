import { useEffect, useMemo, useState } from "react";
import { pseudonymize, type Vault } from "@openmasq/redact";
import { ModalShell } from "../modals/ModalShell";
import { CheckIcon, SearchIcon, ShieldIcon } from "../../components/brand";
import { useHost } from "../../host";
import type { OrgShareAudienceInput, OrgShareAudienceOptions } from "../../host/orgShares";
import { SHARE_TARGETS } from "../../orgShares/scopes";
import { coffreTypeLabel } from "../../send/coffre";
import type { CoffreTerm, Competence } from "../../types";

/** What is being shared: ONE item at a time (design: promotion per row/card). */
export type PromoteSubject =
  | { kind: "term"; term: CoffreTerm }
  | { kind: "skill"; competence: Competence };

/**
 * The « Partager » dialog (design source: ui_kits/chat-app `PromoteModal`):
 * the recipient IS the decision, so the three targets come first, each
 * stating its own approval path; then WHO for a person share (real names —
 * « une personne » is only a real choice if you can see who); then the
 * preview. A TERM previews in clear (redacting the exact string the engine
 * masks would show « EMAIL » for every e-mail — useless as a check) with what
 * sharing it MEANS; prose (a compétence) previews REDACTED — it may carry
 * incidental PII the author never meant to publish.
 */
export function SharePromoteModal({
  subject,
  onClose,
  onShare,
}: {
  subject: PromoteSubject;
  onClose: () => void;
  /** Runs the proposal; true closes the dialog. */
  onShare: (audience: OrgShareAudienceInput) => Promise<boolean>;
}) {
  const host = useHost();
  const [options, setOptions] = useState<OrgShareAudienceOptions>({ teams: [], members: [] });
  const [target, setTarget] = useState<"person" | "team" | "org">("team");
  const [who, setWho] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ text: string; total: number } | null>(null);

  useEffect(() => {
    void host.orgShares?.audience().then((o) => {
      setOptions(o);
      if (!o.myTeamUuid) setTarget("person");
    });
  }, [host.orgShares]);

  const isTerm = subject.kind === "term";
  const prose = isTerm ? "" : `${subject.competence.name}\n${subject.competence.prompt}`;
  useEffect(() => {
    if (isTerm) return;
    let live = true;
    const vault: Vault = {};
    void pseudonymize(prose, { vault }).then((res) => {
      if (live) setPreview({ text: res.text, total: Object.keys(vault).length });
    });
    return () => {
      live = false;
    };
  }, [prose, isTerm]);

  const targets = useMemo(
    () => SHARE_TARGETS.filter((t) => t.id !== "team" || !!options.myTeamUuid),
    [options.myTeamUuid],
  );
  const people = options.members.filter((m) => !m.me);
  const hits = people.filter(
    (p) => !q.trim() || (p.name ?? "").toLowerCase().includes(q.trim().toLowerCase()),
  );
  const picked = people.find((p) => p.uuid === who);
  const valid = target !== "person" || !!who;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ok = await onShare(
      target === "org"
        ? { kind: "org" }
        : target === "team"
          ? { kind: "team", teamUuid: options.myTeamUuid! }
          : { kind: "user", targetUuid: who! },
    );
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <ModalShell onClose={onClose} width="520px" maxHeight="90vh">
      <div className="om-promote-head">
        <div className="cv-eyebrow">Partager</div>
        <div className="cv-display om-promote-title">Avec qui ?</div>
        <p className="om-promote-sub">Vous gardez votre copie et pouvez continuer à la modifier.</p>
      </div>

      <div className="om-promote-body">
        <div className="om-promote-targets">
          {targets.map((t) => {
            const on = t.id === target;
            return (
              <button
                key={t.id}
                type="button"
                className={`om-promote-target${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => setTarget(t.id)}
              >
                <span className="om-promote-radio" />
                <span className="om-promote-target-main">
                  <span className="om-promote-target-name">
                    <b>{t.label}</b>
                    <span className="om-promote-target-dot" style={{ background: `var(--hl-${t.tone})` }} />
                  </span>
                  <span className="om-promote-target-desc">{t.desc}</span>
                  {on && <span className="om-promote-target-approval">{t.approval}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {target === "person" && (
          <div className="om-promote-people">
            <div className="om-promote-search">
              <SearchIcon size={15} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                autoFocus
                placeholder="Rechercher un collègue"
                aria-label="Rechercher un collègue"
              />
            </div>
            <div className="om-promote-list">
              {hits.map((p) => {
                const on = who === p.uuid;
                return (
                  <button
                    key={p.uuid}
                    type="button"
                    className={`om-promote-person${on ? " on" : ""}`}
                    aria-pressed={on}
                    onClick={() => setWho(p.uuid)}
                  >
                    <span className="om-promote-person-name">{p.name ?? "Membre"}</span>
                    {p.role && <span className="om-promote-person-role">{p.role}</span>}
                    {on && <CheckIcon size={15} />}
                  </button>
                );
              })}
              {!hits.length && (
                <div className="om-promote-none">Personne de ce nom dans l'organisation.</div>
              )}
            </div>
            {/* The pick must stay visible once the search narrows past it, or
                the confirm button enables with no visible reason. */}
            {picked && !hits.some((p) => p.uuid === who) && (
              <div className="om-promote-picked">
                Sélectionné : <b>{picked.name ?? "Membre"}</b>
              </div>
            )}
          </div>
        )}

        <div className="cv-eyebrow om-promote-preview-label">
          {isTerm ? "Le terme partagé" : "Ce qui sera partagé"}
        </div>
        <div className="om-promote-preview">
          {isTerm ? (
            <>
              <div className="om-promote-term">{subject.term.value}</div>
              <div className="om-promote-term-sub">
                {coffreTypeLabel(subject.term.token)}
                {subject.term.note ? ` · ${subject.term.note}` : ""}
              </div>
            </>
          ) : (
            <div className="om-promote-prose">{preview?.text ?? "…"}</div>
          )}
        </div>
        {isTerm ? (
          <div className="om-promote-note">
            <ShieldIcon size={14} />
            <span>
              Le terme et son substitut deviennent communs avec les destinataires : ce nom sera
              masqué de la même façon dans vos conversations.
            </span>
          </div>
        ) : preview && preview.total > 0 ? (
          <div className="om-promote-note">
            <ShieldIcon size={14} />
            <span>
              <b>
                {preview.total} élément{preview.total > 1 ? "s" : ""} redacted
                {preview.total > 1 ? "s" : ""}
              </b>{" "}
              avant le partage — le texte ci-dessus est exactement ce que verront les autres.
            </span>
          </div>
        ) : (
          <div className="om-promote-clean">Aucune donnée sensible détectée dans ce contenu.</div>
        )}
      </div>

      <div className="om-promote-foot">
        <button type="button" className="btn-ghost" onClick={onClose}>
          Annuler
        </button>
        <button type="button" className="btn-primary" onClick={submit} disabled={!valid || busy}>
          Envoyer la demande
        </button>
      </div>
    </ModalShell>
  );
}

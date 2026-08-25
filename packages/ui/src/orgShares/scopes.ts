/**
 * The SHARING vocabulary — one home (rule 9) for the three item scopes and the
 * three share targets, read by the badge, the page sections and the promote
 * dialog (design source: ui_kits/chat-app `SCOPES` / `SHARE_TARGETS`).
 *
 * Item scopes ACCUMULATE (a personal compétence beside a team one is not a
 * conflict — it sits there, badged); a PERSON share, once accepted, lands as a
 * PERSONAL copy on the recipient (« vous gardez votre copie » goes both ways).
 */

export type ItemScope = "personal" | "team" | "org";

export const SCOPES: readonly {
  id: ItemScope;
  label: string;
  short: string;
  tone: string;
  note: string;
}[] = [
  {
    id: "org",
    label: "Organisation",
    short: "Orga",
    tone: "violet",
    note: "Partagé à toute l'organisation — visible et utilisable par tous les membres.",
  },
  {
    id: "team",
    label: "Équipe",
    short: "Équipe",
    tone: "sky",
    note: "Partagé avec votre équipe — visible et utilisable par ses membres.",
  },
  { id: "personal", label: "Personnel", short: "Perso", tone: "mint", note: "Visible de vous seul." },
];

export const scopeOf = (id?: string): (typeof SCOPES)[number] =>
  SCOPES.find((x) => x.id === id) ?? SCOPES[2];

/** The three recipients a share can target. Each row states ITS approval path
 *  — the three differ only in who says yes, and hiding that until after the
 *  click is what made « Partager » feel unpredictable (design note). */
export const SHARE_TARGETS: readonly {
  id: "person" | "team" | "org";
  label: string;
  tone: string;
  desc: string;
  approval: string;
}[] = [
  {
    id: "person",
    label: "Une personne",
    tone: "mint",
    desc: "Un collègue de votre organisation.",
    approval: "Elle reçoit une demande et accepte — rien d'autre à valider.",
  },
  {
    id: "team",
    label: "Votre équipe",
    tone: "sky",
    desc: "Les membres de votre équipe.",
    approval: "Un administrateur est notifié et valide la demande.",
  },
  {
    id: "org",
    label: "Toute l'organisation",
    tone: "violet",
    desc: "Tous les comptes de l'organisation.",
    approval: "Un administrateur est notifié et approuve la demande.",
  },
];

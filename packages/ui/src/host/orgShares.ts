import type { CoffreTerm, Competence } from "../types";

/**
 * Optional ORG-SHARE capability: propose / approve / read shares of coffre
 * terms and compétences inside an organization — to the whole org, ONE team or
 * ONE person, behind an APPROVAL (org/team → an owner/admin decides; person →
 * the target consents). The platform implements it over the E2E org channel
 * (`@openmasq/sync` orgScope — per-share DEK enveloped per audience member);
 * this surface is UI-shaped and carries METADATA + the caller's capabilities
 * as the SERVER computed them (`canDecide`/`canWrite`/…) — the UI greys on
 * those flags and never re-derives the matrix (the renderer is untrusted; the
 * backend re-checks every call).
 */

export type OrgShareAudienceKind = "org" | "team" | "user";

export interface OrgShareAudienceInput {
  kind: OrgShareAudienceKind;
  teamUuid?: string;
  targetUuid?: string;
}

export interface OrgShareView {
  shareUuid: string;
  scope: "coffre" | "userdata";
  audience: { kind: OrgShareAudienceKind; teamUuid?: string; teamName?: string | null; targetUuid?: string };
  label: string;
  itemCount: number;
  status: "pending" | "approved" | "refused" | "revoked";
  authorUuid: string;
  authorName?: string | null;
  mine: boolean;
  inAudience: boolean;
  canDecide: boolean;
  canWrite: boolean;
  canRead: boolean;
}

/** One approval-inbox row (metadata only — content stays E2E). */
export interface OrgShareNotificationView {
  id: number;
  kind: string;
  payload: { label?: string; scope?: string; audience?: string; approved?: boolean; itemCount?: number };
  shareUuid: string;
  readAt: string | null;
}

/** What the share dialog's audience picker offers — the SAME roster the
 *  envelopes are wrapped to, so the picker and the crypto cannot disagree.
 *  `myTeamUuid` drives « Votre équipe » (absent = no team target offered). */
export interface OrgShareAudienceOptions {
  teams: { uuid: string; name: string }[];
  members: { uuid: string; name: string | null; teamUuid: string | null; role?: string; me?: boolean }[];
  myTeamUuid?: string | null;
}

export interface OrgSharesHost {
  /** The shares this account may see (server-filtered). */
  list(): Promise<OrgShareView[]>;
  /** Teams + members offered by the audience picker. */
  audience(): Promise<OrgShareAudienceOptions>;
  /** Propose a share of coffre TERMS (seeds keys + encrypted content). */
  proposeCoffre(input: {
    audience: OrgShareAudienceInput;
    label: string;
    terms: CoffreTerm[];
  }): Promise<OrgShareView | null>;
  /** Propose a share of COMPÉTENCES. */
  proposeCompetences(input: {
    audience: OrgShareAudienceInput;
    label: string;
    competences: Competence[];
  }): Promise<OrgShareView | null>;
  /** Approve / refuse a pending share (the server checks WHO may). */
  decide(shareUuid: string, approve: boolean): Promise<OrgShareView | null>;
  /** Revoke a share (author or governance). True on success. */
  revoke(shareUuid: string): Promise<boolean>;
  /** My approval inbox / mark one row read. */
  notifications(): Promise<OrgShareNotificationView[]>;
  markRead(id: number): Promise<void>;
  /** Decrypt ONE share's items (post-approval adopt of a person-share: the
   *  recipient copies them into their PERSONAL list — « vous gardez votre
   *  copie » goes both ways). Empty when unreadable. */
  pullShareItems(shareUuid: string): Promise<{ terms: CoffreTerm[]; competences: Competence[] }>;
  /** Pull the shared mirrors again NOW (after a decision landed). */
  refresh(): Promise<void>;
}

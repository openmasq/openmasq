/**
 * The deterministic detectors that answer ONE question: *is this a person?*
 *
 * Four different pieces of evidence, no model involved — an honorific before a name
 * (« madame Keller »), the civil-status prose of a birth date, the mention of an identity
 * DOCUMENT (CNI, passeport, titre de séjour), and the « Prénom / rôle » alternation of a
 * team roster. They are peers, so this barrel is the folder's face and no file here is
 * "the" module.
 *
 * ⚠️ Not to be confused with `../../model/identity/`, which is a different subject
 * entirely: keeping ONE person's fakes coherent once a detector has found them (first
 * name and surname allocated together, one real value → one fake conversation-wide).
 * Detection lives here; allocation lives there.
 */
export { isParticle, detectHonorificNames } from "./honorifics";
export { detectBirthDates } from "./birthDates";
export { detectIdentityDocFields } from "./identityDocs";
export { detectTeamRoster } from "./teamLists";

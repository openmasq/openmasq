import type { Detection } from "../../types";
// La famille « zones libérées d'une catégorie désactivée » vit dans son propre fichier ;
// ré-exportée d'ici pour que les appelants gardent UN point d'entrée de phase.
export { disabledValueSpans } from "./disabledZones";
import { RELEASABLE_FRAGMENT } from "./disabledZones";
import { redactionCategory, URL_EXEMPT_KINDS } from "../../kinds";
import { isKept, escapeRegExp } from "../../util";
import { occursOutsideUrl } from "../../engine/urls";
import { isNonPiiTerm, isGenericTerm, isStopword } from "../genericTerms";
import { isNotoriousEntity, type NotorietyOpts } from "../notorious";
import {
  trimSpanEdges,
  stripCivilStatusPrefix,
  stripTrailingEmailParen,
  stripBankOpPrefix,
} from "./spanEdges";
import {
  isMachineTokenGeo,
  isNotoriousFragment,
  isProseGeoHomograph,
  isSelfBoundEntity,
} from "./textContext";
import { isGluedProse } from "./gluedProse";
import { isBareNumber, numberCarriesMeaning } from "../pseudonymizeNumbers";

type UrlSpans = Parameters<typeof occursOutsideUrl>[2];

/** The fail-closed gates the {@link filterCandidates} pass enforces — isolated here so
 *  each drop is reviewable + testable in one place (the product's core leak surface). */
export interface FilterCtx {
  /** Allow-list — never redact (case-insensitive; wins over `forced`). */
  keep: Set<string>;
  /** UI categories the org MANDATES (a member cannot reveal them). `keep` does NOT win over
   *  these (audit): a composer "garder en clair" chip / reveal must not let an org-forced
   *  category egress in clear. Empty ⇒ unchanged (keep wins over everything, the default). */
  unrevealable?: Set<string>;
  /** True for an authored user message: a detected value equal to a fake is the user's
   *  REAL value, so DON'T drop it (it must get its own fake — dropping = leak). */
  reFakeExisting?: boolean;
  /** "Never re-fake a fake" predicate (tool-result compounding guard). */
  isExistingFake: (v: string) => boolean;
  /** Categories the user turned off → left in clear. */
  disabled: Set<string>;
  /** URL spans when the `url` category is OFF (drop a value confined to a URL), else null. */
  urlSpans: UrlSpans | null;
  /** Email spans (drop a non-email fragment confined to an email address), else null. */
  emailSpans: UrlSpans | null;
  /** Spans of the values a DISABLED category claimed — see {@link disabledValueSpans}. A
   *  candidate confined to one of them is dropped too, or turning a category off would
   *  shred its values instead of releasing them. Null/empty ⇒ gate off. */
  disabledSpans?: UrlSpans | null;
  /** Périmètre de la dispense de notoriété (`../notorious.ts`) : `{commercial: true}` =
   *  les marques commerciales aussi (niveaux Standard/Renforcé). Absent ⇒ dispense de
   *  base seulement (personnalités, organismes publics, tickers, pays). */
  notoriety?: NotorietyOpts;
  /** The released VALUES themselves — the cheap pre-filter for the gate below: only a
   *  candidate that is a SUBSTRING of one of them can possibly sit inside its span, and
   *  a few short `includes` beat one document scan per candidate. */
  releasedValues?: readonly string[];
  input: string;
}

/**
 * Le candidat n'est-il qu'une valeur FORCÉE habillée de mots génériques ?
 * (« Employeur de Camille Verlant » quand « Camille Verlant » est forcé par une fiche
 * Mémoire.) La valeur forcée doit y siéger à des FRONTIÈRES DE MOTS — « Camille Verlant »
 * dans « Camille Verlandet » ne compte pas — et chaque mot restant doit être un stopword
 * ou un terme générique. Tout doute ⇒ false : le candidat vit sa vie (fail closed — un
 * drop à tort enverrait le reste du span en clair).
 */
function dressesForcedValue(value: string, forcedValues: readonly string[]): boolean {
  for (const f of forcedValues) {
    if (!f || value === f || !value.includes(f)) continue;
    const at = new RegExp(`(?<!\\p{L})${escapeRegExp(f)}(?!\\p{L})`, "u");
    if (!at.test(value)) continue;
    const reste = value.replace(at, " ");
    const mots = reste.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    if (mots.length && mots.every((w) => isStopword(w) || isGenericTerm(w))) return true;
  }
  return false;
}

/**
 * Phase 2 — the FP-prevention / fail-closed candidate filter. Drops: allow-listed values,
 * an echoed fake (unless this is authored content), generic institutional/legal/type words,
 * notorious public entities (famous figures/brands/tickers, countries — category-scoped),
 * disabled categories, a value confined to a URL (except credentials — audit H-3), a
 * non-email fragment confined to an email (leaks the local-part otherwise), and a bare
 * meaningless number. A `forced` candidate bypasses every gate below the echo/keep checks.
 */
export function filterCandidates(candidates: Detection[], ctx: FilterCtx): Detection[] {
  const {
    keep,
    unrevealable,
    reFakeExisting,
    isExistingFake,
    disabled,
    urlSpans,
    emailSpans,
    disabledSpans,
    releasedValues,
    notoriety,
    input,
  } = ctx;
  // Rogner AVANT de filtrer : chacune des portes ci-dessous compare des CHAÎNES
  // (notoriété, keep, termes génériques), et une virgule collée les fait toutes manquer.
  // Et sur un NOM, dépouiller le marqueur d'état civil collé par le détecteur
  // (« née X », « épouse Y ») — `stripCivilStatusPrefix` dit ce que le garder coûtait.
  const forcedValues = candidates.filter((c) => c.forced && c.value).map((c) => c.value);
  return candidates
    .map((c) => {
      let v = trimSpanEdges(c.value);
      // Un code d'opération bancaire en tête (« VIR Rebour ») appartient au RELEVÉ, pas à
      // l'entité : le garder donnait deux faux au même fournisseur (`spanEdges.ts`).
      const cat0 = redactionCategory(c.category);
      if (cat0 === "name" || cat0 === "company") v = stripBankOpPrefix(v);
      if (redactionCategory(c.category) === "name") {
        v = stripCivilStatusPrefix(v);
        // ⚠️ « Nom (adresse@exemple.fr) » : la parenthèse sort du span, sinon l'adresse
        // RÉELLE voyage en clair à l'intérieur du faux (`spanEdges.ts` le raconte).
        v = stripTrailingEmailParen(v);
      }
      return v === c.value ? c : { ...c, value: v };
    })
    .filter((c) => {
    // `keep` wins over everything — EXCEPT an org-MANDATED category, which a member can't
    // reveal, so a kept value whose category is org-forced is still redacted (audit).
    if (isKept(c.value, keep) && !(unrevealable?.size && unrevealable.has(redactionCategory(c.category))))
      return false; // allow-listed → never redact (keep wins over forced, but not over org-forced)
    // "Never re-fake a fake" — but ONLY for tool-result echoes (compounding guard). For an
    // authored user message (`reFakeExisting`), a detected value that equals a fake is the
    // user's REAL value, not our echo: keep it as a candidate so it gets its OWN distinct fake
    // (else it's dropped → sent in CLEAR = leak → its reverse corrupts the other value).
    if (!reFakeExisting && isExistingFake(c.value)) return false;
    if (c.forced) return true; // user-forced → skip the FP-prevention gates below
    // Un span qui ne fait qu'HABILLER une valeur FORCÉE de mots génériques cède le pas.
    // Le cas vécu (fiche Mémoire, 14/08) : « Employeur de Camille Verlant » réclamé en
    // ORGANISATION par le gate contextuel — le span plus long l'emportait sur la valeur
    // forcée par la fiche personne, qui recevait alors un SECOND faux, de type org : le
    // modèle lisait deux entités là où il y en a une. Borné exprès : on ne cède que si
    // le RESTE (valeur forcée retirée, aux frontières de mots) est entièrement générique
    // — sinon le span porte du contenu à lui (« Rebour & Fils, employeur de X ») et le
    // céder l'enverrait en CLAIR, ce qui serait l'inverse d'un correctif.
    if (dressesForcedValue(c.value, forcedValues)) return false;
    // Never PII on its own: a generic institutional / legal / document-type word (FR
    // "assemblée générale", "syndic"…), an identifier LABEL ("iban", "passeport"), a
    // compound whose every word is generic ("read-data-schema" — MCP tool metadata,
    // whose per-word aliases redact every "data"/"query" in the conversation), or
    // one of those behind an article. ONE predicate, shared with `../detect.ts` — the
    // three call sites had drifted apart (see `isNonPiiTerm`). This is the choke point,
    // so dropping here protects the DETERMINISTIC detectors too.
    const cat = redactionCategory(c.category);
    if (isNonPiiTerm(c.value, cat)) return false;
    // GLUED OCR PROSE. A scan whose words run together ("le20juin2024", "du20juin2024a")
    // is read as an opaque TOKEN by the credential rules — measured on a corpus of real
    // scanned documents. See `isGluedProse` for why the gate is narrow: a credential and
    // glued prose share a shape, and only the leading function word tells them apart.
    if (isGluedProse(c.value)) return false;
    // Notorious PUBLIC entity — world knowledge (a famous figure, a major company/fund/
    // ticker, a COUNTRY), never the user's own data: faking it makes the model answer
    // about nobody. Category-SCOPED (a person named "Jordan" is not the country — see
    // `../notorious.ts`), and an org-MANDATED category still wins, like it does over `keep`.
    // …SAUF quand le texte la rattache à celui qui écrit (« je travaille chez Google ») :
    // la notoriété dit que l'entité est publique, jamais que la RELATION l'est. Voir
    // `textContext.ts` — la porte ne couvre que le rattachement à la première personne,
    // donc « Total a répondu à l'appel d'offres » reste en clair.
    if (
      !(unrevealable?.size && unrevealable.has(cat)) &&
      isNotoriousEntity(c.value, cat, notoriety) &&
      !isSelfBoundEntity(c.value, input)
    )
      return false;
    // …and neither is a WORD OF one that this very text names: a detector proposing
    // « emploi » next to « Pôle » walks past the check above, and the whole document is
    // then rewritten around an invented company. Same category scoping, same override.
    if (!(unrevealable?.size && unrevealable.has(cat)) && isNotoriousFragment(c.value, cat, input, notoriety))
      return false;
    // An all-lowercase place word in ordinary prose is the common noun, not the town
    // (« les phrases lourdes », « il ouvre les vannes »). A locative neighbour, a postal
    // code or a capitalised occurrence anywhere keeps it — see `textContext.ts`.
    if (
      cat === "location" &&
      !(unrevealable?.size && unrevealable.has(cat)) &&
      isProseGeoHomograph(c.value, input)
    )
      return false;
    // Un segment d'IDENTIFIANT MACHINE (`CARD` dans `CARD_PAYMENT`) n'est pas un lieu :
    // le faux (« METZ_PAYMENT », relevé bancaire réel) corrompt une énumération technique
    // sans protéger personne. Même famille que le gate ci-dessus : LIEU seulement,
    // occurrence-safe, et l'override org-mandaté garde la main.
    if (
      cat === "location" &&
      !(unrevealable?.size && unrevealable.has(cat)) &&
      isMachineTokenGeo(c.value, input)
    )
      return false;
    if (disabled.has(cat)) return false;
    // …and neither does a FRAGMENT of one: a candidate confined to the span of a value the
    // user asked to see in clear is part of that value (a LOC inside a released ADDRESS, a
    // place inside a released company name). Dropping it is what makes « catégorie
    // désactivée » mean one thing instead of half-masking the value. An org-MANDATED
    // category is exempt — a policy the admin enforces cannot be released by turning a
    // NEIGHBOURING category off. `forced` never reaches here (it returned above).
    if (
      disabledSpans?.length &&
      cat === RELEASABLE_FRAGMENT &&
      !(unrevealable?.size && unrevealable.has(cat)) &&
      // Cheap necessary condition FIRST: a value that isn't part of any released value
      // can't be confined to one, and skipping the scan here is what keeps this off the
      // send's critical path.
      releasedValues?.some((v) => v.includes(c.value)) &&
      !occursOutsideUrl(c.value, input, disabledSpans)
    )
      return false;
    // URL-only suppression NEVER applies to a credential NOR to contact identity: a key,
    // a PAN/IBAN, an e-mail or a phone number embedded in a URL must still be redacted,
    // not leaked to the model (audit H-3 + F2 — see `URL_EXEMPT_KINDS`).
    if (urlSpans && !URL_EXEMPT_KINDS.has(cat) && !occursOutsideUrl(c.value, input, urlSpans))
      return false; // URL-only
    // Email-fragment gate: drop a non-email value confined to email addresses (reuses the
    // generic span-overlap check). Never drops the email itself (its category is "email").
    // ⚠️ Le test est un CHEVAUCHEMENT, et il écartait aussi le SUR-ENSEMBLE : une chaîne
    // de connexion (`postgres://user:pass@hôte:5432/base`) chevauche le span e-mail que
    // son `pass@hôte` fabrique, donc elle était écartée ICI — et c'est le fragment
    // e-mail, plus court, qui repartait faussé, laissant l'utilisateur, l'hôte et le
    // port de la base EN CLAIR. Un sur-ensemble contient STRICTEMENT un span entier
    // (DSN, `Nom <mail@x>`) et se juge sur sa propre catégorie. La borne est stricte
    // exprès : une valeur ÉGALE au span — la même adresse re-détectée sous une autre
    // étiquette (un champ « Contact : ») — reste un fragment, sinon elle ressort sous
    // une catégorie que « E-mail désactivé » ne couvre pas.
    if (
      emailSpans &&
      redactionCategory(c.category) !== "email" &&
      !emailSpans.some(([s, e]) => {
        const span = input.slice(s, e);
        return c.value.length > span.length && c.value.includes(span);
      }) &&
      !occursOutsideUrl(c.value, input, emailSpans)
    )
      return false;
    if (isBareNumber(c.value) && !numberCarriesMeaning(c.category)) return false;
    return true;
  });
}

/** Prose-geo categories: a région/département mentioned in PROSE. Emitted ungated by
 *  `frGeo`/`usGeo`/`cjkGeo` because inside an ADDRESS they must be faked coherently. */
const PROSE_GEO = new Set(["REGION", "DEPARTMENT"]);

/**
 * ANCRAGE PERSONNEL du géo de prose : une région/un département SEULS ne sont pas une
 * donnée personnelle — « les 5 plus grandes villes de Normandie » est une question de
 * culture générale, et la redact fait dériver le modèle sur les villes du FAKE
 * (Dijon pour une fausse Bourgogne), une corruption IRRÉVERSIBLE (la dérivation n'est
 * pas une clé de vault). La règle produit : rien n'est redacted tant qu'aucune donnée
 * personnelle n'est présente. Donc REGION/DEPARTMENT ne survivent que si :
 *  - un AUTRE candidat (nom, adresse, commune, tél…) a survécu aux gates — le géo
 *    accompagne des données personnelles (une adresse, un formulaire) ; ou
 *  - le VAULT porte déjà des entrées — la conversation est déjà personnelle, et un
 *    géo cohérent avec les fakes existants doit le rester.
 * Un candidat `forced` n'est jamais droppé (l'utilisateur l'a demandé explicitement).
 */
export function dropUnanchoredProseGeo(kept: Detection[], vaultEmpty: boolean): Detection[] {
  const anchored = !vaultEmpty || kept.some((c) => !PROSE_GEO.has(c.category) || c.forced);
  return anchored ? kept : kept.filter((c) => !PROSE_GEO.has(c.category) || c.forced);
}

/**
 * Drop candidates fully SUBSUMED by a longer one — e.g. a NER-detected NAME
 * ("julien.sabourdin") inside a regex EMAIL ("julien.sabourdin@gmail.com") would
 * otherwise be redacted as a SECOND, overlapping item (2 chips for 1 email).
 * Value-based + occurrence-safe: a candidate is dropped only when EVERY occurrence
 * of its value sits inside a longer candidate's value — a standalone occurrence
 * elsewhere (a real name NOT in an email) is still caught.
 */
export function deNest(kept: Detection[], input: string): Detection[] {
  // Doublon de VALEUR exacte où l'un des candidats vient de l'heuristique générique de
  // clés (`apikey`) et l'autre d'une règle SPÉCIFIQUE : la règle gagne, le doublon clé
  // est retiré. Enregistrer les deux laissait la DERNIÈRE catégorie écraser l'affichage
  // (« api token » sur un BIC pourtant typé `bic`, journal 02/08). Chirurgical : un
  // doublon entre deux catégories non-génériques garde le comportement existant.
  const hasSpecific = new Set(
    kept.filter((c) => redactionCategory(c.category) !== "apikey").map((c) => c.value),
  );
  kept = kept.filter((c) => !(redactionCategory(c.category) === "apikey" && hasSpecific.has(c.value)));
  return kept.filter((c) => {
    const supers = kept.filter(
      (o) => o.value.length > c.value.length && o.value.includes(c.value),
    );
    if (!supers.length) return true;
    let masked = input;
    for (const s of supers) masked = masked.split(s.value).join(" ".repeat(s.value.length));
    return masked.includes(c.value);
  });
}

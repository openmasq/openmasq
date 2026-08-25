import { useSyncExternalStore } from "react";
import {
  FEATURE_ACCESS,
  featureAccessDefaults,
  featureSpec,
  type FeatureId,
} from "@openmasq/catalog";
import type { Section } from "../types";

/**
 * L'ACCÈS aux sections gouvernables — la porte, et rien d'autre.
 *
 * La table (clés de drapeau, défauts, `cutsUsage`) vit dans `@openmasq/catalog`
 * (règle 9 : la même chaîne est tapée dans PostHog et lue ici). Ce module ne fait
 * que tenir la valeur RÉSOLUE de la session et l'offrir aux deux sortes d'appelants :
 * les composants (`useFeatureAccess`) et les modules purs du chemin d'envoi
 * (`featureAccess` / `featureUsage`, lecture synchrone d'un instantané).
 *
 * ══ LA DISTINCTION QUI PORTE TOUT ═══════════════════════════════════════════════
 *
 * **Fermer un accès ne coupe PAS la fonctionnalité.** La Mémoire continue de
 * s'injecter dans chaque envoi, d'être interrogeable par le modèle et de s'extraire
 * en silence ; la Bibliothèque continue de recevoir les fichiers. Seule la PORTE
 * disparaît — l'écran d'inventaire, son entrée de nav, son résultat ⌘K, son lien
 * profond. Les Compétences sont la seule dont la fermeture arrête aussi l'usage
 * (`cutsUsage`), parce qu'une compétence épinglée continuerait sinon d'injecter son
 * prompt depuis une page devenue inatteignable.
 *
 * C'est contre-intuitif, donc c'est TESTÉ dans les deux sens
 * (`featureAccess.test.ts`) : accès mémoire fermé ⇒ `featureUsage("memory")` reste
 * vrai. Quiconque lira « mémoire désactivée » plus tard et voudra couper
 * `selectMemory` fera tomber ce test, qui lui dira pourquoi.
 *
 * ⚠️ **Aucun de ces drapeaux n'est une garde** (règle 7). Le pire qu'ils fassent est
 * de montrer ou cacher un écran ; le redaction, les allow-lists et les gates
 * d'écriture ne se pilotent jamais depuis le réseau. Le corollaire pratique : un
 * relais injoignable rend `featureAccess` au DÉFAUT COMPILÉ (« le produit tel qu'il
 * est livré »), jamais « fermé » — sinon une panne réseau retirerait trois sections
 * à tout le parc.
 */

/** Preuve à la compilation que chaque id gouvernable EST une section de l'app.
 *  `@openmasq/catalog` ne connaît pas `Section` (l'UI dépend du catalogue, jamais
 *  l'inverse) : la correspondance se vérifie donc ici, et une entrée ajoutée là-bas
 *  sans section ici ne compile pas. */
type GatedIsSection = FeatureId extends Section ? true : never;
const _gatedIsSection: GatedIsSection = true;
void _gatedIsSection;

let resolved: Record<FeatureId, boolean> = featureAccessDefaults();
/** Instantané STABLE pour `useSyncExternalStore` : rendre un objet neuf à chaque
 *  lecture ferait boucler React. Il n'est remplacé que sur un vrai changement. */
let snapshot: Record<FeatureId, boolean> = resolved;
const listeners = new Set<() => void>();

/**
 * Publier les accès résolus (le client de drapeaux les pousse au démarrage, puis à
 * chaque rafraîchissement). Tolérant par construction : une clé inconnue est ignorée
 * et une valeur non booléenne laisse le défaut en place — la réponse d'un serveur
 * n'a pas à être crue sur parole pour décider de ce que l'app affiche.
 */
export function setFeatureAccess(next: Partial<Record<FeatureId, boolean>>): void {
  let changed = false;
  const merged = { ...resolved };
  for (const spec of FEATURE_ACCESS) {
    const v = next[spec.id];
    if (typeof v !== "boolean" || v === merged[spec.id]) continue;
    merged[spec.id] = v;
    changed = true;
  }
  if (!changed) return;
  resolved = merged;
  snapshot = merged;
  for (const l of listeners) l();
}

/**
 * Traduire une réponse PostHog (« clé → valeur ») en accès.
 *
 * ⚠️ Les drapeaux disent **CACHER**, pas « autoriser » — `access = !hidden` — et une
 * clé ABSENTE vaut « pas caché ». Ce n'est pas de la tolérance, c'est le cœur du
 * dispositif : PostHog OMET un drapeau désactivé au lieu de le rendre à `false`
 * (mesuré), donc « jamais créé », « désactivé » et « injoignable » retombent tous les
 * trois sur OUVERT. La raison complète est dans `@openmasq/catalog` `flags.ts` — ne
 * pas ré-inverser la polarité sans l'avoir relue.
 *
 * Un drapeau peut aussi valoir une VARIANTE (chaîne) : seule une porte booléenne a un
 * sens ici, une variante laisse donc la valeur en place plutôt que d'inventer un état.
 */
export function setFeatureAccessFromFlags(flags: Record<string, unknown>): void {
  const answered: Record<string, unknown> = flags && typeof flags === "object" ? flags : {};
  const next: Partial<Record<FeatureId, boolean>> = {};
  for (const spec of FEATURE_ACCESS) {
    const value = answered[spec.hideFlag];
    if (value === undefined) next[spec.id] = true; // absent ⇒ pas caché ⇒ ouvert
    else if (typeof value === "boolean") next[spec.id] = !value;
  }
  setFeatureAccess(next);
}

/** Tests uniquement : revenir aux défauts compilés. */
export function __resetFeatureAccess(): void {
  resolved = featureAccessDefaults();
  snapshot = resolved;
  for (const l of listeners) l();
}

/** La PORTE est-elle ouverte ? (écran, entrée de nav, ⌘K, lien profond) */
export function featureAccess(id: FeatureId): boolean {
  return resolved[id];
}

/**
 * La fonctionnalité peut-elle être UTILISÉE ? Vrai tant que la porte est ouverte —
 * et vrai MÊME PORTE FERMÉE pour celles qui continuent de tourner (`cutsUsage:
 * false`). Voir l'en-tête : c'est la moitié du dispositif, pas un raccourci.
 */
export function featureUsage(id: FeatureId): boolean {
  return resolved[id] || !featureSpec(id).cutsUsage;
}

/** Les sections à monter : tout ce qui n'est pas gouverné, plus les portes ouvertes. */
export function enabledSections(all: readonly Section[]): Section[] {
  return all.filter((s) => !isGated(s) || featureAccess(s));
}

/** `true` si cette section a une porte (donc si `featureAccess` la concerne). */
export function isGated(s: Section): s is FeatureId {
  return FEATURE_ACCESS.some((f) => f.id === s);
}

/** La section à afficher quand celle qu'on visait est fermée — jamais un cul-de-sac.
 *  Utilisé au boot (une section persistée peut avoir été fermée depuis) ET en vol
 *  (un drapeau peut basculer pendant qu'on est sur l'écran). */
export function sectionOrFallback(s: Section): Section {
  return isGated(s) && !featureAccess(s) ? "chats" : s;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Les accès, réactifs. Les composants lisent ÇA ; les modules purs du chemin
 *  d'envoi lisent `featureAccess`/`featureUsage` (pas de React là-bas). */
export function useFeatureAccess(): Record<FeatureId, boolean> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

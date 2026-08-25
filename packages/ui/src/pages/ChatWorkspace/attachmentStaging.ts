import type { Attachment } from "./Composer";

/**
 * Où vit un chip : dans l'état local, ou parqué dans le magasin sous l'id d'une conversation
 * qui n'est pas encore à l'écran.
 *
 * ⚠️ **La pose et la correction doivent choisir le MÊME côté.** « Demander » crée la
 * conversation et met le fichier en scène dans le même souffle, et cette conversation
 * n'atteint l'écran qu'un commit plus tard : un chip parqué que l'on corrige localement
 * n'est trouvé nulle part, et reste « extraction en cours » pour toujours. Deux fonctions,
 * une seule règle d'aiguillage — c'est tout l'intérêt de les écrire ensemble.
 */
export interface StagingDeps {
  /** La conversation RÉELLEMENT rendue à l'instant (une ref, jamais une valeur capturée). */
  currentConvId(): string | undefined;
  setLocal(update: (prev: Attachment[]) => Attachment[]): void;
  getParked?(convId: string): readonly Attachment[] | undefined;
  setParked?(convId: string, files: Attachment[]): void;
}

/**
 * DEUX pièces jointes sont-elles la MÊME ?
 *
 * ⚠️ Mesuré le 15/08/2026 : « Demander » agit sur l'onglet ACTIF du panneau, et pressé une
 * seconde fois sans changer d'onglet — ce qui arrive dès qu'on croit avoir changé de fichier
 * — il joignait le MÊME document une seconde fois, sans rien dire. Le contenu partait en
 * double (tokens payés deux fois) et le modèle pouvait le lire comme DEUX pièces à
 * comparer : il a commencé une réponse « document 1 / document 2 » sur un doublon.
 *
 * ⚠️ Et l'identité BOUGE pendant le chargement : « Demander » pose d'abord un chip VIDE
 * (nom seul), que l'extraction remplit ensuite. Une clé figée « nom + taille du texte »
 * ne reconnaissait donc pas le chip déjà posé, et le doublon repassait — vérifié en
 * direct, c'est ce qui a fait échouer la première version de ce correctif.
 *
 * D'où la comparaison, dans cet ordre : le CHEMIN quand les deux en ont un ; sinon le NOM,
 * les tailles ne départageant que si les DEUX sont déjà remplies (deux fichiers homonymes
 * au contenu différent restent deux pièces).
 */
const sameAttachment = (a: Attachment, b: Attachment): boolean => {
  if (a.path && b.path) return a.path === b.path;
  if (a.name !== b.name) return false;
  const ta = a.text?.length ?? 0;
  const tb = b.text?.length ?? 0;
  return !ta || !tb || ta === tb;
};

export function makeStaging(d: StagingDeps): {
  stage(added: Attachment[], forConvId?: string): void;
  patch(cid: string, patch: Partial<Attachment>, forConvId?: string): void;
} {
  // Poser sur l'état local un fichier destiné à une AUTRE conversation le montrerait sur
  // celle que l'utilisateur quitte — d'où l'aiguillage, et non un simple `setLocal`.
  const parked = (forConvId?: string): string | undefined =>
    forConvId && forConvId !== d.currentConvId() ? forConvId : undefined;

  return {
    stage(added, forConvId) {
      // Un fichier DÉJÀ joint à cette conversation ne se rejoint pas (voir `identity`).
      const neufs = (deja: readonly Attachment[]): Attachment[] => {
        const vus: Attachment[] = [...deja];
        return added.filter((a) => {
          if (vus.some((b) => sameAttachment(a, b))) return false;
          vus.push(a); // le lot lui-même peut porter deux fois la même pièce
          return true;
        });
      };
      const id = parked(forConvId);
      if (id) {
        const deja = d.getParked?.(id) ?? [];
        const ajout = neufs(deja);
        if (ajout.length) d.setParked?.(id, [...deja, ...ajout]);
      } else {
        d.setLocal((prev) => [...prev, ...neufs(prev)]);
      }
    },
    patch(cid, patch, forConvId) {
      const apply = (list: readonly Attachment[]): Attachment[] =>
        list.map((a) => (a.cid === cid ? { ...a, ...patch } : a));
      const id = parked(forConvId);
      if (id) d.setParked?.(id, apply(d.getParked?.(id) ?? []));
      else d.setLocal(apply);
    },
  };
}

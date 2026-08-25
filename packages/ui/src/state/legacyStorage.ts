/**
 * Migration du parc — renommage du 24/08/2026.
 *
 * Le nom de code du monorepo a changé, et avec lui le préfixe des clés localStorage
 * (`<ancien>.…` → `openmasq.…`, variantes par compte `:<uid>` comprises). Une install
 * d'avant la migration démarre donc avec ses réglages, son thème, ses onglets… sous
 * l'ANCIEN préfixe : sans cette copie, l'app repartirait à vide sous ses yeux.
 *
 * COPIE, jamais un déplacement : l'ancienne clé reste en place pour qu'un retour en
 * arrière de build retrouve son état. Et la cible ne s'écrase JAMAIS — une clé déjà
 * écrite par la nouvelle build a raison sur la vieille.
 *
 * ⚠️ Ce fichier est LA maison du préfixe retiré (exception nommée de `check:brand`,
 * avec le script de thème d'`index.html` et l'adoption du DB legacy) — ne l'écrire
 * nulle part ailleurs.
 */

/** Exporté pour les tests — jamais pour un lecteur : lisez la clé COURANTE. */
export const LEGACY_STORAGE_PREFIX = "openmasq.";
const PREFIX = "openmasq.";

let done = false;

/** Test-only : ré-arme la passe (le flag module survit entre tests). */
export function resetLegacyStorageMigrationForTests(): void {
  done = false;
}

/**
 * Copie chaque clé `<ancien>.<suffixe>` vers `openmasq.<suffixe>` absente. Idempotente
 * (une passe par session), sûre sans `localStorage` (SSR, worker, test node). Appelée
 * en tête des PREMIERS lecteurs (`theme`, `storePersistence.load`, `reduxBoot`…) —
 * tout lecteur ultérieur voit donc des clés déjà migrées.
 */
export function migrateLegacyLocalStorage(): void {
  if (done) return;
  done = true;
  try {
    const legacyKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_STORAGE_PREFIX)) legacyKeys.push(k);
    }
    for (const k of legacyKeys) {
      const target = PREFIX + k.slice(LEGACY_STORAGE_PREFIX.length);
      if (localStorage.getItem(target) !== null) continue;
      const v = localStorage.getItem(k);
      if (v !== null) localStorage.setItem(target, v);
    }
  } catch {
    // Pas de localStorage ici (SSR / test node) — rien à migrer, et surtout rien à casser.
  }
}

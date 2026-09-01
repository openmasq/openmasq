/**
 * Le FORMAT des manifestes de mise à jour du bureau — une seule maison.
 *
 * Il vivait dans `apps/updates/src/lib/desktopArch.ts` (le serveur du flux), et
 * `apps/desktop` l'atteignait par une CLI, faute de pouvoir importer une app sœur. Le
 * split d'août 2026 a coupé ce lien : les deux apps sont désormais dans des DÉPÔTS
 * différents, et le `release.yml` du bureau échouait sur un chemin qui n'existait plus.
 *
 * D'où ce paquet, ici plutôt que là-bas : le dépôt infra consomme celui-ci par
 * sous-module, jamais l'inverse. Placer la maison du côté consommé est le seul sens qui
 * laisse les DEUX y accéder — le producteur des manifestes (`apps/desktop`) comme le
 * serveur qui les recompose (`apps/updates`).
 */
export type DesktopArch = 'arm64' | 'x64';

/** La valeur stockée dans `bundles.bundle_arch`. `''` = « ce manifeste couvre toutes les
 *  arches qu'il liste » — c'est le cas de TOUT ce qui a été publié jusqu'ici (un build unique
 *  produisant les deux), et c'est ce qui rend la migration transparente. */
export type StoredArch = '' | DesktopArch;

/** L'arche d'un artefact, avec le test EXACT du client (voir l'en-tête). */
export function archOfArtifact(filename: string): DesktopArch {
    return filename.includes('arm64') ? 'arm64' : 'x64';
}

/** Les noms d'artefacts d'un manifeste : les `url:` du bloc `files:`, et le `path:` de tête
 *  en dernier recours (un manifeste ancien pouvait n'avoir que lui). */
function artifactNames(yml: string): string[] {
    const names = [...yml.matchAll(/^\s*-\s*url:\s*(.+?)\s*$/gm)].map((m) => stripQuotes(m[1]));
    if (names.length > 0) return names;
    const p = yml.match(/^path:\s*(.+?)\s*$/m);
    return p ? [stripQuotes(p[1])] : [];
}

/** Les arches réellement couvertes par un manifeste. C'est le CONTENU qui décide — jamais une
 *  liste d'arches recopiée quelque part, qui divergerait au premier ajout (règle 9). */
export function manifestArchCoverage(yml: string): Set<DesktopArch> {
    return new Set(artifactNames(yml).map(archOfArtifact));
}

/** L'arche à STOCKER pour un manifeste qu'on enregistre. Plus d'une arche couverte ⇒ `''` :
 *  le manifeste se suffit à lui-même, exactement comme avant cette colonne. */
export function archFromManifest(yml: string): StoredArch {
    const cover = manifestArchCoverage(yml);
    return cover.size === 1 ? [...cover][0] : '';
}

/** `a` couvre-t-il au moins tout ce que couvre `b` ? Sert à décider si une version est
 *  servable : une version qui régresse la couverture de la précédente est un leg à moitié
 *  publié, pas une release. */
export function coversAtLeast(a: Set<DesktopArch>, b: Set<DesktopArch>): boolean {
    for (const arch of b) if (!a.has(arch)) return false;
    return true;
}

// ── fusion ──────────────────────────────────────────────────────────────────────────────
// On ne parse PAS le YAML (pas de lib YAML sur le runtime Workers, et surtout : ce qui est
// renvoyé doit rester octet pour octet ce qu'electron-builder a écrit, puisque le client
// vérifie des sha512). On travaille donc en lignes, comme `desktopManifest.ts`.

interface Split {
    head: string[]; // avant `files:`
    entries: string[][]; // une entrée = sa ligne `- url:` + ses lignes indentées
    tail: string[]; // après le bloc
}

/** Découpe un manifeste autour de son bloc `files:`. Un manifeste sans bloc `files:` n'a
 *  aucune entrée — il ressortira tel quel de la fusion. */
function split(yml: string): Split | null {
    const lines = yml.split('\n');
    const at = lines.findIndex((l) => /^files:\s*$/.test(l));
    if (at === -1) return null;
    const entries: string[][] = [];
    let i = at + 1;
    for (; i < lines.length; i++) {
        const line = lines[i];
        if (line.trim() === '') break;
        if (/^\S/.test(line)) break; // une clé de premier niveau termine le bloc
        if (/^\s*-\s/.test(line)) entries.push([line]);
        else if (entries.length > 0) entries[entries.length - 1].push(line);
        else return null; // bloc mal formé : on ne touche à rien
    }
    return { head: lines.slice(0, at), entries, tail: lines.slice(i) };
}

/** L'`url:` d'une entrée — la clé de déduplication entre manifestes. */
function entryUrl(entry: string[]): string | null {
    const m = entry[0].match(/^\s*-\s*url:\s*(.+?)\s*$/);
    return m ? stripQuotes(m[1]) : null;
}

/**
 * Fusionne des manifestes de la MÊME version en un seul, en réunissant leurs entrées `files:`.
 *
 * ⚠️ UN SEUL manifeste ressort VERBATIM. C'est la propriété qui rend cette migration
 * invisible : tant qu'un canal n'a qu'une ligne par version — c'est-à-dire tout l'existant —
 * le feed renvoie exactement les octets d'avant. Épinglé par `tests/desktopArch.test.ts`.
 *
 * Le premier manifeste (le plus récent) sert de base : ce sont SES `version`, `path`,
 * `sha512` et `releaseDate` qui sortent. C'est déjà ce que fait electron-builder pour un
 * build bi-arche — son `path:` de tête nomme le zip arm64 — donc la forme ne change pas.
 */
export function composeManifests(manifests: string[]): string {
    const kept = manifests.filter((m) => m && m.trim() !== '');
    if (kept.length === 0) return '';
    if (kept.length === 1) return kept[0];

    const base = split(kept[0]);
    if (!base) return kept[0]; // pas de bloc `files:` : rien de sûr à fusionner
    const seen = new Set(base.entries.map(entryUrl).filter((u): u is string => u !== null));
    for (const other of kept.slice(1)) {
        const s = split(other);
        if (!s) continue;
        for (const entry of s.entries) {
            const url = entryUrl(entry);
            if (!url || seen.has(url)) continue;
            seen.add(url);
            base.entries.push(entry);
        }
    }
    return [...base.head, 'files:', ...base.entries.flat(), ...base.tail].join('\n');
}

function stripQuotes(v: string): string {
    return v.replace(/^['"]|['"]$/g, '').trim();
}

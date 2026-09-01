import { describe, expect, it } from 'vitest';
import {
    archFromManifest,
    archOfArtifact,
    composeManifests,
    coversAtLeast,
    manifestArchCoverage,
} from './index';
import { BRAND as brand } from '@openmasq/branding';

// Le nom de produit qui préfixe chaque artefact electron-builder (`artifactName`).
const N = brand.name;

// Le manifeste bi-arche tel qu'electron-builder l'écrit pour un build mac : c'est LA forme
// qui circule aujourd'hui, et celle qui ne doit pas bouger d'un octet.
const COMBINED = [
    'version: 0.5.0',
    'files:',
    `  - url: ${N}-0.5.0-arm64-mac.zip`,
    '    sha512: AAA==',
    '    size: 591189240',
    `  - url: ${N}-0.5.0-arm64.dmg`,
    '    sha512: BBB==',
    '    size: 593762792',
    `  - url: ${N}-0.5.0-x64-mac.zip`,
    '    sha512: CCC==',
    '    size: 601189240',
    `  - url: ${N}-0.5.0-x64.dmg`,
    '    sha512: DDD==',
    '    size: 603762792',
    `path: ${N}-0.5.0-arm64-mac.zip`,
    'sha512: AAA==',
    "releaseDate: '2026-08-12T14:44:00.000Z'",
    '',
].join('\n');

const ARM_ONLY = [
    'version: 0.5.0',
    'files:',
    `  - url: ${N}-0.5.0-arm64-mac.zip`,
    '    sha512: AAA==',
    '    size: 591189240',
    `  - url: ${N}-0.5.0-arm64.dmg`,
    '    sha512: BBB==',
    '    size: 593762792',
    `path: ${N}-0.5.0-arm64-mac.zip`,
    'sha512: AAA==',
    "releaseDate: '2026-08-12T14:44:00.000Z'",
    '',
].join('\n');

const X64_ONLY = [
    'version: 0.5.0',
    'files:',
    `  - url: ${N}-0.5.0-x64-mac.zip`,
    '    sha512: CCC==',
    '    size: 601189240',
    `  - url: ${N}-0.5.0-x64.dmg`,
    '    sha512: DDD==',
    '    size: 603762792',
    `path: ${N}-0.5.0-x64-mac.zip`,
    'sha512: CCC==',
    "releaseDate: '2026-08-12T16:10:00.000Z'",
    '',
].join('\n');

describe("l'arche d'un artefact suit la définition du CLIENT", () => {
    // `MacUpdater.filterFilesForArch` ne connaît qu'un test : le nom contient-il « arm64 ».
    // Si le serveur classait autrement, il annoncerait une couverture que le client ne
    // retrouverait pas — et un client sans fichier pour son processeur n'échoue pas à la
    // vérification, il meurt au téléchargement.
    it('« arm64 » dans le nom, et rien d’autre', () => {
        expect(archOfArtifact(`${N}-0.5.0-arm64-mac.zip`)).toBe('arm64');
        expect(archOfArtifact(`${N}-0.5.0-x64.dmg`)).toBe('x64');
        // Pas de reconnaissance « intelligente » : le client ne la ferait pas.
        expect(archOfArtifact(`${N}-0.5.0-aarch64.dmg`)).toBe('x64');
    });
});

describe('couverture et arche stockée', () => {
    it('lit la couverture dans le CONTENU, pas dans une liste recopiée', () => {
        expect([...manifestArchCoverage(COMBINED)].sort()).toEqual(['arm64', 'x64']);
        expect([...manifestArchCoverage(ARM_ONLY)]).toEqual(['arm64']);
        expect([...manifestArchCoverage(X64_ONLY)]).toEqual(['x64']);
    });

    it("stocke '' pour un manifeste bi-arche — l'existant reste inchangé", () => {
        expect(archFromManifest(COMBINED)).toBe('');
        expect(archFromManifest(ARM_ONLY)).toBe('arm64');
        expect(archFromManifest(X64_ONLY)).toBe('x64');
    });

    it('une couverture partielle ne couvre pas la précédente', () => {
        const both = manifestArchCoverage(COMBINED);
        const arm = manifestArchCoverage(ARM_ONLY);
        expect(coversAtLeast(both, arm)).toBe(true);
        expect(coversAtLeast(arm, both)).toBe(false);
    });
});

describe('fusion des legs', () => {
    // ⚠️ L'INVARIANT DE LA MIGRATION. Tant qu'une version n'a qu'une ligne — c'est-à-dire
    // tout ce qui est publié aujourd'hui — le feed doit renvoyer EXACTEMENT les octets
    // d'electron-builder : le client vérifie des sha512, et une reconstruction « équivalente »
    // qui réordonne ou reformate serait une régression invisible en revue.
    it('un seul manifeste ressort VERBATIM', () => {
        expect(composeManifests([COMBINED])).toBe(COMBINED);
        expect(composeManifests([ARM_ONLY])).toBe(ARM_ONLY);
    });

    it('deux legs donnent un manifeste couvrant les deux arches', () => {
        const merged = composeManifests([ARM_ONLY, X64_ONLY]);
        expect([...manifestArchCoverage(merged)].sort()).toEqual(['arm64', 'x64']);
        // Les entrées du leg de base sont intactes, sha512 compris.
        expect(merged).toContain(`  - url: ${N}-0.5.0-arm64-mac.zip`);
        expect(merged).toContain('    sha512: AAA==');
        expect(merged).toContain(`  - url: ${N}-0.5.0-x64.dmg`);
        expect(merged).toContain('    sha512: DDD==');
        // La tête vient du leg le plus récent passé en premier : une seule `version:`.
        expect(merged.match(/^version:/gm)).toHaveLength(1);
        expect(merged).toContain(`path: ${N}-0.5.0-arm64-mac.zip`);
    });

    it('ne duplique pas une entrée déjà présente', () => {
        const merged = composeManifests([COMBINED, ARM_ONLY]);
        expect(merged.match(new RegExp(`- url: ${N}-0\\.5\\.0-arm64-mac\\.zip`, 'g'))).toHaveLength(1);
        expect([...manifestArchCoverage(merged)].sort()).toEqual(['arm64', 'x64']);
    });

    it('un manifeste vide ne casse pas la fusion', () => {
        expect(composeManifests(['', ARM_ONLY])).toBe(ARM_ONLY);
        expect(composeManifests([])).toBe('');
    });
});

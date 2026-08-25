/**
 * PII ratchet — les identités RÉELLES ne reviennent pas dans le dépôt.
 *
 * Le produit est un moteur de redaction : ses tests ont besoin de données qui RESSEMBLENT
 * à de la PII, et c'est légitime. Ce qu'elles ne doivent pas être, c'est celle de quelqu'un.
 * `packages/redact/src/__fixtures__/` porte la convention — des personas inventées, un
 * README qui le dit — et ce gate est ce qui empêche la deuxième convention (« je prends ce
 * que j'ai sous la main ») de revenir un soir de correctif.
 *
 * ⚠️ **La liste est HACHÉE, et c'est la seule façon dont ce fichier peut exister.** Un
 * denylist en clair remettrait dans le dépôt public exactement les chaînes qu'on vient d'en
 * retirer — le gate serait la fuite. On compare donc des empreintes : le fichier ne dit
 * jamais QUI il protège, seulement que quelque chose de connu est réapparu.
 *
 * Ajouter un terme : `node scripts/check-pii.mjs --hash "la valeur"`, puis coller
 * l'empreinte ci-dessous avec un commentaire qui dit la CATÉGORIE, jamais la valeur.
 *
 * Ce que le gate NE fait PAS : bannir un prénom nu. « thomas » et « numa » sont des prénoms
 * du lexique `firstNames.data.ts` et doivent y rester — c'est l'identité (patronyme, forme
 * collée, bigramme de société, identifiant) qui est interdite, pas un mot du dictionnaire.
 *
 *   node scripts/check-pii.mjs        # ou: pnpm check:pii
 *
 * Codes de sortie : 0 = propre ; 1 = une identité réelle est réapparue.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

/** Empreintes interdites (sha256 du terme replié, 16 premiers caractères). */
const BANNED = new Map([
  ["54c291eb2346853f", "patronyme d'une personne réelle"],
  ["0ff9174a9925fad0", "identité réelle, forme collée (chemin/handle)"],
  ["2152d9b597ab24a2", "local-part d'une adresse e-mail personnelle"],
  ["c54743b08ce03dfe", "société réelle, forme collée"],
  ["3040da40375141ae", "société réelle"],
  ["4661da1efb155361", "société réelle, forme domaine"],
  ["531f6edabf0149d8", "société réelle, forme nom de fichier"],
  ["a34abf3a6bdfff46", "identifiant administratif personnel"],
  ["c30f39054eb0f384", "identifiant administratif personnel"],
  ["337c4f2603570d8f", "référence de facture réelle"],
  ["e74d2792c5bb3f78", "nom de projet/client réel"],
  ["f48164934dd7d674", "nom de projet/client réel"],
  // Identités réelles retirées d'une fixture issue d'un journal (26/08/2026) : deux
  // chercheurs nommés, et un prénom assez distinctif pour identifier seul.
  ["69ac038132139275", "patronyme d'une personne réelle"],
  ["ea72e0ba02eb0c3d", "identité réelle, prénom + patronyme"],
  ["d2e4e2e840510929", "prénom distinctif d'une personne réelle"],
  ["5b3c14cb49cc2868", "pseudo réel (handle de compte)"],
  // ⚠️ Le PRÉNOM de cette identité n'est PAS banni, et c'est délibéré : il vit dans
  // `firstNames.data.ts`, dans la liste masculine de `gender.ts` et dans les patronymes
  // de `surnamesGuard.data.ts`, où il est un mot de dictionnaire — l'en retirer rendrait
  // le moteur aveugle à toute personne qui le porte. On bannit ce qui DÉSIGNE : le
  // bigramme, le patronyme, la société.
  ["5d896dc9ab526f7a", "identité réelle, prénom + patronyme"],
  ["4085c11577b99640", "patronyme d'une personne réelle"],
  ["3784b6419c484732", "société réelle"],
  // Cabinet réel. Le gate compare des MOTS entiers, donc « gideon » (prénom du gazetteer)
  // et « frigideira » (vocabulaire) ne matchent pas — une sous-chaîne n'est pas une identité.
  ["89c986e7b5d11b1d", "cabinet réel"],
  // Identifiants d'infrastructure de l'éditeur, retirés au passage en variables
  // d'environnement (25/08/2026) — publics par conception mais liés à UN compte,
  // ils ne reviennent pas : réf de projet base/auth, clé publiable, clé d'ingestion
  // analytics, DSN et org de télémétrie, client OAuth (id + fragment de secret),
  // ids d'apps connecteurs.
  ["3f1bd64743dd4d37", "réf du projet base/auth de l'éditeur"],
  ["093b9b0d7845c95a", "clé publiable du projet base/auth"],
  ["d05d49e1adce6ecb", "clé d'ingestion analytics de l'éditeur"],
  ["3b51360fe9dae2de", "clé du DSN de télémétrie de l'éditeur"],
  ["92fbd8ee7a95a811", "org de télémétrie de l'éditeur"],
  ["c404f776449aa468", "client OAuth Google de l'éditeur"],
  ["f8668e516c7cbcc9", "fragment de secret OAuth Google de l'éditeur"],
  ["643412d1893ab2a0", "client OAuth GitHub de l'éditeur"],
  ["64333a2e044ab6c0", "app Slack de l'éditeur"],
  ["e4ae09db72ecbb10", "app Microsoft de l'éditeur"],
]);

/** Repli de comparaison : minuscules + diacritiques retirés (un OCR les perd aussi). */
const fold = (s) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
const digest = (s) => createHash("sha256").update(fold(s)).digest("hex").slice(0, 16);

if (process.argv[2] === "--hash") {
  const value = process.argv[3];
  if (!value) {
    console.error("usage: node scripts/check-pii.mjs --hash \"la valeur\"");
    process.exit(2);
  }
  console.log(digest(value));
  process.exit(0);
}

// Le gate lui-même contient des empreintes, jamais des valeurs — rien à y chercher.
const SELF = "scripts/check-pii.mjs";
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|pdf|docx?|xlsx?|zip|woff2?|ttf|otf|wasm|onnx|node|dylib|so|dll|exe|traineddata|mp[34]|mov)$/i;
const MAX_BYTES = 4_000_000;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\n")
  .filter((f) => f && f !== SELF && !BINARY.test(f));

const hits = [];
for (const file of files) {
  let text;
  try {
    if (statSync(file).size > MAX_BYTES) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue; // illisible ou binaire non extensionné — rien à dire
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Les mots de la ligne, puis les bigrammes adjacents : une société tient en deux mots,
    // un patronyme en un seul. Au-delà, le gate n'a rien à protéger.
    const words = fold(lines[i]).match(/[a-z0-9]{4,}/g);
    if (!words) continue;
    for (let w = 0; w < words.length; w++) {
      for (const candidate of [words[w], w + 1 < words.length ? `${words[w]} ${words[w + 1]}` : null]) {
        if (!candidate) continue;
        const why = BANNED.get(digest(candidate));
        if (why) hits.push({ file, line: i + 1, why });
      }
    }
  }
}

if (hits.length) {
  console.error(`\n✗ ${hits.length} occurrence(s) d'une identité réelle :\n`);
  // Le rapport nomme l'ENDROIT et la CATÉGORIE, jamais la valeur : un log de CI est public.
  for (const h of hits.slice(0, 40)) console.error(`  ${h.file}:${h.line} — ${h.why}`);
  if (hits.length > 40) console.error(`  … et ${hits.length - 40} de plus`);
  console.error(
    `\n  Les fixtures de PII sont INVENTÉES : voir packages/redact/src/__fixtures__/README.md.\n` +
      `  Reprendre une persona existante, ou en créer une qui tient les mêmes propriétés\n` +
      `  (longueur, prénom du lexique, initiale consonne/voyelle) que la valeur remplacée.\n`,
  );
  process.exit(1);
}

console.log(`✓ ${files.length} fichiers — aucune identité réelle (${BANNED.size} empreintes surveillées).`);

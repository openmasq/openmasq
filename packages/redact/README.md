# @openmasq/redact — the redaction engine

<sub>**English** · [Français](#openmasqredact--le-moteur-de-masquage) · [openmasq.com](https://openmasq.com)</sub>

Sensitive data is replaced **before it leaves the machine** by a placeholder or a
believable fake, and restored in the reply from the same **per-conversation vault**.
This package is that engine: `redact` / `pseudonymize` / `unredact` / `toSegments`, the
category model, the document extractors and the on-device NER.

**Boundary.** Pure TypeScript, no Electron, no React, no network — except the `remote/`
entry (an optional remote engine the caller opts into) and `local/ner.ts` (ONNX on
device). Every subpath in `package.json` `exports` has a matching `tsup.config.ts` entry:
move one, move both.

## Install & use

```bash
npm install @openmasq/redact
```

```ts
import { pseudonymize, unredact } from "@openmasq/redact";

const vault = {};                                    // yours: keep it, never send it
const { text } = await pseudonymize(prompt, { vault }); // what the model sees
const restored = unredact(modelReply, vault);           // what the user sees
```

The **vault** maps every substitute to the real value: it is the sensitive data itself.
The engine never stores it — the caller keeps it in memory, encrypts it at rest, and never
sends it with the text.

**Fail closed.** Names, companies, addresses, places and birth dates (`MODEL_CATEGORIES`)
need a model detector — rules only catch their anchored forms. If `requiresModel(disabledKinds)`
is true and you pass no `detectLocal`, refuse the pass rather than send a half-masked text.
Which categories to enable (your « levels ») is your policy: the engine only states the fact.

The core entry (`.`) only depends on `libphonenumber-js` and `fflate`. The other entries
need **optional peers** the consumer installs:

| Entry | Install |
|---|---|
| `/documents`, `/documents.browser` | `pdfjs-dist`, `mammoth`, `@napi-rs/canvas` (Node), `xlsx` ≥ 0.20.3 from the official [SheetJS CDN](https://cdn.sheetjs.com) |
| `/inplace` | `xlsx` (as above) |
| `/pdf-redact`, `/image-redact` | `pdfjs-dist`, `@napi-rs/canvas` (Node) |
| `/ner` | `@huggingface/transformers`, `onnxruntime-node` |

OCR of scans (`tesseract2.js`) is not published yet: outside this monorepo, a document that
needs OCR fails with a `DocumentError` of code `ocr_engine_missing`; text layers still extract.

**Start here.**
- `src/index.ts` — the barrel; `src/engine/` — the pipeline (rules, fakes, formulas).
- `src/model/` — categories, validators, vocabularies (French-language term lists — the
  product's first market — under English module names).
- `src/documents/` — PDF/OOXML/image extraction; `src/viewer/` — in-place redaction.
- `src/__cases__/` — the regression corpus, one file per document family; `bench/` — recall
  benches run by `pnpm test:corpus`, never by `pnpm test`.

`pnpm test:redact` is the fast lane for engine work (~4 s). The suite is the specification:
a rule without a case is not finished.

---

# @openmasq/redact — le moteur de masquage

Les données sensibles sont remplacées **avant de quitter la machine** par un espace réservé ou
un faux crédible, et restaurées dans la réponse depuis le même **coffre propre à la
conversation**. Ce paquet est ce moteur : `redact` / `pseudonymize` / `unredact` /
`toSegments`, le modèle de catégories, les extracteurs de documents et la NER sur l'appareil.

**Frontière.** TypeScript pur, pas d'Electron, pas de React, pas de réseau — sauf l'entrée
`remote/` (un moteur distant optionnel que l'appelant choisit) et `local/ner.ts` (ONNX sur
l'appareil). Chaque sous-chemin des `exports` de `package.json` a une entrée correspondante
dans `tsup.config.ts` : si vous en déplacez un, déplacez les deux.

## Installation et usage

```bash
npm install @openmasq/redact
```

```ts
import { pseudonymize, unredact } from "@openmasq/redact";

const vault = {};                                    // le vôtre : gardez-le, ne l'envoyez jamais
const { text } = await pseudonymize(prompt, { vault }); // ce que voit le modèle
const restored = unredact(modelReply, vault);           // ce que voit l'utilisateur
```

Le **coffre** associe chaque substitut à la vraie valeur : c'est la donnée sensible elle-même.
Le moteur ne le stocke jamais — l'appelant le garde en mémoire, le chiffre au repos, et ne
l'envoie jamais avec le texte.

**Échouer fermé.** Noms, entreprises, adresses, lieux et dates de naissance (`MODEL_CATEGORIES`)
exigent un détecteur à modèle — les règles n'en attrapent que les formes ancrées. Si
`requiresModel(disabledKinds)` est vrai et qu'aucun `detectLocal` n'est fourni, refusez la passe
plutôt que d'envoyer un texte à moitié masqué. Quelles catégories activer (vos « niveaux ») est
votre politique : le moteur n'énonce que le fait.

L'entrée principale (`.`) ne dépend que de `libphonenumber-js` et `fflate`. Les autres entrées
demandent des **peers optionnels** que le consommateur installe :

| Entrée | À installer |
|---|---|
| `/documents`, `/documents.browser` | `pdfjs-dist`, `mammoth`, `@napi-rs/canvas` (Node), `xlsx` ≥ 0.20.3 depuis le [CDN officiel SheetJS](https://cdn.sheetjs.com) |
| `/inplace` | `xlsx` (idem) |
| `/pdf-redact`, `/image-redact` | `pdfjs-dist`, `@napi-rs/canvas` (Node) |
| `/ner` | `@huggingface/transformers`, `onnxruntime-node` |

L'OCR des scans (`tesseract2.js`) n'est pas encore publié : hors de ce monorepo, un document
qui en a besoin échoue avec une `DocumentError` de code `ocr_engine_missing` ; les couches texte
s'extraient normalement.

**Commencez ici.**
- `src/index.ts` — le barrel ; `src/engine/` — le pipeline (règles, faux, formules).
- `src/model/` — catégories, validateurs, vocabulaires (listes de termes en français — le
  premier marché du produit — sous des noms de modules anglais).
- `src/documents/` — extraction PDF/OOXML/image ; `src/viewer/` — le masquage sur place.
- `src/__cases__/` — le corpus de non-régression, un fichier par famille de documents ;
  `bench/` — les bancs de rappel lancés par `pnpm test:corpus`, jamais par `pnpm test`.

`pnpm test:redact` est la voie rapide pour le travail sur le moteur (~4 s). La suite est la
spécification : une règle sans cas n'est pas finie.

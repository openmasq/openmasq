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

**Commencez ici.**
- `src/index.ts` — le barrel ; `src/engine/` — le pipeline (règles, faux, formules).
- `src/model/` — catégories, validateurs, vocabulaires (listes de termes en français — le
  premier marché du produit — sous des noms de modules anglais).
- `src/documents/` — extraction PDF/OOXML/image ; `src/viewer/` — le masquage sur place.
- `src/__cases__/` — le corpus de non-régression, un fichier par famille de documents ;
  `bench/` — les bancs de rappel lancés par `pnpm test:corpus`, jamais par `pnpm test`.

`pnpm test:redact` est la voie rapide pour le travail sur le moteur (~4 s). La suite est la
spécification : une règle sans cas n'est pas finie.

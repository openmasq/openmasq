# External comparison — Presidio's own evaluation corpus

<sub>**English** · [Français](#comparaison-externe--le-corpus-dévaluation-de-presidio)</sub>

The away game. The internal benches (`../corpora/`) measure regressions on our corpus;
this directory scores the engine on **[Microsoft Presidio](https://github.com/data-privacy-stack/presidio-research)'s
own synthetic evaluation dataset**, and scores Presidio on the same cases through the
**same metric** (`../metric.ts`). Home-field advantage removed in both directions: the
historical internal report ran Presidio on our corpus; this runs us on theirs.

## Result — 2026-09-02

1 387 cases, 2 523 scored truths (English). Same scorer for all three columns:
≥ 60 % significant-token coverage per truth, false positives by overlap.

| category | truths | openmasq `patterns` | **openmasq `ner` (the product)** | Presidio default |
|---|---:|---:|---:|---:|
| NAME | 857 | 32 % | **98 %** | 87 % |
| ADDRESS | 598 | 26 % | **38 %** | 17 % |
| CITY | 411 | 2 % | **68 %** | 58 % |
| ORG | 250 | 5 % | **73 %** | 22 % |
| CARD | 136 | **100 %** | **100 %** | 97 % |
| PHONE | 92 | 57 % | 57 % | **63 %** |
| EMAIL | 49 | 100 % | 100 % | 100 % |
| POSTAL | 37 | 0 % | 0 % | **5 %** |
| URL | 37 | 100 % | 100 % | 100 % |
| ID | 21 | 95 % | 95 % | **100 %** |
| IBAN | 21 | 100 % | 100 % | 100 % |
| IP | 14 | 100 % | 100 % | 100 % |
| **GLOBAL** | 2 523 | 31 % · **6 FP** | **74 %** · 118 FP | 58 % · 183 FP |

340 further annotations — titles, ages, nationalities and **dates** — are outside the
product's scope and are **not scored**. They are still annotated, which is the point: a
detector that finds one is not charged a false positive for it.

## Why dates are not scored

This engine redacts a date **only in a birth context**, deliberately: a blanket date rule
destroys every timestamp a conversation carries — an appointment, a deadline, a log line.
This corpus annotates every date in every sentence as a truth, so scoring the category
measured a design decision as a defect. Until 2026-09-02 the table carried a `DATE` row
reading 14 % against Presidio's 100 %, with the explanation underneath; the row is gone
and the explanation stays.

⚠️ **Excluding is not deleting**, and the difference is the whole fairness of the
comparison. The four out-of-scope types are mapped to `CONTEXT`, which `metric.ts` keeps
out of the recall denominator and *inside* the definition of a false positive. Deleting
the spans instead would have turned every date Presidio correctly finds into an error
against it — 119 fabricated false positives, in our favour, on a number we then publish.
That single choice is worth 13 false positives on the Presidio column (183, not 196) and 5
on ours (118, not 123).

## Honest reading

- **`patterns` vs Presidio is not a product comparison** — it pits a no-model pipeline
  against a spaCy-NER engine. The product column is `ner`.
- **POSTAL / PHONE favor Presidio structurally**: US ZIP and NANP formats, outside this
  engine's FR/EU center of gravity. POSTAL at 0 % is honest and small (37 truths): a bare
  five-digit ZIP is indistinguishable from any other number without US-shaped context.
- **ADDRESS at 38 % is the real weakness**, and it is the largest category after NAME.
  A street line is recovered in pieces (the city, sometimes the number) rather than as a
  span, so a 60 %-coverage threshold often fails it. Presidio does worse (17 %), which is
  a reason to keep working on it, not a reason to be satisfied.
- **Precision has a hierarchy**: 6 FP (patterns) · 118 (ner) · 183 (Presidio). Every
  detection layer is paid for in false positives; the local NER pays less than
  Presidio's for a higher recall.
- **Synthetic-vs-synthetic caveat**: faker-built corpora are structurally friendly to
  pattern engines — treat absolute numbers as comparable *between columns*, not as
  field performance. The internal corpora (real document layouts, OCR damage,
  14 languages) are the harder test; there the same ordering holds
  (`ner` 93.5 % vs Presidio 64.3 %, same metric — see the engine history).

## Replay it

```bash
pnpm exec tsx packages/redact/bench/external/run.mts                                    # patterns
pnpm build && pnpm exec tsx packages/redact/bench/external/run.mts --ner                # the product
pnpm exec tsx packages/redact/bench/external/run.mts --detections presidio.detections.json
```

To regenerate the Presidio column from scratch (Python):
`python -m venv v && v/bin/pip install presidio-analyzer && v/bin/python -m spacy download en_core_web_lg`
then `v/bin/python run_presidio.py` from this directory.

## Provenance & pinning — what makes this citable

- **Dataset**: `synth_dataset_v2.json` from
  [data-privacy-stack/presidio-research](https://github.com/data-privacy-stack/presidio-research)
  (MIT © Microsoft Corporation), pinned at commit `78c45e58` with a sha256-verified
  fetch (`fetch.sh`). Fully synthetic (template + faker generated) — no real persons.
- **Adaptation**: `adapt-presidio-research.mjs` — InputSample → BenchCase, mapping
  documented in the file. Out of scope on both sides: TITLE, AGE, NRP and DATE_TIME — they
  are annotated `CONTEXT`, so the recall denominators drop them for every engine equally
  while a detector that finds one is still not charged a false positive. The committed
  `presidio-research.benchcase.json` is the reference input.
- **Presidio column**: `presidio.detections.json`, produced by `run_presidio.py` with
  presidio-analyzer **2.2.364**, spaCy **3.8.16**, `en_core_web_lg` **3.8.0**, default
  `AnalyzerEngine` (score threshold 0, 17 predefined recognizers). This is Presidio's
  default configuration, not its ceiling — it is a library built to receive custom
  recognizers.
- **openmasq columns**: computed live from `../../src` at whatever commit you're on —
  which is the point: the committed Presidio detections are the fixed yardstick, the
  engine columns move with the engine.

---

# Comparaison externe — le corpus d'évaluation de Presidio

Le match à l'extérieur. Les bancs internes (`../corpora/`) mesurent les régressions sur notre
corpus ; ce dossier note le moteur sur le **jeu d'évaluation synthétique de
[Microsoft Presidio](https://github.com/data-privacy-stack/presidio-research)**, et note
Presidio sur les mêmes cas avec la **même métrique** (`../metric.ts`). L'avantage du terrain
est retiré dans les deux sens : le rapport interne historique faisait tourner Presidio sur
notre corpus ; celui-ci nous fait tourner sur le sien.

## Résultat — 2026-09-02

1 387 cas, 2 523 vérités notées (anglais). Le même scoreur pour les trois colonnes :
couverture ≥ 60 % des tokens significatifs par vérité, faux positifs par chevauchement. Les
chiffres sont **dans le tableau ci-dessus** — une seconde copie traduite dériverait de la
première au prochain relevé.

340 annotations de plus — titres, âges, nationalités et **dates** — sont hors du périmètre
du produit et ne sont **pas notées**. Elles restent annotées, et c'est tout l'intérêt : un
détecteur qui en trouve une ne se voit pas compter un faux positif pour autant.

## Pourquoi les dates ne sont pas notées

Ce moteur ne masque une date **que dans un contexte de naissance**, à dessein : une règle
générale sur les dates détruirait tous les horodatages qu'une conversation transporte — un
rendez-vous, une échéance, une ligne de journal. Ce corpus annote chaque date de chaque
phrase comme une vérité : noter la catégorie revenait donc à mesurer un choix de conception
comme un défaut. Jusqu'au 2026-09-02 le tableau portait une ligne `DATE` à 14 % contre 100 %
pour Presidio, avec l'explication en dessous ; la ligne a disparu, l'explication reste.

⚠️ **Exclure n'est pas supprimer**, et la différence fait toute l'honnêteté de la
comparaison. Les quatre types hors périmètre sont annotés `CONTEXT`, que `metric.ts` sort du
dénominateur de rappel et garde *dans* la définition du faux positif. Supprimer les spans
aurait transformé chaque date que Presidio trouve correctement en erreur contre lui — 119
faux positifs fabriqués, en notre faveur, sur un chiffre que nous publions ensuite. Ce seul
choix vaut 13 faux positifs sur la colonne Presidio (183 et non 196) et 5 sur la nôtre
(118 et non 123).

## Lecture honnête

- **`patterns` contre Presidio n'est pas une comparaison de produits** — cela oppose un
  pipeline sans modèle à un moteur à NER spaCy. La colonne du produit est `ner`.
- **POSTAL et PHONE favorisent structurellement Presidio** : les formats ZIP américains et
  NANP, hors du centre de gravité FR/UE de ce moteur. POSTAL à 0 % est honnête et petit
  (37 vérités) : un code à cinq chiffres nu ne se distingue d'aucun autre nombre sans un
  contexte de forme américaine.
- **ADDRESS à 38 % est la vraie faiblesse**, et c'est la plus grosse catégorie après NAME.
  Une ligne d'adresse est récupérée par morceaux (la ville, parfois le numéro) plutôt que
  comme un span, si bien qu'un seuil de couverture à 60 % la fait souvent échouer. Presidio
  fait moins bien (17 %), ce qui est une raison d'y travailler, pas une raison de s'en
  contenter.
- **La précision a une hiérarchie** : 6 faux positifs (patterns) · 118 (ner) · 183
  (Presidio). Chaque couche de détection se paie en faux positifs ; la NER locale paie moins
  que celle de Presidio pour un rappel supérieur.
- **Réserve du synthétique contre synthétique** : les corpus bâtis avec faker sont
  structurellement aimables avec les moteurs à motifs — lisez les nombres absolus comme
  comparables *entre colonnes*, pas comme une performance de terrain. Les corpus internes
  (mises en page de vrais documents, dégât OCR, 14 langues) sont l'épreuve la plus dure ; le
  même ordre y tient (`ner` 93,5 % contre Presidio 64,3 %, même métrique — voir l'historique
  du moteur).

## Le rejouer

Les commandes sont **celles ci-dessus** ; pour régénérer la colonne Presidio de zéro il faut
un environnement Python, décrit au même endroit.

## Provenance et épinglage — ce qui rend ceci citable

- **Jeu de données** : `synth_dataset_v2.json` de
  [data-privacy-stack/presidio-research](https://github.com/data-privacy-stack/presidio-research)
  (MIT © Microsoft Corporation), épinglé au commit `78c45e58` avec une récupération vérifiée
  en sha256 (`fetch.sh`). Entièrement synthétique (gabarits + faker) — aucune personne réelle.
- **Adaptation** : `adapt-presidio-research.mjs` — InputSample → BenchCase, la correspondance
  est documentée dans le fichier. Hors périmètre des deux côtés : TITLE, AGE, NRP et
  DATE_TIME — annotés `CONTEXT`, si bien que les dénominateurs de rappel les retirent pour
  chaque moteur également, sans qu'un détecteur qui en trouve un se voie compter un faux
  positif. Le `presidio-research.benchcase.json` commité est l'entrée de référence.
- **Colonne Presidio** : `presidio.detections.json`, produit par `run_presidio.py` avec
  presidio-analyzer **2.2.364**, spaCy **3.8.16**, `en_core_web_lg` **3.8.0**, l'`AnalyzerEngine`
  par défaut (seuil de score 0, 17 reconnaisseurs prédéfinis). C'est la configuration par défaut
  de Presidio, pas son plafond — c'est une bibliothèque faite pour recevoir des reconnaisseurs
  sur mesure.
- **Colonnes openmasq** : calculées en direct depuis `../../src` au commit où vous êtes — et
  c'est le but : les détections Presidio commitées sont l'étalon fixe, les colonnes du moteur
  bougent avec le moteur.

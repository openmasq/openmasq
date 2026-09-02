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

## Cross-check: what Presidio's own notebook reports

`notebooks/4_Evaluate_Presidio_Analyzer.ipynb`, upstream, ships its executed output for
Presidio on this very file (1 500 samples, of which 1 387 carry at least one span):

```
Level: binary (PII vs O):
{'F2': 0.661, 'Precision': 0.733, 'Recall': 0.646}
```

⚠️ **65 % there and 58 % here are not the same measurement, and neither corrects the
other.** Theirs is TOKEN-level and binary — every token is PII or not, skip-words removed,
every category counted including the four this comparison leaves unscored. Ours is
VALUE-level and per category: a truth counts as found when ≥ 60 % of its significant
tokens were replaced, which is the question a redaction product actually faces (did the
value leave the machine?) rather than the question a tagger faces (was this token
labelled?). The configurations differ too — the upstream notebook tokenizes with
`en_core_web_sm`, `run_presidio.py` runs the analyzer on `en_core_web_lg`.

They are close enough to say the harness is not producing a fantasy, and far enough apart
that quoting one for the other would be dishonest. The number this repository publishes
for Presidio is the one **its own runner** produces, from committed detections anyone can
replay.

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
  (MIT, Copyright (c) Presidio contributors), pinned at commit `78c45e58` with a
  sha256-verified fetch (`fetch.sh`). Fully synthetic (template + faker generated) — no
  real persons. **Not a fork, and not a mirror**: `microsoft/presidio-research` and
  `microsoft/presidio` both HTTP-301 to `data-privacy-stack/*` — the project was
  transferred out of the microsoft organization, so this IS its own repository at its
  current home (same repo id, created 2020-01-05, `fork: false`, no parent). Verified
  again on 2026-09-02, because "the official source" is a claim with an expiry date.
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

## Recoupement : ce que rapporte le notebook de Presidio lui-même

`notebooks/4_Evaluate_Presidio_Analyzer.ipynb`, en amont, livre sa sortie exécutée pour
Presidio sur ce fichier exact (1 500 échantillons, dont 1 387 portent au moins un span) :

```
Level: binary (PII vs O):
{'F2': 0.661, 'Precision': 0.733, 'Recall': 0.646}
```

⚠️ **65 % là-bas et 58 % ici ne sont pas la même mesure, et aucune ne corrige l'autre.**
La leur est au niveau du TOKEN et binaire — chaque token est une donnée personnelle ou non,
mots vides retirés, toutes les catégories comptées, y compris les quatre que cette
comparaison ne note pas. La nôtre est au niveau de la VALEUR et par catégorie : une vérité
compte comme trouvée quand ≥ 60 % de ses tokens significatifs ont été remplacés, ce qui est
la question que pose vraiment un produit de masquage (la valeur a-t-elle quitté la machine ?)
plutôt que celle que pose un étiqueteur (ce token a-t-il été étiqueté ?). Les configurations
diffèrent aussi — le notebook amont tokenise avec `en_core_web_sm`, `run_presidio.py` fait
tourner l'analyseur sur `en_core_web_lg`.

Elles sont assez proches pour dire que le harnais ne produit pas une fantaisie, et assez
éloignées pour que citer l'une à la place de l'autre soit malhonnête. Le chiffre que ce
dépôt publie pour Presidio est celui que **son propre harnais** produit, à partir de
détections commitées que n'importe qui peut rejouer.

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
  (MIT, Copyright (c) Presidio contributors), épinglé au commit `78c45e58` avec une
  récupération vérifiée en sha256 (`fetch.sh`). Entièrement synthétique (gabarits + faker)
  — aucune personne réelle. **Ni un fork, ni un miroir** : `microsoft/presidio-research` et
  `microsoft/presidio` répondent tous deux en 301 vers `data-privacy-stack/*` — le projet a
  été transféré hors de l'organisation microsoft, et c'est donc bien son propre dépôt à son
  adresse actuelle (même identifiant, créé le 2020-01-05, `fork: false`, sans parent).
  Revérifié le 2026-09-02, parce que « la source officielle » est une affirmation
  périssable.
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

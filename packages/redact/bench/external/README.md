# External comparison — Presidio's own evaluation corpus

<sub>**English** · [Français](#comparaison-externe--le-corpus-dévaluation-de-presidio)</sub>

The away game. The internal benches (`../corpora/`) measure regressions on our corpus;
this directory scores the engine on **[Microsoft Presidio](https://github.com/data-privacy-stack/presidio-research)'s
own synthetic evaluation dataset**, and scores Presidio on the same cases through the
**same metric** (`../metric.ts`). Home-field advantage removed in both directions: the
historical internal report ran Presidio on our corpus; this runs us on theirs.

## Result — 2026-08-31

1 325 cases, 2 642 annotated truths (English). Same scorer for all three columns:
≥ 60 % significant-token coverage per truth, false positives by overlap.

| category | truths | openmasq `patterns` | **openmasq `ner` (the product)** | Presidio default |
|---|---:|---:|---:|---:|
| NAME | 857 | 32 % | **98 %** | 87 % |
| ADDRESS | 598 | 26 % | **38 %** | 17 % |
| CITY | 411 | 2 % | **68 %** | 58 % |
| ORG | 250 | 5 % | **73 %** | 22 % |
| CARD | 136 | **100 %** | **100 %** | 97 % |
| DATE | 119 | 14 % | 14 % | **100 %** |
| PHONE | 92 | 57 % | 57 % | **63 %** |
| EMAIL | 49 | 100 % | 100 % | 100 % |
| POSTAL | 37 | 0 % | 0 % | **5 %** |
| URL | 37 | 100 % | 100 % | 100 % |
| ID | 21 | 95 % | 95 % | **100 %** |
| IBAN | 21 | 100 % | 100 % | 100 % |
| IP | 14 | 100 % | 100 % | 100 % |
| **GLOBAL** | 2 642 | 30 % · **6 FP** | **71 %** · 123 FP | 60 % · 196 FP |

## Honest reading

- **`patterns` vs Presidio is not a product comparison** — it pits a no-model pipeline
  against a spaCy-NER engine. The product column is `ner`.
- **DATE 100 vs 14 is a design choice, not a defect**: the engine only redacts a date in
  a *birth* context — a blanket date rule would destroy every timestamp a chat carries.
  This corpus annotates every date as truth; all 17 birth-context dates are caught, the
  102 generic ones are left in clear on purpose. Excluding DATE (as TITLE/AGE/NRP
  already are, on both sides) the global gap reads 74 % vs 58 %.
- **POSTAL / PHONE favor Presidio structurally**: US ZIP and NANP formats, outside this
  engine's FR/EU center of gravity.
- **Precision has a hierarchy**: 6 FP (patterns) · 123 (ner) · 196 (Presidio). Every
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
  documented in the file. Excluded on both sides: TITLE, AGE, NRP (out of the product's
  scope; the recall denominators drop them for every engine equally). The committed
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

## Résultat — 2026-08-31

1 325 cas, 2 642 vérités annotées (anglais). Le même scoreur pour les trois colonnes :
couverture ≥ 60 % des tokens significatifs par vérité, faux positifs par chevauchement. Les
chiffres sont **dans le tableau ci-dessus** — une seconde copie traduite dériverait de la
première au prochain relevé.

## Lecture honnête

- **`patterns` contre Presidio n'est pas une comparaison de produits** — cela oppose un
  pipeline sans modèle à un moteur à NER spaCy. La colonne du produit est `ner`.
- **DATE à 100 contre 14 est un choix de conception, pas un défaut** : le moteur ne masque une
  date que dans un contexte de *naissance* — une règle générale sur les dates détruirait tous
  les horodatages qu'une conversation transporte. Ce corpus annote chaque date comme une
  vérité ; les 17 dates en contexte de naissance sont toutes prises, les 102 génériques sont
  laissées en clair à dessein. En excluant DATE (comme TITLE/AGE/NRP le sont déjà, des deux
  côtés) l'écart global se lit 74 % contre 58 %.
- **POSTAL et PHONE favorisent structurellement Presidio** : les formats ZIP américains et
  NANP, hors du centre de gravité FR/UE de ce moteur.
- **La précision a une hiérarchie** : 6 faux positifs (patterns) · 123 (ner) · 196 (Presidio).
  Chaque couche de détection se paie en faux positifs ; la NER locale paie moins que celle de
  Presidio pour un rappel supérieur.
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
  est documentée dans le fichier. Exclus des deux côtés : TITLE, AGE, NRP (hors de la portée du
  produit ; les dénominateurs de rappel les retirent pour chaque moteur également). Le
  `presidio-research.benchcase.json` commité est l'entrée de référence.
- **Colonne Presidio** : `presidio.detections.json`, produit par `run_presidio.py` avec
  presidio-analyzer **2.2.364**, spaCy **3.8.16**, `en_core_web_lg` **3.8.0**, l'`AnalyzerEngine`
  par défaut (seuil de score 0, 17 reconnaisseurs prédéfinis). C'est la configuration par défaut
  de Presidio, pas son plafond — c'est une bibliothèque faite pour recevoir des reconnaisseurs
  sur mesure.
- **Colonnes openmasq** : calculées en direct depuis `../../src` au commit où vous êtes — et
  c'est le but : les détections Presidio commitées sont l'étalon fixe, les colonnes du moteur
  bougent avec le moteur.

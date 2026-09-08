# `@openmasq/redact` — the detection benches

<sub>**English** · [Français](#openmasqredact--bancs-de-détection) · [openmasq.com](https://openmasq.com)</sub>

Reproducible recall benches of the redaction engine, on versioned annotated corpora so the
numbers stay comparable from one change to the next.

- **Corpora** (`corpora/*.json`) — 18 corpora, 907 cases, ~3,400 annotated truths, 14
  languages. `{ id, lang, text, truth: [[value, category], …] }`. **Entirely synthetic**:
  generated, invented people, identifiers recomputed valid (checksums), full
  pseudonymisation re-verified on 2026-08-31.
- **Scorer** (`metric.ts`) — ≥ 60 % coverage of a truth's significant tokens, false
  positives by overlap; `RECALL_EXEMPT` documents what the floors do not measure.
- **Floors** (`../src/*.recall.test.ts`) — one test per document family, failing when the
  measured recall drops below the frozen floor. DETERMINISTIC pipeline (`pseudonymize`
  with no model): what is counted is the vault's values.
- **Real scans** (`../src/__cases__/scans.recall.test.ts`) — the only bench that PRODUCES the
  OCR damage (vendored Tesseract) instead of simulating it; truths annotated from the pixels
  of both fixtures (fictional identities).

```bash
pnpm test:corpus    # ~1 min; OCR and the local NER need `pnpm build` first
```

## The comparison — `pnpm bench:compare`

The same corpora, scored side by side with **Presidio's default `AnalyzerEngine`**, through
the same `metric.ts`. Measured 2026-09-07, 907 scorable cases (`tokensVsFakes.json` is a
different kind of bench and has no `truth`), 3 357 scored truths:

| | recall | false positives |
|---|---:|---:|
| `patterns` — the deterministic pipeline alone | 89 % | 91 |
| **`ner` — the product** (deterministic + local NER) | **95 %** | 258 |
| Presidio, default install | 46 % | 847 |
| Perplexity PII-Tracer (`pplx-pii-masking`, MIT, 0.6B) | 92 % | 530 |

`pnpm bench:compare --corpus internal --markdown` prints the two tables below; the away game
on Presidio's own corpus (its own evaluation set, English, template + faker) is `external/`:

| | truths | `patterns` | **`ner`** (the product) | Presidio (default) |
|---|---:|---:|---:|---:|
| **our corpus** | 3 357 | 89 % · 91 FP | **95 %** · 258 FP | 46 % · 847 FP |
| **Presidio's corpus** | 2 523 | 31 % · 6 FP | **74 %** · 115 FP | 58 % · 196 FP |

⚠️ **This bench measures the ENGINE, at its `bare` policy — every category on.** It is the
regression floor, comparable to every figure this package ever published, and it is NOT the
app's default level: a shipped app leaves `date` and `url` off (opt-in) and cannot turn
`health` on at all (retired). So `HEALTH` at 100 % below says the detector works, not that
your medical data is redacted — it is not. What the PRODUCT does, level by level, is
`spans/`, which measures the app's own policies.

**Our corpus, by category** — 907 cases:

| category | truths | `patterns` | **`ner`** (the product) | Presidio (default) |
|---|---:|---:|---:|---:|
| NAME | 663 | 78 % | 94 % | 58 % |
| EMAIL | 247 | 99 % | 99 % | 98 % |
| CITY | 243 | 53 % | 87 % | 23 % |
| CARD | 233 | 100 % | 100 % | 65 % |
| ADDRESS | 232 | 98 % | 100 % | 15 % |
| ID | 215 | 93 % | 93 % | 45 % |
| COMPANY_ID | 206 | 100 % | 100 % | 24 % |
| HEALTH | 205 | 100 % | 100 % | 66 % |
| USERNAME | 203 | 100 % | 100 % | 4 % |
| TOKEN | 201 | 100 % | 100 % | 7 % |
| PHONE | 156 | 95 % | 95 % | 94 % |
| POSTAL | 101 | 88 % | 88 % | 17 % |
| DOB | 90 | 89 % | 89 % | 77 % |
| ORG | 71 | 61 % | 85 % | 30 % |
| IBAN | 54 | 100 % | 100 % | 83 % |
| AMOUNT | 30 | 3 % | 3 % | 17 % |
| IP | 29 | 100 % | 100 % | 100 % |
| PLACE | 28 | 93 % | 96 % | 4 % |
| DATE | 28 | 100 % | 100 % | 79 % |
| PATH | 28 | 93 % | 93 % | 0 % |
| COMPANY | 25 | 92 % | 92 % | 8 % |
| SECRET | 23 | 91 % | 91 % | 13 % |
| URL | 23 | 91 % | 91 % | 96 % |
| BIC | 23 | 74 % | 74 % | 4 % |
| **GLOBAL** | 3357 | **89 %** · 91 FP | **95 %** · 258 FP | **46 %** · 847 FP |

**Our corpus, by language** — the local model is what carries the languages a rule cannot
segment:

| language | cases | `patterns` | **`ner`** (the product) | Presidio (default) |
|---|---:|---:|---:|---:|
| fr | 468 | 87 % | 94 % | 50 % |
| en | 215 | 92 % | 96 % | 41 % |
| de | 47 | 98 % | 99 % | 46 % |
| es | 32 | 97 % | 99 % | 52 % |
| it | 29 | 97 % | 99 % | 59 % |
| pt | 30 | 97 % | 98 % | 40 % |
| nl | 24 | 99 % | 100 % | 38 % |
| zh | 17 | 26 % | 66 % | 6 % |
| pl | 10 | 100 % | 100 % | 75 % |
| ja | 12 | 24 % | 76 % | 16 % |
| ko | 11 | 24 % | 88 % | 16 % |
| sv | 6 | 100 % | 100 % | 35 % |
| da | 5 | 100 % | 100 % | 47 % |
| ru | 1 | 0 % | 100 % | 0 % |

**Presidio's corpus, by category** — 1 387 cases, the away game:

| category | truths | `patterns` | **`ner`** (the product) | Presidio (default) |
|---|---:|---:|---:|---:|
| NAME | 857 | 32 % | 98 % | 87 % |
| ADDRESS | 598 | 28 % | 40 % | 17 % |
| CITY | 411 | 2 % | 68 % | 58 % |
| ORG | 250 | 5 % | 73 % | 22 % |
| CARD | 136 | 100 % | 100 % | 97 % |
| PHONE | 92 | 57 % | 57 % | 63 % |
| EMAIL | 49 | 100 % | 100 % | 100 % |
| POSTAL | 37 | 0 % | 0 % | 5 % |
| URL | 37 | 100 % | 100 % | 100 % |
| ID | 21 | 100 % | 100 % | 100 % |
| IBAN | 21 | 100 % | 100 % | 100 % |
| IP | 14 | 100 % | 100 % | 100 % |
| **GLOBAL** | 2523 | **31 %** · 6 FP | **74 %** · 115 FP | **58 %** · 196 FP |

**Reading them.** A single percentage hides which of your data is protected, and the answer
is not uniform:

- **Structured values are solved** — cards, IBANs, e-mails, URLs, IPs sit at or near 100 %
  with no model at all, because a checksum or a shape is a proof rather than a guess.
- **Names are the strong case** (94 % at home, 98 % away), and they are what a chat leaks most.
- **Addresses are the honest weakness.** 100 % on our documents, **40 %** on Presidio's
  corpus, whose truths are multi-line US street addresses recovered in pieces — the city,
  sometimes the number — rather than as one span. Presidio does worse there (17 %); that is a
  reason to keep working, not a reason to be satisfied.
- **The two corpora disagree about Presidio, and the disagreement is the finding.** 87 % on
  names in its own template sentences, 58 % on names in real documents; 46 % overall at home,
  and **41 % on our English cases** — so the gap is not the language. A default install is
  tuned for the sentences it was evaluated on; ours was tuned for the documents people paste.
- **CJK needs the model.** Rules alone reach 24–26 % on Chinese, Japanese and Korean; the
  local NER lifts them to 66–88 %. A name with no word boundaries is not a shape.
- **`AMOUNT` at 3 % is a decision, not a miss** — the category was retired (an amount is not
  an identity), and the corpus keeps annotating it so the measure stays honest.
- **Recall is paid for in false positives**, and the hierarchy is visible on both corpora:
  91 · 258 · 847 at home, 6 · 115 · 196 away.
- **Synthetic against synthetic.** Presidio's corpus is faker-built and structurally kind to
  pattern engines; ours carries real layouts and OCR noise. Compare columns to each other,
  not to field performance.

- `compare.mts` is the ONE runner for both corpora and all three engines. It reuses
  `scoreCorpus` / `coversTruth` from `metric.ts` — no second scorer, no second table format.
- `presidio.detections.json` is Presidio's column as a **committed artifact** — `{ caseId:
  [detected values] }` — so the comparison replays with `pnpm` alone. `presidio.py internal`
  regenerates it (Python 3.12, presidio-analyzer 2.2.364, spaCy 3.8.16, `en_core_web_lg`
  3.8.0: the pinned versions the file was produced with). It is NOT under `corpora/` on
  purpose: that folder is loaded as corpora.
- Presidio runs with `language="en"` on all fourteen languages, because that is what a
  default install does. It is the comparison a user faces out of the box, not Presidio's
  ceiling — and its 41 % on our **English** cases says the gap is real layouts, not the
  language.
- `AMOUNT` (30 truths) is a category retired by product decision and scores 3 % for that
  reason; it stays annotated so the measure cannot flatter itself.

- **PII-Tracer** (measured 2026-09-06, same corpus, same metric): `pplx.py internal` runs
  `perplexity-ai/pplx-pii-masking` — a bidirectional Qwen3 encoder with a BIOES head over 9 PII
  types — through its own `predict(text)`, no threshold of ours, texts over its 4 096-token window
  split on lines; it writes `pplx.detections.json` (the column), `pplx.labels.json` (label and
  score per span) and `pplx.timing.json`. `pnpm bench:compare --corpus internal --extra
  pplx=packages/redact/bench/pplx.detections.json` adds the column. It beats the product on
  free-text names (97 % vs 94 %), BIC, postal codes and CJK; it loses on health data (67 %),
  organisations (44 %), places, file paths and company names, and pays 530 false positives —
  mostly ordinary dates and words it reads as names. Its document-sensitivity head, the gate
  Perplexity uses to decide what may leave the device, scores 896 of the 907 cases below 0.5.
  Latency on an M1, bf16 on MPS: median 148 ms per case, p90 298 ms; the product's local NER
  path (q8, CPU) is 50 ms and 173 ms, the rules alone 6 ms and 26 ms.

- **`spans/` — the public benchmarks, at character level.** The PII-TRACE protocol (character
  and span F1, consistency of recurring identifiers, by length, language and label) on
  ai4privacy, Nemotron-PII, Gretel and TAB, plus this corpus re-expressed in offsets; the
  product measured at its default level and at Strict, PII-Tracer beside it. `pnpm bench:spans
  --replay --markdown` rebuilds that page from the committed `results/`; its README says how
  each number is built and where it disagrees with the figures Perplexity publishes.
- `engines.ts` is the ONE loader both benches share, with the policy each one uses stated
  in its header: bare here (every figure above), the app's levels in `spans/`.

CI: `.github/workflows/corpus.yml` — a nightly pass plus manual dispatch; the benches
MEASURE, they gate no deployment.

---

# `@openmasq/redact` — bancs de détection

Bancs de rappel reproductibles du moteur de redaction, corpus annotés versionnés pour
que les chiffres restent comparables d'un changement à l'autre.

- **Corpus** (`corpora/*.json`) — 18 corpus, 907 cas, ~3 400 vérités annotées, 14
  langues. `{ id, lang, text, truth: [[valeur, catégorie], …] }`. **Entièrement
  synthétiques** : générés, personnes inventées, identifiants recalculés valides
  (checksums), pseudonymisation intégrale revalidée le 2026-08-31.
- **Scoreur** (`metric.ts`) — couverture ≥ 60 % des tokens significatifs d'une vérité,
  faux positifs par chevauchement ; `RECALL_EXEMPT` documente ce que les planchers ne
  mesurent pas.
- **Planchers** (`../src/*.recall.test.ts`) — un test par famille de documents, qui
  échoue si le rappel mesuré passe sous le plancher gelé. Pipeline DÉTERMINISTE
  (`pseudonymize` sans modèle) : ce qui est compté, ce sont les valeurs du coffre.
- **Scans réels** (`../src/__cases__/scans.recall.test.ts`) — le seul banc qui PRODUIT le dégât
  OCR (Tesseract vendoré) au lieu de le simuler ; vérités annotées depuis les pixels
  des deux fixtures (identités fictives).

```bash
pnpm test:corpus    # ~1 min ; l'OCR et le NER local exigent `pnpm build` au préalable
```

## La comparaison — `pnpm bench:compare`

Les mêmes corpus, notés côte à côte avec **l'`AnalyzerEngine` par défaut de Presidio**, par
le même `metric.ts`. Mesuré le 2026-09-07, 907 cas notables (`tokensVsFakes.json` est un
banc d'une autre nature, sans `truth`), 3 357 vérités notées :

| | rappel | faux positifs |
|---|---:|---:|
| `patterns` — le pipeline déterministe seul | 89 % | 91 |
| **`ner` — le produit** (déterministe + NER locale) | **95 %** | 258 |
| Presidio, installation par défaut | 46 % | 847 |
| Perplexity PII-Tracer (`pplx-pii-masking`, MIT, 0,6 Md) | 92 % | 530 |

Par catégorie et par langue : `pnpm bench:compare --corpus internal --markdown` imprime les
tableaux qui figurent **dans la moitié anglaise ci-dessus** — ils sortent de la commande, et
une seconde copie traduite dériverait de la première au prochain relevé. Le match à
l'extérieur, sur le corpus de Presidio, est dans `external/`.

⚠️ **Ce banc mesure le MOTEUR, en politique `bare` — toutes catégories allumées.** C'est le
plancher de non-régression, comparable à tous les chiffres jamais publiés par ce paquet, et
ce n'est PAS le niveau par défaut de l'app : une app livrée laisse `date` et `url` éteintes
(sur demande) et ne peut plus allumer `health` du tout (retirée). Le `HEALTH` à 100 % du
tableau dit donc que le détecteur fonctionne, pas que vos données médicales sont masquées —
elles ne le sont pas. Ce que fait le PRODUIT, niveau par niveau, c'est `spans/`, qui mesure
les politiques de l'app elle-même.

- `compare.mts` est LE harnais unique des deux corpus et des trois moteurs. Il réutilise
  `scoreCorpus` / `coversTruth` de `metric.ts` — pas de second scoreur, pas de second format.
- `presidio.detections.json` est la colonne Presidio en **artefact commité** — `{ idDeCas :
  [valeurs détectées] }` — pour que la comparaison se rejoue avec `pnpm` seul.
  `presidio.py internal` la régénère (Python 3.12, presidio-analyzer 2.2.364, spaCy 3.8.16,
  `en_core_web_lg` 3.8.0 : les versions épinglées avec lesquelles le fichier a été produit).
  Il n'est PAS sous `corpora/` à dessein : ce dossier est chargé comme corpus.
- Presidio tourne avec `language="en"` sur les quatorze langues, parce que c'est ce qu'une
  installation par défaut fait. C'est la comparaison qu'un utilisateur affronte en sortie de
  boîte, pas le plafond de Presidio — et ses 41 % sur nos cas en **anglais** disent que
  l'écart tient aux vraies mises en page, pas à la langue.
- `AMOUNT` (30 vérités) est une catégorie retirée par décision produit et note 3 % pour cette
  raison ; elle reste annotée pour que la mesure ne puisse pas se flatter.

- **`spans/` — les bancs publics, au caractère près.** Le protocole PII-TRACE (F1 caractère et
  span, constance des identifiants récurrents, par longueur, langue et étiquette) sur
  ai4privacy, Nemotron-PII, Gretel et TAB, plus ce corpus ré-exprimé en offsets ; le produit
  mesuré à son niveau par défaut et en Strict, PII-Tracer à côté. `pnpm bench:spans --replay
  --markdown` reconstruit cette page depuis les `results/` commités ; son README dit comment
  chaque chiffre est construit et où il diverge de ceux que Perplexity publie.
- `engines.ts` est LE chargeur que les deux bancs partagent, la politique de chacun écrite
  dans son en-tête : moteur nu ici (tous les chiffres ci-dessus), les niveaux de l'app dans `spans/`.

CI : `.github/workflows/corpus.yml` — passe nocturne + déclenchement manuel ; les bancs
MESURENT, ils ne gardent aucun déploiement.

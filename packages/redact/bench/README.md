# `@openmasq/redact` — the detection benches

<sub>**English** · [Français](#openmasqredact--bancs-de-détection)</sub>

Reproducible recall benches of the redaction engine, on versioned annotated corpora so the
numbers stay comparable from one change to the next.

- **Corpora** (`corpora/*.json`) — 18 corpora, 916 cases, ~3,400 annotated truths, 14
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

CI: `.github/workflows/corpus.yml` — a nightly pass plus manual dispatch; the benches
MEASURE, they gate no deployment.

---

# `@openmasq/redact` — bancs de détection

Bancs de rappel reproductibles du moteur de redaction, corpus annotés versionnés pour
que les chiffres restent comparables d'un changement à l'autre.

- **Corpus** (`corpora/*.json`) — 18 corpus, 916 cas, ~3 400 vérités annotées, 14
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

CI : `.github/workflows/corpus.yml` — passe nocturne + déclenchement manuel ; les bancs
MESURENT, ils ne gardent aucun déploiement.

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

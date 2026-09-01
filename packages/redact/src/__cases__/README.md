# The regression corpus — one file per document family or scenario

These are not unit tests of a module (those stay next to their module: `../index.test.ts`,
`../util.test.ts`, `../documents*.test.ts`…). Each file here replays a **document family**
or a **scenario** that once leaked, over-redacted or corrupted output, and pins what the
engine must do with it. Fixtures live in `../__fixtures__/` (see its README), the corpora of
the recall benches in `../../bench/corpora/`.

Two kinds, never mixed: a **unit case** runs in `pnpm test` (free, seconds); a **recall bench**
(`*.recall.test.ts`, `benchReplay`, `benchFixes`) measures recall/precision on a corpus and
runs in `pnpm test:corpus` — `scripts/vitest/vitest.workspaceAlias.ts` (`CORPUS_TESTS`) is the one
list that decides which is which.

Adding a case: name it after the document family in English, say in its header what it
pins, and add a row here.

| Case | Kind | What it pins |
|---|---|---|
| `addresses.test.ts` | unit case (`pnpm test`) | detectAddresses — trailing-tail normalisation |
| `administrative.recall.test.ts` | recall bench (`pnpm test:corpus`) | administrative-document recall (full deterministic pipeline) |
| `bankStatement.test.ts` | unit case (`pnpm test`) | relevé bancaire — dates et vocabulaire intacts, PII toujours redacted |
| `benchFixes.test.ts` | recall bench (`pnpm test:corpus`) | champ de compte en PROSE — « mon pseudo est … » |
| `benchReplay.test.ts` | recall bench (`pnpm test:corpus`) | rejeu du bench manuel du 27/07/2026 — contre le chemin d'ENVOI |
| `codeSecrets.test.ts` | unit case (`pnpm test`) | code-oriented secret rules |
| `employmentLetter.test.ts` | unit case (`pnpm test`) | lettre Pôle emploi — la protection tient, le reste reste lisible |
| `enrolmentLetter.test.ts` | unit case (`pnpm test`) | courrier d'inscription — the public sender ships in clear, the member is protected |
| `envConfig.test.ts` | unit case (`pnpm test`) | env / config assignment values |
| `files.test.ts` | unit case (`pnpm test`) | redaction across file types (extracted text) |
| `frenchDocuments.recall.test.ts` | recall bench (`pnpm test:corpus`) | real-world document recall (full deterministic pipeline) |
| `geoStreetFake.test.ts` | unit case (`pnpm test`) | faux géographique — la forme suit la valeur |
| `health.recall.test.ts` | recall bench (`pnpm test:corpus`) | medical-document recall + precision (deterministic pipeline, 6 languages) |
| `incomeStatement.test.ts` | unit case (`pnpm test`) | compte de résultat — the header pair is redacted, the statement is not |
| `labelledNeighbour.test.ts` | unit case (`pnpm test`) | FUITE — la valeur voisine d'un champ NOM (16/08/2026) |
| `layouts.recall.test.ts` | recall bench (`pnpm test:corpus`) | complex-layout recall (full deterministic pipeline) |
| `legal.recall.test.ts` | recall bench (`pnpm test:corpus`) | complex-legal recall (full deterministic pipeline) |
| `newRules.test.ts` | unit case (`pnpm test`) | ⚠️ `url` OFF = THE PRODUCT DEFAULT (`CATEGORY_DEFAULTS`), and that's what this test models: what happens INSIDE a URL we don't mask. The bare engine itself has… |
| `notarialDeed.test.ts` | unit case (`pnpm test`) | acte notarié (promesse d'achat) — identifying values are redacted |
| `paths.test.ts` | unit case (`pnpm test`) | path category |
| `placeAliases.test.ts` | unit case (`pnpm test`) | place composite — la ville seule doit revenir |
| `rareCategories.recall.test.ts` | recall bench (`pnpm test:corpus`) | rare-category recall (full deterministic pipeline) |
| `redactQuality.test.ts` | unit case (`pnpm test`) | Regression suite for the payslip-PDF redaction quality bug: a table-heavy PDF whose extraction glues cells together made the local NER + the api_token rule emit… |
| `royaltyStatement.test.ts` | unit case (`pnpm test`) | relevé de répartition (two-column statement) — nothing identifying survives |
| `sacemStatement.test.ts` | unit case (`pnpm test`) | relevé Sacem — les libellés du document ne sont pas des identités |
| `scans.recall.test.ts` | recall bench (`pnpm test:corpus`) | scans réels — OCR véritable, pipeline complet, vérités depuis les pixels |
| `school.recall.test.ts` | recall bench (`pnpm test:corpus`) | school & career recall + precision (deterministic pipeline, 6 languages) |
| `supplierInvoice.test.ts` | unit case (`pnpm test`) | pied de facture fournisseur — marques, pays et dates restent intacts |
| `suretyDeed.test.ts` | unit case (`pnpm test`) | acte de cautionnement — nothing identifying survives |
| `teamRoster.test.ts` | unit case (`pnpm test`) | team roster — the list audit, end to end |
| `technical.recall.test.ts` | recall bench (`pnpm test:corpus`) | `commercialNotoriety: true` = the bench models a NON-Strict level (the app's setting outside Strict): since 30/07/2026, GitHub/Stripe/Cloudflare — brands that are… |
| `thinCategories.recall.test.ts` | recall bench (`pnpm test:corpus`) | thin-category recall (full deterministic pipeline) |
| `toolMetadata.test.ts` | unit case (`pnpm test`) | A canned model detector: returns the given findings JSON verbatim. A realistic MCP "info <tool>" result (the PostHog shape that triggered the reported overredaction):… |
| `urlCredentials.test.ts` | unit case (`pnpm test`) | Audit H-3: the `url`-off gate used to drop EVERY match inside a URL span, including secrets/api keys — so a credential embedded in a query string (`?token=sk_live_…`,… |

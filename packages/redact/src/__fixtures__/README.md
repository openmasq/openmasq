# PII fixtures (all data is FAKE)

Synthetic files with realistic-but-invented personal data — names, emails,
phones, postal addresses, IBANs, payment cards, national IDs/SSN, IPs and API
keys — for exercising the redaction (redaction) pipeline by hand or in e2e.

> ⚠️ Nothing here is real. Names, accounts, cards and keys are fabricated and
> use reserved/example values (`example.com`, RFC-5737 IPs like `10.0.0.42`,
> sample card numbers). Safe to commit.

**The rule is the repository's, not this folder's.** Unit tests carry inline PII too —
a name in an assertion, a path, an e-mail — and it is invented there for the same reason
it is invented here. Enforced by `pnpm check:pii`, which fails on a known real identity
reappearing anywhere in the tree; its list is stored as digests, so neither the gate nor
a CI log can restate the value it protects.

**Substituting a value is not a rename — keep the SHAPE.** What most tests exercise is
the form, not the person, so a replacement has to match the original on whatever the
assertion actually rests on. In practice: the same length (an OCR-noise pair like
`SABOVRDIN`/`SABOURDIN` is one substituted character), the same membership in
`engine/names/firstNames.data.ts` (the gazetteer fires on a first-name + surname PAIR),
the same answer from `isGenericTerm` / `isStopword` / `isCountry` (several tests assert
`false` on those), and the same **initial sound** — `engine/elision.test.ts` pins
`d'X → de X`, which inverts entirely if a consonant-initial value becomes vowel-initial.
Check a candidate against those functions before adopting it, not after.

## Files & whether the app extracts them today

The desktop app extracts text in `apps/desktop/src/main/files.ts`, then redacts
it. Verified end-to-end with `node apps/desktop/e2e/fixtures/verify.mjs`.

| File | Type | Extracted by app? | Notes |
|------|------|-------------------|-------|
| `customers.csv` | CSV | ✅ | 10 customers, every PII column |
| `contacts.tsv` | TSV | ✅ | tab-separated, SSH fingerprints |
| `employees.json` | JSON | ✅ | nested objects, JWT/AWS/GitHub creds |
| `team-roster.md` | Markdown | ✅ | prose + pipe table + emergency contacts |
| `support-tickets.log` | Log | ✅ | server logs with tokens/IPs/PAN |
| `onboarding-notes.txt` | Text | ✅ | free-form prose |
| `royalty-statement.txt` | Text | ✅ | two-column royalties statement: SIREN before/after RCS, checksum-broken (OCR) SIRET/TVA, labeled ids vs the column gap, letterhead address. Pinned by `src/__cases__/royaltyStatement.test.ts` |
| `purchase-promise-deed.txt` | Text | ✅ | OCR'd notarial deed: "VILLE (CP)" civil-status order (garbled/wrapped/open-paren), glued birth dates, CRPCEN, 3-token names + short-form identity, all-caps legal vocables, in-text fake collision. Pinned by `src/__cases__/notarialDeed.test.ts` |
| `surety-deed.txt` | Text | ✅ | caution act (CAMCA shape): labeled financing reference repeated in per-page footers, contract number embedding it, LU footer registry ids (VAT/RCS Luxembourg/IDU), prose-gated ORIAS, "Agence de :" branch, double-labeled DPO email, legal role nouns + institutions that must stay clear. Pinned by `src/__cases__/suretyDeed.test.ts` |
| `income-statement.txt` | Text | ✅ | financial statement: label-less "denomination ⏎ bare SIREN/SIRET" header pair (Luhn-invalid OCR digits), generic accounting vocabulary that must ship verbatim. Pinned by `src/__cases__/incomeStatement.test.ts` |
| `enrolment-letter.txt` | Text | ✅ | enrollment letter: org name in prose AND glued in URL hosts (fakes must stay glued → valid URLs), 11-digit numéro France Travail, legal-article + schedule-prose address FPs. Pinned by `src/__cases__/enrolmentLetter.test.ts` |
| `payroll.xlsx` | Excel | ✅ | 3 sheets (Employees / Payroll / Cards) |
| `invoice-2024-0042.pdf` | PDF | ✅ | full invoice; Quartz-rendered text |
| `nda-contract.docx` | Word | ✅ | extracted via mammoth |
| `business-card.png` | Image | ❌ not yet | no OCR |
| `scanned-id.jpg` | Image | ❌ not yet | no OCR (simulated scan) |

The images are included on purpose: OCR is the natural next step to support
them, and they're useful as manual drag-and-drop test material in the meantime.

## Regenerating

- `payroll.xlsx` → `node apps/desktop/e2e/fixtures/generate-xlsx.mjs`
- PDF / docx / images were produced with `cupsfilter`, `textutil` and
  ImageMagick respectively (macOS). See the chat history / commit for commands.

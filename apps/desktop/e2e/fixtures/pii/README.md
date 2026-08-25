# PII fixtures (all data is FAKE)

Synthetic files with realistic-but-invented personal data — names, emails,
phones, postal addresses, IBANs, payment cards, national IDs/SSN, IPs and API
keys — for exercising the redaction (redaction) pipeline by hand or in e2e.

> ⚠️ Nothing here is real. Names, accounts, cards and keys are fabricated and
> use reserved/example values (`example.com`, RFC-5737 IPs like `10.0.0.42`,
> sample card numbers). Safe to commit.

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

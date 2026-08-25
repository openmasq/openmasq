// Regenerate pii/payroll.xlsx — a multi-sheet workbook of (fake) personal data
// for exercising the redaction pipeline. Run: `node apps/desktop/e2e/fixtures/generate-xlsx.mjs`
import * as XLSX from "xlsx";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const wb = XLSX.utils.book_new();

const employees = [
  ["Employee ID", "Full Name", "Email", "Phone", "Date of Birth", "Home Address", "National ID", "IP"],
  ["EMP-001", "Amélie Brivet", "amelie.brivet@example.com", "+33 6 12 34 56 78", "1989-04-12", "14 rue de Rivoli, 75004 Paris", "1 89 04 75 231 004 24", "10.10.4.21"],
  ["EMP-002", "Marcus Foy", "marcus.foy@acme.io", "+1 (415) 555-0142", "1975-11-03", "1200 Market St, San Francisco CA 94103", "123-45-6789", "10.10.4.22"],
  ["EMP-003", "Priya Naik", "priya.naik@globex.co.uk", "+44 20 7946 0958", "1992-07-21", "221B Baker Street, London NW1 6XE", "QQ 12 34 56 C", "10.10.4.23"],
  ["EMP-004", "Hiroshi Nomura", "h.nomura@nippon-mail.jp", "+81 3-1234-5678", "1968-01-30", "2-7-1 Marunouchi, Tokyo 100-0005", "-", "10.10.4.24"],
];
const payroll = [
  ["Employee ID", "Name", "IBAN", "Gross EUR", "Net EUR", "Bonus EUR", "Tax ID"],
  ["EMP-001", "Amélie Brivet", "FR76 3000 6000 0112 3456 7890 189", 78000, 58240, 8000, "FR 89 04 75 116"],
  ["EMP-002", "Marcus Foy", "US ACCT 1234567890 / RTG 021000021", 96500, 69120, 12000, "123-45-6789"],
  ["EMP-003", "Priya Naik", "GB29 NWBK 6016 1331 9268 19", 71000, 52300, 6000, "QQ123456C"],
  ["EMP-004", "Hiroshi Nomura", "JP 0001-234-5678901", 83000, 61420, 7000, "-"],
];
const cards = [
  ["Holder", "Card Number", "Expiry", "CVV", "Billing Email"],
  ["Amélie Brivet", "4716 6337 1042 9833", "11/27", "412", "amelie.brivet@example.com"],
  ["Marcus Foy", "5500 0055 5555 5559", "03/26", "908", "marcus.foy@acme.io"],
  ["Sofia Ferretti", "4716 1234 5678 9012", "07/28", "221", "sofia.romano@ferretti-srl.it"],
];

XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(employees), "Employees");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(payroll), "Payroll");
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cards), "Corporate Cards");

const out = resolve(here, "pii/payroll.xlsx");
XLSX.writeFile(wb, out);
console.log("wrote", out, "(3 sheets)");

import type { Detection } from "../types";

/**
 * A long US litigation document, generated: what a lawyer pastes (a pleading, a contract
 * exhibit) — names, places, firms, e-mails, phone numbers, amounts and account numbers on
 * every paragraph, plus the per-occurrence detections an offline NER returns for it.
 * Deterministic (fixed seed), so a timing or a comparison is the same run everywhere.
 */
const FIRST = ["John", "Mary", "Robert", "Patricia", "Michael", "Jennifer", "William", "Linda", "David", "Elizabeth", "Richard", "Barbara", "Joseph", "Susan", "Thomas", "Jessica", "Charles", "Sarah", "Daniel", "Karen"];
const LAST = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Wilson", "Anderson", "Taylor", "Moore", "Jackson", "Martin", "Thompson", "White", "Harris", "Clark", "Lewis", "Robinson"];
const CITY = ["Springfield", "Riverside", "Fairview", "Madison", "Georgetown", "Arlington", "Ashland", "Dover", "Oxford", "Clinton"];
const ORG = ["Acme Holdings LLC", "Blue Harbor Capital", "Northwind Partners", "Granite Peak Insurance", "Silverline Logistics"];

export function longPasteDoc(chars: number, seed = 1): { text: string; detections: Detection[] } {
  let s = seed;
  const r = (n: number) => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s % n;
  };
  const detections: Detection[] = [];
  let text = "";
  for (let i = 0; text.length < chars; i++) {
    const name = `${FIRST[r(FIRST.length)]} ${LAST[r(LAST.length)]}`;
    const city = CITY[r(CITY.length)] as string;
    const org = ORG[r(ORG.length)] as string;
    const email = `${name.toLowerCase().replace(" ", ".")}${i}@lawfirm${r(50)}.com`;
    const phone = `(${200 + r(700)}) 555-${1000 + r(9000)}`;
    text +=
      `${i + 1}. On March ${1 + r(28)}, 2023, ${name} of ${city}, acting on behalf of ${org}, executed the agreement (Exhibit ${r(99)}). ` +
      `Counsel may be reached at ${email} or ${phone}. The plaintiff alleges breach of the indemnity clause under section ${r(30)}.${r(9)}, ` +
      `and damages of $${r(900000)} were claimed. Account no. ${100000000 + r(899999999)} was referenced at ${r(9999)} Main Street, ${city}.\n\n`;
    detections.push({ value: name, category: "name" }, { value: city, category: "location" }, { value: org, category: "company" });
  }
  return { text, detections };
}

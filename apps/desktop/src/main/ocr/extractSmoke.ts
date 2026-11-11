import { extractBytesInWorker } from "./extractJobs";
import { extractIsolation } from "./extractClient";
import { sandboxMissing } from "./extractSandbox";

/**
 * The packaged smoke test's look at the extraction worker (`scripts/smoke-packaged.ts
 * --readers`, `OPENMASQ_SMOKE_READERS=1`): a one-page PDF read through the real worker, then one
 * line on stdout saying how it ran (`system`: inside the jail; `process`: a utilityProcess only,
 * which a packaged app never is: there the document is refused, `extractWall.ts`) and, when the
 * jail is not there or did not start, why. It reads a document of its own and grants nothing.
 */
const SMOKE_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 36>>stream
BT /F1 24 Tf 20 40 Td (smoke) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
trailer<</Root 1 0 R>>
%%EOF
`;

export async function smokeExtraction(): Promise<void> {
  try {
    const file = await extractBytesInWorker(new TextEncoder().encode(SMOKE_PDF), "smoke.pdf", "application/pdf");
    const { isolation, sandboxFailed } = extractIsolation();
    const read = file.text.includes("smoke") ? "ok" : `unread (${file.errorCode ?? file.error ?? "no text"})`;
    console.log(`[smoke] extraction ${isolation} ${read}${sandboxFailed ? ` — jail: ${sandboxFailed.replace(/\s+/g, " ")}` : ""}`);
  } catch (e) {
    console.log(`[smoke] extraction failed ${e instanceof Error ? e.message : String(e)} — jail: ${sandboxMissing() ?? "there, but it did not start"}`);
  }
}

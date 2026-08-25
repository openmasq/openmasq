// utilityProcess child : l'EXTRACTION de documents (pdf.js + OCR docTR/Tesseract + les
// parseurs office) sort du processus main. Mesuré (13/08) : la boucle par page d'un scan
// bloquait la boucle d'événements de main par rafales de ~1 s (rasterisation pdf.js,
// post-processing DBNet/CTC, encodage PNG) — pendant un scan de 8 pages, TOUT l'IPC
// (envoi, réglages, menus) ramait à ~1 100 ms le ping. Ici, main redevient un relais.
// Même mécanique que `../ner/worker.ts` : fork via `utilityProcess` (pas de fuse
// RunAsNode), env MINIMAL (les seuls chemins d'assets OCR — jamais un secret), et
// **jamais un log du texte extrait** (c'est du VRAI PII) — les seuls messages sortants
// sont la progression (des nombres) et le résultat structuré rendu au parent.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { extractText, extractBytes, type ExtractedFile } from "@openmasq/redact/documents";

// ⚠️ pdf.js (legacy) sous utilityProcess : `process.versions.electron` étant posé, il ne
// se croit PAS en Node et EXIGE `GlobalWorkerOptions.workerSrc` au lieu d'auto-charger
// son fake worker (observé : « No "GlobalWorkerOptions.workerSrc" specified » sur chaque
// getDocument — texte ET OCR, donc tout PDF ressortait « sans couche texte »). On pointe
// le worker sur son propre fichier, résolu depuis node_modules, en URL `file://` (un
// chemin nu est refusé par l'import() du process utilitaire — même leçon que
// `@openmasq/ort`). Posé AVANT le premier message ; inoffensif là où le fake worker
// se serait chargé seul.
const requireHere = createRequire(__filename);
/** Pourquoi l'épinglage a échoué, s'il a échoué — voir `pdfjsReady`. */
let pinFailure = "";
async function pinPdfjsWorkerSrc(): Promise<void> {
  try {
    // @ts-ignore — legacy build subpath ships no bundled types
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const opts = pdfjs.GlobalWorkerOptions ?? pdfjs.default?.GlobalWorkerOptions;
    if (!opts) {
      pinFailure = "pdf.js n'expose pas GlobalWorkerOptions";
      return;
    }
    if (!opts.workerSrc) {
      opts.workerSrc = pathToFileURL(requireHere.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs")).href;
    }
  } catch (e) {
    // ⚠️ NE PAS AVALER. Cet épinglage est la condition d'existence de toute lecture de PDF
    // dans ce processus : sans lui, pdf.js part sur son chemin NAVIGATEUR et chaque
    // document ressort « sans couche texte » — un échec total qui se présente comme un
    // fichier illisible. Mesuré le 15/08/2026 : le catch muet a coûté une enquête entière
    // pour une cause qui tenait en une ligne de journal.
    pinFailure = e instanceof Error ? e.message : String(e);
  }
  // eslint-disable-next-line no-console
  if (pinFailure) console.warn("[ocr] pdf.js workerSrc NON épinglé —", pinFailure);
}
const pdfjsReady = pinPdfjsWorkerSrc();

interface ParentPort {
  on(ev: "message", cb: (e: { data: Req }) => void): void;
  postMessage(msg: Res): void;
}
type Req =
  | { id: number; kind: "path"; path: string; ocrAllPages?: boolean }
  | { id: number; kind: "bytes"; data: string; name: string; mime?: string; ocrAllPages?: boolean };
type Res =
  | { id: number; progress: { done: number; pages: number } }
  | { id: number; ok: true; file: ExtractedFile }
  | { id: number; ok: false; error: string };
const parentPort = (process as unknown as { parentPort: ParentPort }).parentPort;

parentPort.on("message", (e) => {
  const req = e.data;
  void (async () => {
    const onProgress = (done: number, pages: number) => {
      try {
        parentPort.postMessage({ id: req.id, progress: { done, pages } });
      } catch {
        /* la progression est de l'affichage — jamais une raison d'échouer */
      }
    };
    try {
      await pdfjsReady; // le workerSrc pdf.js est épinglé avant tout getDocument
      // Les deux entrées sont BEST-EFFORT côté redact (un fichier illisible rend
      // `{error}` sans jeter) ; le catch ne couvre que l'imprévu (OOM d'un parseur…).
      const file =
        req.kind === "path"
          ? await extractText(req.path, onProgress, req.ocrAllPages)
          : await extractBytes(Buffer.from(req.data, "base64"), req.name, req.mime, onProgress, req.ocrAllPages);
      parentPort.postMessage({ id: req.id, ok: true, file });
    } catch (err) {
      // Un échec d'épinglage rend TOUT PDF illisible : le dire ICI, avec l'erreur, plutôt
      // que de laisser l'utilisateur et le journal deviner une cause de fichier.
      const base = err instanceof Error ? err.message : String(err);
      parentPort.postMessage({
        id: req.id,
        ok: false,
        error: pinFailure ? `${base} (pdf.js workerSrc non épinglé : ${pinFailure})` : base,
      });
    }
  })();
});

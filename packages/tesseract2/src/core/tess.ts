/*
 * Minimal typings for the Emscripten module produced by tesseract.js-core.
 * Only the surface actually used by tesseract2.js is typed; everything else
 * is reachable through the index signature.
 */

export interface TessFS {
  readFile(path: string, opts?: { encoding?: 'utf8' | 'binary'; flags?: string }): Uint8Array & string;
  writeFile(path: string, data: Uint8Array | string): void;
  unlink(path: string): void;
  mkdir(path: string): void;
  rmdir(path: string): void;
  readdir(path: string): string[];
  stat(path: string): unknown;
}

export interface OSBestResult {
  orientation_id: number;
  script_id: number;
  sconfidence: number;
  oconfidence: number;
}

export interface OSResults {
  best_result: OSBestResult;
  unicharset: { get_script_from_script_id(id: number): string };
  delete?(): void;
}

export interface TessPDFRenderer {
  BeginDocument(title: string): void;
  AddImage(api: TessBaseAPI): void;
  EndDocument(): void;
  delete?(): void;
}

export interface TessBaseAPI {
  Init(pathOrNull: null, langs: string, oem: number, configFile?: string): number;
  End(): void;
  SetVariable(name: string, value: string): void;
  SaveParameters(): void;
  RestoreParameters(): void;
  GetPageSegMode(): number;
  SetRectangle(left: number, top: number, width: number, height: number): void;
  SetImageFile(exif: number, angle: number): number;
  FindLines(): void;
  GetGradient?(): number;
  GetAngle?(): number;
  Recognize(monitor: null): void;
  AnalyseLayout(): void;
  DetectOS(results: OSResults): boolean;
  GetUTF8Text(): string;
  GetHOCRText(): string;
  GetTSVText(): string;
  GetBoxText(): string;
  GetUNLVText(): string;
  GetOsdText(): string;
  GetJSONText(): string;
  WriteImage(type: number, path: string): void;
  MeanTextConf(): number;
  oem(): number;
  Version(): string;
}

export interface TessModule {
  FS: TessFS;
  TessBaseAPI: new () => TessBaseAPI;
  TessPDFRenderer: new (name: string, dir: string, textonly: boolean) => TessPDFRenderer;
  OSResults: new () => OSResults;
  [key: string]: unknown;
}

export type CoreFactory = (opts: { TesseractProgress?: (percent: number) => void }) => Promise<TessModule>;

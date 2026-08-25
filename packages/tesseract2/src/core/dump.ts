import { IMAGE_TYPE } from './constants';
import { bytesToBase64 } from './bytes';
import type { TessModule, TessBaseAPI } from './tess';
import type { RecognizeData, Block } from './types';

export interface DumpOptions {
  pdfTitle?: string;
  pdfTextOnly?: boolean;
  skipRecognition: boolean;
}

/*
 * The generated HOCR is excessively indented; strip one level when present.
 */
const deindent = (html: string): string => {
  const lines = html.split('\n');
  if (lines[0].substring(0, 2) === '  ') {
    for (let i = 0; i < lines.length; i += 1) {
      if (lines[i].substring(0, 2) === '  ') {
        lines[i] = lines[i].slice(2);
      }
    }
  }
  return lines.join('\n');
};

/*
 * Collects every requested output format from the Tesseract API into a
 * plain structured-clone-friendly object.
 */
export default function dump(
  TessModule: TessModule,
  api: TessBaseAPI,
  output: Record<string, boolean>,
  options: DumpOptions,
): RecognizeData {
  const enumToString = (value: number, prefix: string): string => (
    Object.keys(TessModule)
      .filter((e) => (e.startsWith(`${prefix}_`) && TessModule[e] === value))
      .map((e) => e.slice(prefix.length + 1))[0]
  );

  const getImage = (type: number): string => {
    api.WriteImage(type, '/image.png');
    const pngBuffer = TessModule.FS.readFile('/image.png');
    const pngStr = `data:image/png;base64,${bytesToBase64(pngBuffer)}`;
    TessModule.FS.unlink('/image.png');
    return pngStr;
  };

  const getPDF = (title: string, textonly: boolean): Uint8Array => {
    const pdfRenderer = new TessModule.TessPDFRenderer('tesseract-ocr', '/', textonly);
    pdfRenderer.BeginDocument(title);
    pdfRenderer.AddImage(api);
    pdfRenderer.EndDocument();
    pdfRenderer.delete?.();
    return TessModule.FS.readFile('/tesseract-ocr.pdf');
  };

  const parseBlocks = (): Block[] => (JSON.parse(api.GetJSONText()) as { blocks: Block[] }).blocks;

  return {
    text: output.text ? api.GetUTF8Text() : null,
    hocr: output.hocr ? deindent(api.GetHOCRText()) : null,
    tsv: output.tsv ? api.GetTSVText() : null,
    box: output.box ? api.GetBoxText() : null,
    unlv: output.unlv ? api.GetUNLVText() : null,
    osd: output.osd ? api.GetOsdText() : null,
    pdf: output.pdf ? getPDF(options.pdfTitle ?? 'Tesseract OCR Result', options.pdfTextOnly ?? false) : null,
    imageColor: output.imageColor ? getImage(IMAGE_TYPE.COLOR) : null,
    imageGrey: output.imageGrey ? getImage(IMAGE_TYPE.GREY) : null,
    imageBinary: output.imageBinary ? getImage(IMAGE_TYPE.BINARY) : null,
    confidence: !options.skipRecognition ? api.MeanTextConf() : null,
    blocks: output.blocks && !options.skipRecognition ? parseBlocks() : null,
    layoutBlocks: output.layoutBlocks && options.skipRecognition ? parseBlocks() : null,
    psm: enumToString(api.GetPageSegMode(), 'PSM'),
    oem: enumToString(api.oem(), 'OEM'),
    version: api.Version(),
    debug: output.debug ? TessModule.FS.readFile('/debugInternal.txt', { encoding: 'utf8', flags: 'a+' }) : null,
    rotateRadians: 0, // overwritten by the recognize handler
  };
}

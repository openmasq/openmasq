import type { TessModule, TessBaseAPI } from './tess';

/*
 * Writes the image into the WASM filesystem and points the API at it.
 *
 * Note: unlike tesseract.js, BMP files are passed to Leptonica as-is instead
 * of being re-encoded through the unmaintained bmp-js package. Leptonica
 * handles common BMPs; exotic variants should be converted to PNG upstream.
 */
export default function setImage(
  TessModule: TessModule,
  api: TessBaseAPI,
  image: Uint8Array,
  angle = 0,
): void {
  // EXIF orientation extraction, same heuristic as tesseract.js upstream:
  // looks for the orientation tag pattern in the first 500 bytes.
  const exif = parseInt(
    Array.from(image.slice(0, 500)).join(' ').match(/1 18 0 3 0 0 0 1 0 (\d)/)?.[1] ?? '',
    10,
  ) || 1;

  TessModule.FS.writeFile('/input', image);
  const res = api.SetImageFile(exif, angle);
  if (res === 1) {
    throw Error('Failed to read the provided image. If this is a BMP file, note that only common BMP variants are supported; convert it to PNG first.');
  }
}

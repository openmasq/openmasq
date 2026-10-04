/**
 * The markers OCR writes INTO the extracted text where it could not read a page. The CALLER chooses
 * the wording (the desktop passes the user's language from `@openmasq/i18n`); this package
 * defaults to English; a caller with a catalogue passes its own.
 */
export interface OcrMarkers {
  /** A page whose raster would exceed the pixel ceiling (`safety/guard.ts` `rasterScale`). */
  pageTooLarge: (page: number) => string;
}

export const DEFAULT_OCR_MARKERS: OcrMarkers = {
  pageTooLarge: (page) => `[… page ${page} not OCR'd: dimensions too large]`,
};

/*
 * OEM = OCR Engine Mode. tesseract2.js defaults to LSTM_ONLY.
 */
export const OEM = {
  TESSERACT_ONLY: 0,
  LSTM_ONLY: 1,
  TESSERACT_LSTM_COMBINED: 2,
  DEFAULT: 3,
} as const;

export type OEMValue = (typeof OEM)[keyof typeof OEM];

/*
 * PSM = Page Segmentation Mode. String values, as expected by the
 * `tessedit_pageseg_mode` Tesseract variable.
 */
export const PSM = {
  OSD_ONLY: '0',
  AUTO_OSD: '1',
  AUTO_ONLY: '2',
  AUTO: '3',
  SINGLE_COLUMN: '4',
  SINGLE_BLOCK_VERT_TEXT: '5',
  SINGLE_BLOCK: '6',
  SINGLE_LINE: '7',
  SINGLE_WORD: '8',
  CIRCLE_WORD: '9',
  SINGLE_CHAR: '10',
  SPARSE_TEXT: '11',
  SPARSE_TEXT_OSD: '12',
  RAW_LINE: '13',
} as const;

export type PSMValue = (typeof PSM)[keyof typeof PSM];

export const IMAGE_TYPE = {
  COLOR: 0,
  GREY: 1,
  BINARY: 2,
} as const;

/*
 * Every output format `recognize` can produce. Only keys present here are
 * accepted in the `output` argument (unknown keys are rejected).
 */
export const DEFAULT_OUTPUT = {
  text: true,
  blocks: false,
  layoutBlocks: false,
  hocr: false,
  tsv: false,
  box: false,
  unlv: false,
  osd: false,
  pdf: false,
  imageColor: false,
  imageGrey: false,
  imageBinary: false,
  debug: false,
} as const;

export type OutputKey = keyof typeof DEFAULT_OUTPUT;

/*
 * Options of `recognize` handled by tesseract2.js itself; everything else is
 * passed through to Tesseract as a variable.
 */
export const TESSJS_RECOGNIZE_OPTIONS = ['rectangle', 'pdfTitle', 'pdfTextOnly', 'rotateAuto', 'rotateRadians'] as const;

/*
 * Tesseract parameters that can only be set at initialization time
 * (defined with `[type]_INIT_MEMBER` in the Tesseract codebase).
 * Setting them through `setParameters` has no effect, so we warn.
 */
export const INIT_ONLY_PARAMS = [
  'ambigs_debug_level', 'user_words_suffix', 'user_patterns_suffix',
  'load_system_dawg', 'load_freq_dawg', 'load_unambig_dawg', 'load_punc_dawg',
  'load_number_dawg', 'load_bigram_dawg', 'tessedit_ocr_engine_mode',
  'tessedit_init_config_only', 'language_model_ngram_on',
  'language_model_use_sigmoidal_certainty',
] as const;

/*
 * Hard limits (overridable per worker via options).
 */
export const DEFAULT_LIMITS = {
  maxImageBytes: 128 * 1024 * 1024,
  maxLangDataBytes: 512 * 1024 * 1024,
  fetchTimeout: 30 * 1000,
} as const;

/*
 * Max number of languages one worker may load (audit M1 DoS guard). Real OCR uses a
 * handful; this bounds a caller-influenced `langs` from fanning out into thousands of
 * concurrent downloads. Also the concurrency ceiling for those loads.
 */
export const MAX_LANGS = 16;
export const LANG_LOAD_CONCURRENCY = 4;

/*
 * Languages with official Tesseract traineddata.
 */
export const LANGUAGES: Readonly<Record<string, string>> = {
  AFR: 'afr', AMH: 'amh', ARA: 'ara', ASM: 'asm', AZE: 'aze', AZE_CYRL: 'aze_cyrl',
  BEL: 'bel', BEN: 'ben', BOD: 'bod', BOS: 'bos', BUL: 'bul', CAT: 'cat',
  CEB: 'ceb', CES: 'ces', CHI_SIM: 'chi_sim', CHI_TRA: 'chi_tra', CHR: 'chr',
  CYM: 'cym', DAN: 'dan', DEU: 'deu', DZO: 'dzo', ELL: 'ell', ENG: 'eng',
  ENM: 'enm', EPO: 'epo', EST: 'est', EUS: 'eus', FAS: 'fas', FIN: 'fin',
  FRA: 'fra', FRK: 'frk', FRM: 'frm', GLE: 'gle', GLG: 'glg', GRC: 'grc',
  GUJ: 'guj', HAT: 'hat', HEB: 'heb', HIN: 'hin', HRV: 'hrv', HUN: 'hun',
  IKU: 'iku', IND: 'ind', ISL: 'isl', ITA: 'ita', ITA_OLD: 'ita_old',
  JAV: 'jav', JPN: 'jpn', KAN: 'kan', KAT: 'kat', KAT_OLD: 'kat_old',
  KAZ: 'kaz', KHM: 'khm', KIR: 'kir', KOR: 'kor', KUR: 'kur', LAO: 'lao',
  LAT: 'lat', LAV: 'lav', LIT: 'lit', MAL: 'mal', MAR: 'mar', MKD: 'mkd',
  MLT: 'mlt', MSA: 'msa', MYA: 'mya', NEP: 'nep', NLD: 'nld', NOR: 'nor',
  ORI: 'ori', PAN: 'pan', POL: 'pol', POR: 'por', PUS: 'pus', RON: 'ron',
  RUS: 'rus', SAN: 'san', SIN: 'sin', SLK: 'slk', SLV: 'slv', SPA: 'spa',
  SPA_OLD: 'spa_old', SQI: 'sqi', SRP: 'srp', SRP_LATN: 'srp_latn', SWA: 'swa',
  SWE: 'swe', SYR: 'syr', TAM: 'tam', TEL: 'tel', TGK: 'tgk', TGL: 'tgl',
  THA: 'tha', TIR: 'tir', TUR: 'tur', UIG: 'uig', UKR: 'ukr', URD: 'urd',
  UZB: 'uzb', UZB_CYRL: 'uzb_cyrl', VIE: 'vie', YID: 'yid',
};

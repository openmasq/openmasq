/*
 * Typed errors. Every failure path in tesseract2.js rejects with one of these
 * (never a bare string, unlike tesseract.js), so callers can branch on `code`
 * or `instanceof`.
 */

export class TesseractError extends Error {
  public code: string;

  constructor(message: string, code = 'ERR_TESSERACT') {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ValidationError extends TesseractError {
  constructor(message: string) {
    super(message, 'ERR_VALIDATION');
  }
}

export class NetworkError extends TesseractError {
  constructor(message: string) {
    super(message, 'ERR_NETWORK');
  }
}

export class WorkerError extends TesseractError {
  constructor(message: string) {
    super(message, 'ERR_WORKER');
  }
}

export class TimeoutError extends TesseractError {
  constructor(message: string) {
    super(message, 'ERR_TIMEOUT');
  }
}

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { assertSameOrigin } from './sameOrigin';
import { ValidationError } from '../core/errors';

/*
 * The browser build's trust anchor (audit H6 analog): the worker, core-WASM and language
 * assets MUST be same-origin as the executing document (`chrome-extension://<signed id>`),
 * never a CDN. A regression here re-opens arbitrary-code-exec via a cross-origin core.
 */
describe('assertSameOrigin — browser same-origin trust anchor', () => {
  it('accepts a same-origin absolute URL and returns its href', () => {
    const u = `${location.origin}/tesseract/tesseract2-worker.js`;
    expect(assertSameOrigin(u, '`workerUrl`')).toBe(new URL(u).href);
  });

  it('accepts a relative URL (resolved against the document origin)', () => {
    const expected = new URL('tesseract/langs/eng.traineddata', location.href).href;
    expect(assertSameOrigin('tesseract/langs/eng.traineddata', 'langPath')).toBe(expected);
  });

  it('REJECTS a cross-origin CDN URL — fail-closed (no CDN core exec)', () => {
    expect(() => assertSameOrigin('https://cdn.jsdelivr.net/npm/tesseract.js-core/core.wasm.js', '`coreUrl`'))
      .toThrow(ValidationError);
    expect(() => assertSameOrigin('https://cdn.evil.example/worker.js', '`workerUrl`'))
      .toThrow(/SAME-ORIGIN/);
  });

  it('REJECTS a different-scheme same-host URL (origin includes the scheme)', () => {
    // https vs the jsdom http origin → different origin → rejected.
    expect(() => assertSameOrigin(`https://${location.host}/tesseract/worker.js`, '`workerUrl`'))
      .toThrow(/SAME-ORIGIN/);
  });
});

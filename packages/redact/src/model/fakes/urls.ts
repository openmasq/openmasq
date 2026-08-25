import { hashString, fakeHandle } from "./primitives";

/**
 * A same-kind fake for a whole URL: the SHAPE is preserved (scheme, host depth, path
 * depth, query keys) and every identifying label is swapped for a pseudo-word.
 *
 * ⚠️ The TLD is faked TOO, deliberately. Keeping it would read more naturally, but a TLD
 * is not neutral — `.local` announces internal infrastructure, `.gouv.fr` a government
 * context — and a heuristic that reliably tells a TLD from a host label across `.co.uk`,
 * `.local` and a bare IP is more machinery than the readability is worth. The result still
 * reads as a URL, which is all the model needs.
 *
 * QUERY KEYS are kept, VALUES are faked: `?token=…` stays a `token` parameter, so the
 * model can reason about the shape of a link without seeing the credential.
 *
 * ⚠️ The fake is never FETCHED: under root rule 11 the outside always receives the REAL
 * value, so a fake host that happened to resolve is still never contacted.
 */
export function fakeUrl(value: string, salt: number): string {
  const h = hashString(value) + salt;
  let i = 0;
  return value.replace(
    /(^[a-z][\w+.-]*:\/\/)|(\?|&)([\w.-]+)(=)|([A-Za-z0-9][A-Za-z0-9-]*)/g,
    (m, scheme, qsep, qkey, eq, label) => {
      if (scheme) return scheme; // https:// — kept verbatim
      if (qsep) return `${qsep}${qkey}${eq}`; // ?token= / &id= — the KEY is not a secret
      return label ? fakeHandle(label, h + i++ * 17) : m;
    },
  );
}

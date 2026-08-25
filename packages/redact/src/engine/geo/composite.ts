/**
 * A place faked as a COMPOSITE — « ST OUEN (93400) », « 93400 ST OUEN » — and the
 * fragments it must also answer to.
 *
 * The geo detector emits the town and its postal code as ONE value on purpose, so the
 * fake code belongs to the fake town (a real code under an invented town is incoherent,
 * and geolocating). The cost is on the way back: a model writes the town ALONE, a bare
 * fragment is not a vault key, and `unredact` — a lookup by exact value — leaves it.
 *
 * Why the reverse pass cannot just match fragments on its own: a fragment of a fake
 * collides with ordinary words. Restoring any « Group » inside the fake « Voxa Group »
 * would rewrite every « group » in the reply into a real company. Fragments are therefore
 * REGISTERED, never inferred — which is exactly what the name family has always done
 * (why a bare surname comes back), and what places lacked.
 */

/** `ST OUEN (93400)` / `93400 ST OUEN` / `ST OUEN 93400` → `{ town, code }`, else null. */
export function splitPlace(value: string): { town: string; code: string } | null {
  const v = value.trim();
  let m = /^(.+?)[\s,]*\((\d{4,6})\)$/u.exec(v) ?? /^(.+?)[\s,]+(\d{4,6})$/u.exec(v);
  if (m) return { town: m[1].trim(), code: m[2] };
  m = /^(\d{4,6})[\s,]+(.+)$/u.exec(v);
  if (m) return { town: m[2].trim(), code: m[1] };
  return null;
}

const capitalize = (s: string) =>
  s.replace(/\p{L}[\p{L}\p{M}'’-]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

/**
 * `fake→real` pairs so a bare town (or a bare postal code) resolves like the whole value.
 *
 * ⚠️ Bounded: the two sides must decompose the SAME way or nothing is emitted. An alias
 * built from a misaligned pair would map a fragment onto the WRONG real value — worse
 * than not restoring it, because it would read as a fact. The town is emitted in the three
 * casings a document and a model actually produce (as written, Title, UPPER), mirroring
 * `nameAliases`.
 */
export function placeFragments(realPlace: string, fakePlace: string): [string, string][] {
  const real = splitPlace(realPlace);
  const fake = splitPlace(fakePlace);
  if (!real || !fake) return [];
  const out: [string, string][] = [];
  // Never alias a value to itself: the fake kept the real code ⇒ nothing to restore, and
  // the entry would sit in the vault forever doing nothing.
  if (fake.code !== real.code) out.push([fake.code, real.code]);
  if (fake.town.toLowerCase() === real.town.toLowerCase() || fake.town.length < 3) return out;
  const forms: [string, string][] = [
    [fake.town, real.town],
    [capitalize(fake.town), capitalize(real.town)],
    [fake.town.toUpperCase(), real.town.toUpperCase()],
  ];
  for (const [f, r] of forms) if (!out.some(([k]) => k === f)) out.push([f, r]);
  return out;
}

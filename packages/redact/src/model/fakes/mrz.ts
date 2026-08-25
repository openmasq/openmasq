import { hashString } from "./primitives";

/** Le faux d'une MRZ (bande machine, `isMrzShaped`) : chiffres MÉLANGÉS comme
 *  `fakeDigits`, et les LETTRES aussi — elles portent le NOM, un faux qui les garde
 *  fuit l'identité qu'il prétend masquer (vécu : « IDFRASABOURDIN<<< » ressortait
 *  intact autour de chiffres neufs). Chevrons et ponctuation préservés (la structure
 *  ISO 9303 reste lisible) ; le préfixe type+pays (« IDFRA ») est GARDÉ : il dit
 *  « une CNI française » sans dire de qui. Déterministe à sel égal, comme les autres. */
export function fakeMrz(value: string, salt: number): string {
  const h = hashString(value.replace(/[^A-Z0-9]/g, "")) + salt;
  const keep = /^ID[A-Z]{3}/.test(value) ? 5 : 0;
  let i = 0;
  let pos = 0;
  return value.replace(/[A-Z0-9]/g, (c) => {
    pos++;
    if (pos <= keep) return c;
    if (/\d/.test(c)) return String((h + i++ * 7 + Number(c) + 3) % 10);
    return String.fromCharCode(65 + ((h + i++ * 11 + c.charCodeAt(0)) % 26));
  });
}

import type { Detection } from "../types";
import { acceptFieldValue, cleanValue } from "./contextFields";

/**
 * Le libellé TÉLÉPHONE **sans deux-points** — « Telefon 0734 82 57 190 »,
 * « Telefono 340 118 27 64 ». L'allemand et l'italien collent le libellé au numéro ; la
 * branche internationale de `phones.ts` exige un `+` ou un `00`, et la branche nationale
 * est spécifique à la France. Ces numéros n'avaient donc aucun détecteur.
 *
 * Ils n'ont été VUS qu'en corrigeant la capture gloutonne du détecteur de champs : ils
 * étaient jusque-là « détectés » par accident, en chevauchant dans la valeur d'adresse
 * voisine — le faux effaçait alors le libellé et le numéro en même temps que l'adresse.
 * Un span correct a fait apparaître la fuite qui se cachait derrière.
 *
 * ⚠️ **La garde porte sur la VALEUR, jamais sur le libellé.** Uniquement un run de
 * chiffres et de séparateurs, ≥ 7 caractères, AUCUNE lettre. Sans elle « Mobile 12 mois
 * inclus » deviendrait un numéro de téléphone. C'est aussi pourquoi la branche est
 * réservée à PHONE : c'est la seule catégorie dont la valeur ne peut pas porter de
 * lettre, donc la seule où un séparateur aussi faible qu'une espace reste sûr.
 *
 * Négatifs et positifs épinglés dans `contextFields.test.ts`.
 */
export function pushBarePhoneLabels(
  text: string,
  alt: string,
  seen: Set<string>,
  out: Detection[],
): void {
  // NBSP et espace fine insécable incluses : ce sont les séparateurs de groupes que
  // l'extraction PDF française émet verbatim.
  const re = new RegExp(
    `(?<![\\p{L}])(?:${alt})[^\\S\\r\\n]+((?:\\+|00)?\\d[\\d.()\\u00a0\\u202f -]{6,24}\\d)(?![\\d-])`,
    "giu",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const ok = acceptFieldValue(cleanValue(m[1] ?? ""), "PHONE");
    if (!ok) continue;
    const key = `${ok.category}::${ok.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: ok.value, category: ok.category, start: m.index });
  }
}

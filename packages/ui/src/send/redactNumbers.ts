import type { Settings } from "../types";

/**
 * Le redaction des NOMBRES, retiré du produit.
 *
 * Le réglage « Masquer aussi les nombres » a disparu de toutes les surfaces. Le champ, lui,
 * survit dans les blobs déjà persistés — et un compte qui l'avait activé continuerait à
 * jetoniser chaque nombre indéfiniment, sans plus aucun moyen de l'éteindre : un réglage
 * sans interrupteur est un piège, pas une fonctionnalité.
 *
 * Une seule lecture, ici, pour que la neutralisation ne puisse pas être contournée par un
 * appelant qui lirait `settings.redactNumbers` directement (règle 9 : un fait partagé a UN
 * domicile). Le jour où le redaction des nombres revient, il revient par cette fonction.
 */
export function redactNumbersOn(_settings: Pick<Settings, "redactNumbers"> | undefined): boolean {
  return false;
}

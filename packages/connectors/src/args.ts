/**
 * Normalisation des arguments que les modèles remplissent MAL.
 *
 * Un champ « liste de chaînes » arrive sous trois formes selon le modèle : le tableau
 * attendu, une chaîne séparée par des virgules, ou — c'est le piège — un tableau JSON
 * ENCODÉ EN CHAÎNE. Journal du 27/07/2026 :
 *
 *   "attendees": "[\"Équipe produit\"]"
 *
 * `Array.isArray` répond `false`, le champ est silencieusement ABANDONNÉ, l'événement
 * est créé sans participants et rien n'en informe le modèle — la pire des issues : une
 * écriture réussie, amputée, et personne pour le dire.
 *
 * Même philosophie que la déclaration `to`/`cc`/`bcc` de Gmail (`google/gmailSend.ts`) :
 * on annonce au modèle la forme la plus simple à remplir, et on ACCEPTE les autres.
 */

/** Un tableau JSON encodé en chaîne : `'["a", "b"]'`. */
function parseJsonArray(s: string): unknown[] | null {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return null;
  try {
    const v: unknown = JSON.parse(t);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/**
 * Ramène une valeur à une liste de chaînes non vides, quelle que soit la forme reçue :
 * tableau, tableau JSON encodé en chaîne, ou chaîne séparée par des virgules ou des
 * points-virgules. Une entrée non-chaîne à l'intérieur d'un tableau est ignorée.
 *
 * ⚠️ Ne découpe une CHAÎNE que si elle n'est pas un tableau JSON : `'["a, b"]'` rend
 * `["a, b"]` (une entrée), pas deux — la virgule y appartient à la valeur.
 */
export function stringList(v: unknown): string[] {
  const raw: unknown[] = Array.isArray(v)
    ? v
    : typeof v === "string"
      ? (parseJsonArray(v) ?? v.split(/[,;]/))
      : [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter((x) => x.length > 0);
}

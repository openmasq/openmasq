/**
 * « Tu as recopié l'identifiant de travers » — la seule panne d'outil qu'on peut corriger
 * à la place du modèle.
 *
 * Un `gmail__get_message` échoue en boucle sur des identifiants que le `list` précédent
 * venait de donner JUSTES : `19fc78f80fd31ba0` reparti en `19fc78f80fd31ba`, quatre autres
 * pareil sur le même tour (journal du 04/08/2026). Le moteur de redaction n'y touche pas
 * (mesuré : ni vault, ni substitution) — c'est une faute de recopie sur du hexadécimal, et
 * aucun modèle n'en est à l'abri. Mais la BONNE valeur est encore là, dans un résultat que
 * la boucle a déjà vu : on peut la lui rendre au lieu de le laisser deviner.
 *
 * ⚠️ **On ne corrige JAMAIS dans le dos du modèle** — on ne réécrit pas ses arguments, on
 * ajoute une phrase au résultat d'erreur. Réécrire un argument, ce serait appeler un outil
 * sur une cible que personne n'a demandée ; sur une ÉCRITURE ça vise le mauvais objet.
 *
 * Et on se tait dès qu'il y a un doute : deux candidats à la même distance, une distance
 * > `MAX_EDITS`, un jeton trop court — rien. Une correction inventée coûte plus cher que
 * l'erreur d'origine, parce qu'elle est crédible.
 *
 * Sûr pour le fil : la boucle ne voit que des résultats DÉJÀ redacted, donc l'identifiant
 * cité est celui que le modèle a lui-même sous les yeux.
 */

/** En deçà, un jeton n'est pas un identifiant opaque et on ne s'en mêle pas. */
const MIN_LEN = 10;
const MAX_LEN = 128;
/** Au-delà, ce n'est plus une faute de recopie mais un autre identifiant. */
const MAX_EDITS = 2;

/** Assez long, sans espace, et pas un mot : lettres ET chiffres mêlés, ou du pur hexa. */
const OPAQUE = /[0-9A-Za-z_-]{10,128}/g;

function isOpaqueId(t: string): boolean {
  if (t.length < MIN_LEN || t.length > MAX_LEN) return false;
  const digits = (t.match(/\d/g) ?? []).length;
  // Un mot ordinaire ("informations", "unsubscribe") n'a pas de chiffre ; un identifiant
  // en a toujours quelques-uns. Le seuil est bas exprès — `msg_01AbCd…` en a peu.
  return digits >= 2;
}

/** Les identifiants opaques d'un texte, dédupliqués, dans l'ordre d'apparition. */
export function opaqueIdsIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.match(OPAQUE) ?? []) if (isOpaqueId(m)) out.add(m);
  return [...out];
}

/** Distance d'édition bornée : rend `max + 1` dès qu'on sait qu'on dépasse. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const d = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(d);
      if (d < best) best = d;
    }
    if (best > max) return max + 1; // toute la ligne dépasse déjà : inutile de continuer
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Le seul identifiant vu qui soit une faute de recopie de `bad`. `undefined` si aucun,
 * si le plus proche est trop loin, ou si DEUX sont également proches (ambiguïté ⇒ silence).
 */
export function nearestIdentifier(bad: string, seen: Iterable<string>): string | undefined {
  if (!isOpaqueId(bad)) return undefined;
  let best: string | undefined;
  let bestD = MAX_EDITS + 1;
  let tie = false;
  for (const cand of seen) {
    if (cand === bad) return undefined; // l'identifiant existe tel quel : la panne est ailleurs
    if (!isOpaqueId(cand)) continue;
    const d = editDistance(bad, cand, MAX_EDITS);
    if (d > MAX_EDITS) continue;
    if (d < bestD) [best, bestD, tie] = [cand, d, false];
    else if (d === bestD) tie = true;
  }
  return tie ? undefined : best;
}

/** La valeur d'un argument, si c'est une chaîne. Les objets imbriqués ne sont pas visés. */
function stringArgs(args: Record<string, unknown>): [string, string][] {
  return Object.entries(args).filter((e): e is [string, string] => typeof e[1] === "string");
}

/**
 * La phrase à coller au résultat d'erreur, ou `""` si rien de sûr à dire.
 * `seen` = les identifiants que les résultats d'outils de ce tour ont déjà montrés.
 */
export function identifierTypoHint(args: Record<string, unknown>, seen: Iterable<string>): string {
  const seenArr = [...seen];
  const fixes: string[] = [];
  for (const [key, value] of stringArgs(args)) {
    const right = nearestIdentifier(value.trim(), seenArr);
    if (right) fixes.push(`\`${key}\` : « ${value.trim()} » → « ${right} »`);
  }
  if (!fixes.length) return "";
  return (
    `\n\nL'identifiant envoyé n'existe pas, mais il ressemble de très près à un identifiant ` +
    `déjà rendu par un résultat précédent — il a donc été recopié de travers. Refais l'appel ` +
    `avec la valeur exacte, copiée caractère par caractère :\n${fixes.map((f) => `- ${f}`).join("\n")}`
  );
}

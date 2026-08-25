import type { UpdateStatus } from "../../../../host";

/**
 * Ce que la page Versions doit MONTRER — la décision, pas le rendu.
 *
 * Pour la personne qui utilise l'app, « quelle version tourne, sur quel canal, et voici
 * l'historique publié » ne répond à aucune question qu'elle se pose. La seule qui compte
 * est « est-ce que je suis à jour ? », et l'app y répond déjà toute seule. Le détail
 * technique reste utile à NOUS — sur une build de staging, où l'on bascule d'un canal à
 * l'autre et où l'on épingle une version.
 *
 * ⚠️ « à jour » est une AFFIRMATION, pas une mise en page : elle n'est vraie que si
 * l'updater est au repos. Dès qu'il cherche, télécharge, tient une build prête ou a
 * échoué, c'est ÇA qu'il faut dire — sinon la page rassure pendant qu'une mise à jour
 * attend, ou pire, pendant qu'elle a échoué.
 */

/** Une build de staging : c'est là que le détail technique sert. */
export function isStagingBuild(
  current: { channel?: string } | null,
  channels: readonly { channel: string; env: string }[] = [],
): boolean {
  const ch = current?.channel?.toLowerCase() ?? "";
  if (!ch) return false;
  // Le canal PORTE l'environnement dans son nom (`desktop-staging`) ; la liste
  // privilégiée, quand elle est là, tranche mieux — elle donne l'`env` publié.
  const known = channels.find((c) => c.channel.toLowerCase() === ch);
  if (known) return known.env.toLowerCase() !== "production";
  return ch.includes("staging") || ch.includes("dev") || ch.includes("beta");
}

export type VersionsView =
  /** Rien à dire de plus : « l'app est à jour ». */
  | { kind: "upToDate" }
  /** L'updater travaille (ou a échoué) : la ligne d'état prend la parole. */
  | { kind: "busy" }
  /** Build de staging (ou appareil privilégié) : tout le détail technique. */
  | { kind: "technical" };

export function versionsView(
  status: UpdateStatus | null,
  opts: {
    current: { channel?: string } | null;
    channels?: readonly { channel: string; env: string }[];
    /** Appareil autorisé à épingler / basculer d'environnement : il a besoin du détail. */
    privileged?: boolean;
  },
): VersionsView {
  if (opts.privileged || isStagingBuild(opts.current, opts.channels)) return { kind: "technical" };
  // Au repos ⇒ la phrase courte. Pas d'état = l'updater n'a rien à signaler, et
  // « not-available » EST le repos, juste après une vérification.
  return !status || status.state === "not-available" ? { kind: "upToDate" } : { kind: "busy" };
}

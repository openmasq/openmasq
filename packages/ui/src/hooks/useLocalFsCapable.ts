import { useHost } from "../host";

/**
 * Cette PLATEFORME sait-elle parcourir des dossiers de la machine ?
 *
 * ⚠️ La question était avant « y a-t-il quelque chose à parcourir ? » : elle appelait
 * `roots()` et ne répondait oui que si des dossiers étaient DÉJÀ autorisés. Le panneau de
 * droite s'en servait pour décider de s'afficher — si bien que l'utilisateur qui n'avait
 * ni dossier local ni stockage connecté voyait RIEN, juste « Web · Aucun onglet ouvert ».
 * C'est pourtant exactement lui qu'il fallait inviter, et les deux invitations existaient
 * déjà dans le panneau : elles étaient simplement inatteignables.
 *
 * `available:false` ne pouvait pas servir de garde non plus — il signifie « le connecteur
 * Fichiers n'est pas connecté » (`host/localFs.ts`), donc précisément l'état qu'on veut
 * montrer. Ne reste que la CAPACITÉ : un aperçu web ou le mobile n'ont pas le créneau, et
 * là seulement il n'y a rien à proposer. Le VIDE — aucune racine, aucun cloud — est rendu
 * par `FolderTreePanel` / `StorageSources`, dont c'est le travail.
 *
 * Effet de bord voulu : plus d'appel `roots()` ni d'abonnement `mcp.onChanged` au montage
 * du rail. La capacité ne change pas en cours de session ; l'ancienne version relançait un
 * listing à chaque changement de connecteur pour décider d'un simple affichage.
 */
export function useLocalFsCapable(): boolean {
  return !!useHost().localFs;
}

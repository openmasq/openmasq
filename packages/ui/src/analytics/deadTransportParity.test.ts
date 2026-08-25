import { describe, it, expect } from "vitest";
import { DEAD_TRANSPORT_MESSAGES, isDeadTransport } from "@openmasq/mcp";
import { isOperationalError } from "@openmasq/analytics";

/**
 * PARITÉ — « ce transport MCP est mort » doit vouloir dire la même chose des deux côtés.
 *
 * Deux décisions dépendent du même fait, et elles ne peuvent pas partager un module :
 *  • `@openmasq/mcp` `isDeadTransport` — le propriétaire ÉVINCE le connecteur
 *    (`apps/desktop` `refreshRoutes`) au lieu de continuer à le sonder ;
 *  • `@openmasq/analytics` `isOperationalError` — les canaux d'erreurs (PostHog
 *    `$exception` ET, depuis le 12/08, le `beforeSend` de Sentry) NE RAPPORTENT PAS.
 *
 * `@openmasq/analytics` est SANS DÉPENDANCE par contrat : il ne peut pas importer
 * `@openmasq/mcp`. Les deux listes vivent donc séparément, et ce test est ce qui les tient
 * ensemble — un commentaire ne peut pas échouer en CI (règle 9). Il vit dans `packages/ui`
 * parce que c'est le seul paquet qui consomme les DEUX.
 *
 * Ce que le désaccord coûterait, dans les deux sens : un message évincé mais pas filtré
 * re-remplit le tableau de bord (l'état du 12/08 : 93 % du volume) ; un message filtré mais
 * pas évincé rend la panne INVISIBLE, puisque plus rien ne la rapporte ET rien ne la retire.
 */
describe("parité mcp ⇄ analytics — les messages de transport mort", () => {
  it("chaque message que mcp reconnaît est écarté par le filtre des canaux d'erreurs", () => {
    for (const msg of DEAD_TRANSPORT_MESSAGES) {
      expect(isDeadTransport(new Error(msg))).toBe(true);
      expect(
        isOperationalError({ scope: "mcp", code: "list-tools", message: msg }),
        `« ${msg} » évince côté mcp mais serait RAPPORTÉ — le tableau de bord se remplit`,
      ).toBe(true);
    }
  });

  it("les formes RÉELLES vues sur Sentry sont couvertes des deux côtés", () => {
    // Copiées des issues ELECTRON-1 et ELECTRON-2 : ce sont les textes exacts du SDK,
    // pas les nôtres, et c'est pourquoi on les épingle plutôt que de les paraphraser.
    for (const real of ["Not connected", "MCP error -32000: Connection closed"]) {
      expect(isDeadTransport(new Error(real))).toBe(true);
      expect(isOperationalError({ scope: "mcp", code: "list-tools", message: real })).toBe(true);
    }
  });

  it("une régression d'EMPAQUETAGE n'est ni évincée ni filtrée — c'est le signal à garder", () => {
    for (const real of ["spawn npx ENOENT", "Cannot find module 'entities/decode'"]) {
      expect(isDeadTransport(new Error(real))).toBe(false);
      expect(isOperationalError({ scope: "mcp", code: "list-tools", message: real })).toBe(false);
    }
  });
});

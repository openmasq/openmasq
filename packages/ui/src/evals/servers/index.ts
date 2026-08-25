// Barrel: the fixture-server kit + the connector fleet. Import from HERE.
import { GMAIL as _GMAIL, BROWSER as _BROWSER, CRM as _CRM } from "./core";
import { FILESYSTEM as _FS, GDRIVE as _GDRIVE, GCAL as _GCAL } from "./workspace";
import { NOTION as _NOTION, SLACK as _SLACK } from "./saas";
import { FIREFLIES as _FF, LINEAR as _LIN, ASANA as _AS, STRIPE_PAYMENTS as _SP } from "./workflows";
import { GITHUB as _GH, MONDAY as _MON, INTERCOM as _IC, CANVA as _CV, PAYPAL as _PP, JOTFORM as _JF } from "./fleet2";
import { SEARCH_FLEET, DEV_FLEET } from "./fleet3";
import { BUSINESS_FLEET } from "./fleet4";
import { directFleet } from "./direct";
import type { FakeServer } from "./kit";

export * from "./kit";
export { GMAIL, BROWSER, CRM } from "./core";
export { FILESYSTEM, GDRIVE, GCAL } from "./workspace";
export { NOTION, SLACK, STRIPE } from "./saas";
export { FIREFLIES, LINEAR, ASANA, STRIPE_PAYMENTS } from "./workflows";
export { GITHUB, MONDAY, INTERCOM, CANVA, PAYPAL, JOTFORM } from "./fleet2";
export { SEARCH_FLEET, DEV_FLEET } from "./fleet3";
export { BUSINESS_FLEET } from "./fleet4";
export { directFleet, directFixtureGaps } from "./direct";

/** La flotte ENTIÈRE (mode `OPENMASQ_EVAL_SERVERS=all` + le test de parité de
 *  couverture) — un serveur PAR connecteur du catalogue, dédupliqué par id, priorité :
 *  serveurs manuels (les scénarios y réfèrent) > flotte direct GÉNÉRÉE
 *  (`@openmasq/connectors`, fidèle par construction) > transcriptions remote. La vue
 *  Stripe retenue est `STRIPE_PAYMENTS`; le duo générique `STRIPE` de saas.ts reste
 *  disponible aux scénarios qui le déclarent. */
export const ALL_FLEET: FakeServer[] = (() => {
  const out = new Map<string, FakeServer>();
  const layers: FakeServer[][] = [
    [_GMAIL, _BROWSER, _CRM, _FS, _GDRIVE, _GCAL, _NOTION, _SLACK,
     _FF, _LIN, _AS, _SP, _GH, _MON, _IC, _CV, _PP, _JF],
    directFleet(),
    SEARCH_FLEET, DEV_FLEET, BUSINESS_FLEET,
  ];
  for (const layer of layers) for (const s of layer) if (!out.has(s.id)) out.set(s.id, s);
  return [...out.values()];
})();

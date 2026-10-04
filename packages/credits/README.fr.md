[English](README.md)

# @openmasq/credits

**Les paliers de facturation et le moteur de crédits prépayés, pour les déploiements qui
facturent l'usage des modèles.**

L'application compilée depuis ce dépôt et celle que publie la marque ne vendent rien (voir
[Compiler depuis les sources](../../README.fr.md#compiler-depuis-les-sources)). Ce paquet
existe pour qui déploie le backend privé derrière la porte `OPENMASQ_BILLING` et le facture.
Ce backend l'importe pour que ses chiffres soient ceux qu'affiche l'application. Dans ce
dépôt, son seul consommateur est un test de parité de `@openmasq/ui`
(`packages/ui/src/state/billing/billing.parity.test.ts`).

## Contenu

- **Paliers** : `AccountType` et `CREDITS_CENTS_PER_SEAT`, l'enveloppe mensuelle de crédits
  par siège, en centimes d'euro (`src/tiers.ts`).
- **Coût** : `deriveCreditCents` convertit un modèle et des nombres de jetons en crédits, à
  partir des prix de `@openmasq/llm` ; `meterCachedUsage` applique les coefficients du cache
  (`src/deriveCost.ts`).
- **Solde** : `creditPeriod`, `getOrgCredits` et `getUserCredits` calculent un
  `CreditStatus` (`src/credits.ts`).
- **Périmètre et consommation** : `resolveCreditScope` et `recordUsage` (`src/scope.ts`).
- **Mode gratuit** : `isFreeMode`, vrai quand `OPENMASQ_FREE_MODE=1` (`src/freeMode.ts`).

Les requêtes reçoivent un objet `Knex` injecté. Ce dépôt compile le paquet et teste la
logique pure ; les requêtes ont besoin d'une base de données réelle.

## Développer

```bash
pnpm --filter @openmasq/credits build       # tsup → dist/
pnpm --filter @openmasq/credits typecheck
pnpm test packages/credits                  # depuis la racine du dépôt
```

> [!NOTE]
> Pour faire tourner votre propre pile, voir [`SELF_HOSTING.md`](../../SELF_HOSTING.md).

# @openmasq/credits — billing tiers and prepaid credits

<sub>**English** · [Français](#openmasqcredits--paliers-de-facturation-et-crédits-prépayés)</sub>

The plan tiers and the credit amounts as **one fact**, plus the DB-agnostic credit
engine (pure logic + queries against an injected handle). The server side that meters
lives in a separate repository and imports this so both sides compute the same numbers.

**Start here.** `src/index.ts`.

---

# @openmasq/credits — paliers de facturation et crédits prépayés

Les paliers d'abonnement et les montants de crédits comme **un seul fait**, plus le moteur
de crédits agnostique de la base (logique pure + requêtes contre un handle injecté). Le côté
serveur qui compte vit dans un dépôt séparé et importe celui-ci, pour que les deux côtés
calculent les mêmes nombres.

**Commencez ici.** `src/index.ts`.

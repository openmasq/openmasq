[English](README.md)

# @openmasq/schema

**Le schéma de chat persisté : les formes qu'OpenMasq écrit sur le disque et synchronise.**

`Message`, `Conversation` et leurs compléments sont déclarés ici, une seule fois.
`@openmasq/ui` les réexporte pour l'application de bureau, et `@openmasq/sync` s'en sert
pour appliquer les conversations synchronisées. Le paquet ne contient que des types, sans
code d'exécution, et ne dépend que de `@openmasq/redact` pour les noms de catégories de
masquage.

## Contenu

- **`Role`** : `"system" | "user" | "assistant"`.
- **`Message`** : un message tel qu'il est stocké (`src/message.ts`).
- **`Conversation`** : une conversation et ses réglages (`src/conversation.ts`).
- **`AskTarget`** : le dossier ou le fichier sur lequel porte une question, local ou dans un
  stockage connecté, conservé sur le message de l'utilisateur (`src/askTarget.ts`).
- **`RedactCategoryKey`** : les catégories de masquage que l'utilisateur peut activer, un
  alias du `RedactionCategory` du moteur.

```ts
import type { Conversation, Message } from "@openmasq/schema";
```

## Développer

```bash
pnpm --filter @openmasq/schema build       # tsup → dist/, à relancer avant de compiler un consommateur
pnpm --filter @openmasq/schema typecheck
```

Le paquet n'a pas de tests. Une modification du schéma est vérifiée par la compilation et
les tests de ses consommateurs.

> [!IMPORTANT]
> Chaque champ est une clé persistée. N'ajoutez que des champs optionnels. Renommer un
> champ ou en changer le sens exige une migration du stockage chez chaque lecteur.

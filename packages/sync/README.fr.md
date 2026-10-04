[English](README.md)

# @openmasq/sync

**La synchronisation chiffrée de bout en bout entre appareils, et les canaux d'organisation.**

La partie client de la synchronisation d'OpenMasq, en TypeScript pur avec WebCrypto et
`fetch`. Le serveur ne stocke jamais que des données chiffrées. Dans ce dépôt, c'est le
processus de rendu de l'application de bureau qui l'utilise
(`apps/desktop/src/renderer/src/sync/`). C'est un paquet interne au monorepo, non publié
sur npm.

## Contenu

- **Synchronisation des enregistrements** : les conversations, l'annuaire des intégrations,
  les compétences, les workflows, la mémoire et les termes du coffre, sous forme d'un
  journal d'enregistrements chiffrés, uniquement complété. La fusion est une union, avec
  la dernière écriture qui l'emporte pour chaque entité, sur des horloges de Lamport
  (`src/records.ts`).
- **Synchronisation du coffre** : le coffre de masquage d'une conversation, chiffré sur
  l'appareil et stocké sous la forme d'un bloc opaque (`src/vaultClient.ts`).
- **Partages d'organisation** : des termes du coffre et des compétences partagés avec toute
  l'organisation, une équipe ou une personne, lisibles seulement une fois approuvés
  (`src/orgScope/`).
- **Audit d'organisation** : le nombre de valeurs masquées par catégorie, jamais une valeur
  (`src/events.ts`).
- **Transports** : `httpTransport` et `orgHttpTransport` (`src/transport/`).

## Développement

```bash
pnpm --filter @openmasq/sync build       # tsup, vers dist/
pnpm --filter @openmasq/sync typecheck
pnpm test packages/sync                  # depuis la racine
```

> [!NOTE]
> La synchronisation a besoin d'un serveur qui ne fait pas partie de ce dépôt. Une version
> compilée depuis ces sources fonctionne sans lui.

> [!IMPORTANT]
> Les types d'enregistrement et les noms de portée sont relus par d'autres appareils : leur
> valeur ne doit jamais changer, même si l'identifiant est renommé. `VAULT_TERMS_SCOPE`, par
> exemple, vaut `"@coffre"` (`src/recordTypes.ts`, `src/orgScope/orgTypes.ts`).

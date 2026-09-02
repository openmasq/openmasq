# @openmasq/sync — cross-device sync

<sub>**English** · [Français](#openmasqsync--la-synchronisation-entre-appareils) · [openmasq.com](https://openmasq.com)</sub>

End-to-end encrypted synchronisation of a user's records (conversations oplog, vaults,
vault terms, skills) and the **organisation scopes** (shares approved by an admin or a
recipient), plus the audit trail. Pure TypeScript shared by every client.

**Boundary.** Depends on `@openmasq/schema` for shapes. The record kinds, scopes and
payload discriminators in `src/recordTypes.ts` / `src/orgScope/` are **wire literals**:
they are read back from other devices and must never change value, whatever the
identifier is called.

**Start here.** `src/records.ts` (the oplog merge), `src/vaultTerms.ts`, `src/userdata.ts`,
`src/orgScope/`.

---

# @openmasq/sync — la synchronisation entre appareils

La synchronisation chiffrée de bout en bout des enregistrements d'un utilisateur (oplog des
conversations, coffres, termes de coffre, compétences) et des **portées d'organisation**
(partages approuvés par un administrateur ou un destinataire), plus la piste d'audit. Du
TypeScript pur, partagé par tous les clients.

**Frontière.** Dépend de `@openmasq/schema` pour les formes. Les types d'enregistrement, les
portées et les discriminants de charge utile dans `src/recordTypes.ts` / `src/orgScope/` sont
des **littéraux de protocole** : ils sont relus depuis d'autres appareils et ne doivent jamais
changer de valeur, quel que soit le nom de l'identifiant.

**Commencez ici.** `src/records.ts` (la fusion de l'oplog), `src/vaultTerms.ts`,
`src/userdata.ts`, `src/orgScope/`.

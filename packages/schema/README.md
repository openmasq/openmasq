# @openmasq/schema — the persisted chat schema

<sub>**English** · [Français](#openmasqschema--le-schéma-de-chat-persisté)</sub>

`Role`, `Message`, `Conversation`, `RedactCategoryKey`: the shapes written to disk and
synced between devices. **Types only, zero runtime**, so the desktop and any other client
cannot drift from each other.

**Boundary.** A field here is a persisted key: add optional fields, never rename or
remove one without a migration on every reader.

---

# @openmasq/schema — le schéma de chat persisté

`Role`, `Message`, `Conversation`, `RedactCategoryKey` : les formes écrites sur le disque et
synchronisées entre appareils. **Des types seulement, zéro runtime**, pour que le bureau et
tout autre client ne puissent pas diverger.

**Frontière.** Un champ ici est une clé persistée : ajoutez des champs optionnels, n'en
renommez et n'en retirez jamais un sans une migration chez tous les lecteurs.

# @openmasq/schema — the persisted chat schema

`Role`, `Message`, `Conversation`, `RedactCategoryKey`: the shapes written to disk and
synced between devices. **Types only, zero runtime**, so the desktop and any other client
cannot drift from each other.

**Boundary.** A field here is a persisted key: add optional fields, never rename or
remove one without a migration on every reader.

# @openmasq/analytics — privacy-safe analytics core

Manual events only, allow-listed and sanitised (a walk that drops anything not in the
schema), behind a **double consent gate**, wrapped in the relay envelope. Zero
dependencies; the desktop supplies the transport.

**Start here.** `src/index.ts` — the event names and the sanitiser are the contract.

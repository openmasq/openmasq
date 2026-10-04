[Français](README.fr.md)

# @openmasq/desktop

**The OpenMasq desktop app, built with Electron.**

This is the app users install. The renderer mounts the interface from `@openmasq/ui` and
gives it a `Host`, the object through which the interface reaches the operating system,
the local database and the network. The main process does everything the interface cannot
do on its own. The package is private to the monorepo and is not published on npm.

## What's inside

- **Main process** (`src/main/`): startup in `src/main/index.ts`, IPC handlers in
  `src/main/ipc/`, the local database and its migrations in `src/main/db/`, connectors and
  tool gates in `src/main/mcp/`, the Python sandbox in `src/main/python/`.
- **Preload** (`src/preload/`): exposes the main-process API to the page as
  `window.openmasq`, through `contextBridge`.
- **Renderer** (`src/renderer/`): mounts `@openmasq/ui` and implements its `Host`, in
  `src/renderer/src/main.tsx`.
- **Build scripts** (`scripts/`): `buildDefines.ts` lists the service addresses a build can
  receive, none with a committed default. The exception is `publicServices.ts`, the public
  services every build reaches unless you set them empty.
- **End-to-end tests** (`e2e/`): Playwright specs that drive the built app against real
  providers. See [`e2e/README.md`](e2e/README.md).

## Develop

Run these from the repository root.

```bash
pnpm dev                                   # builds the packages, then launches the app
pnpm --filter @openmasq/desktop bake       # fetches the on-device models and runtimes, once
pnpm --filter @openmasq/desktop typecheck
pnpm build
```

`pnpm dev` talks to the same public services as an installed app. To point it at your
own, put overrides in `.env.development.local`, which git ignores. The variables are
listed in `.env.development`, and [`SELF_HOSTING.md`](../../SELF_HOSTING.md) covers the
full setup.

> [!WARNING]
> The e2e specs call real provider APIs and cost money. They are not part of `pnpm test`,
> and each spec skips itself when its key is missing.

> [!IMPORTANT]
> Every trust boundary of the product lives here: IPC handlers, child processes (`spawn`,
> `utilityProcess`), network egress, secrets at rest, the Python sandbox and the agent
> browser. The renderer is not trusted for security decisions, so a check made in the UI
> is made again in main. Read rule 7 of the root [`CLAUDE.md`](../../CLAUDE.md) before
> changing any of them.

[Français](README.fr.md)

# @openmasq/branding

**The single home of OpenMasq's brand values.**

`branding.json` holds the product name, slug, domains, deep-link scheme, bundle id, Sentry
host, Hugging Face organization and support address. Every value that reaches the runtime,
the network or the disk derives from it. The desktop app, the local proxy and most packages
(`ui`, `llm`, `mcp`, `catalog`, `connectors`, `sync`, `updates-manifest`) import it. The build
configuration (`apps/desktop/electron.vite.config.ts`) and the check scripts read the JSON
file directly.

## What's inside

- **`BRAND`**: the parsed `branding.json`, typed as `BrandConfig`.
- **`brandHost(sub?)`**: `brandHost("app")` gives `app.openmasq.com`.
- **`brandUrl(sub?, path?)`**: `brandUrl("app", "/invite")` gives
  `https://app.openmasq.com/invite`.
- **`brandKey(suffix)`**: a slug-prefixed key, `brandKey("device-id")` gives
  `openmasq-device-id`.
- **`brandHeader(suffix)`**: an HTTP header name, `brandHeader("sig")` gives
  `x-openmasq-sig`.
- **`@openmasq/branding/branding.json`**: the raw file, exported as a subpath.

## Develop

```bash
pnpm --filter @openmasq/branding build       # tsup → dist/
pnpm --filter @openmasq/branding typecheck
pnpm check:brand                             # fails if a retired brand name comes back
```

> [!WARNING]
> Many of these values are stored on installed machines or sent over the network: storage
> keys, signed headers, the deep-link scheme, the bundle id, the domains shipped clients
> call. Changing one rebrands the product and breaks compatibility with existing installs.

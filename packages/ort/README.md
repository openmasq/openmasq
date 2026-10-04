[Français](README.fr.md)

# @openmasq/ort

**onnxruntime with a WebAssembly fallback where no native binding exists.**

`onnxruntime-node` ships no native binding for Intel Macs. Without one, the local NER model
cannot start, and the app refuses to send. This package takes the place of
`onnxruntime-node` through a pnpm override in the root `package.json`, so the redaction
engine, the desktop app and the local proxy load it under that name. At runtime it uses the native binding
when there is one, and `onnxruntime-web` (WASM) otherwise.

## What's inside

- **`src/index.cjs`**: the implementation. It loads the native engine, falls back to WASM,
  and re-exports the engine with `OPENMASQ_ORT_BACKEND` (`"native"` or `"wasm"`).
- **`src/index.mjs`**: an ES module facade over it.
- **`src/index.d.ts`**: the types for the surface both entries share (`InferenceSession`,
  `Tensor`, `env`, `OPENMASQ_ORT_BACKEND`).

There is no build step.

## Develop

```bash
pnpm test packages/ort       # from the repository root
pnpm check:pkgtree           # checks the packaged dependency tree, this version included
```

> [!NOTE]
> The WASM fallback stays local and offline. It loads the `.wasm` files installed next to it,
> never from a CDN, and reads model weights from disk itself.

> [!IMPORTANT]
> The package `version` is the `onnxruntime-node` version it replaces (1.24.3). Raise it
> when you upgrade `ort-native`.

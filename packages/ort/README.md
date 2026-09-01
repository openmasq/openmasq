# @openmasq/ort — onnxruntime with a WASM fallback

Takes the place of `onnxruntime-node` (a pnpm override) and picks the engine at runtime:
the native binding where it exists, `onnxruntime-web` WASM where it does not (Intel Mac).
Three hand-written files, no build step.

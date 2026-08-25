/**
 * Sandboxed Python execution engine (desktop-main).
 *
 * A BUNDLED (packaged) / download-on-first-use (dev) CPython runtime (`ensureRuntime`)
 * + a jailed, egress-constrained runner (`runPython`) for model-generated code (plots
 * via matplotlib/seaborn, data via yfinance/requests). Exposed to the renderer via the
 * `python:run` IPC (`registerPythonIpc`) and surfaced to the model as the
 * `run_python` tool in the agentic loop (`@openmasq/ui` mcpAgent).
 */
export { ensureRuntime, runtimeDir, interpreterFor, type Progress } from "./runtime";
export { runPython, jailAvailability, type PythonResult, type Jail } from "./sandbox";
export { WHEELS, ALLOW_HOSTS } from "./wheels";
export { registerPythonIpc } from "./ipc";

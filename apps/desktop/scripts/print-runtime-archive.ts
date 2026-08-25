// Print the content-addressed archive name for the baked Python runtime, so CI names
// the R2 upload from the SAME source of truth the app uses (`runtimeSpec.ts`). Run via
// tsx: `tsx scripts/print-runtime-archive.ts <platform-arch>` (default darwin-arm64).
import { runtimeArchiveName } from "../src/main/python/runtimeSpec";

const target = process.argv[2] ?? "darwin-arm64";
const dash = target.lastIndexOf("-");
const platform = target.slice(0, dash);
const arch = target.slice(dash + 1);
process.stdout.write(runtimeArchiveName(platform, arch));

// Prints the triples shipped by a platform, space-separated — CI has no
// other way to read `electron-builder.cjs`, and copying the list into the workflow would
// make it diverge at the first arch addition (rule 9: one home, several readers).
//
// Usage: `tsx scripts/print-shipped-triples.ts [mac|win|linux]` (default: this machine).
import { currentBlock, shippedTriples } from "./shippedTriples";

process.stdout.write(shippedTriples(process.argv[2] ?? currentBlock()).join(" "));

// Imprime les triples expédiés par une plateforme, séparés par des espaces — la CI n'a pas
// d'autre façon de lire `electron-builder.cjs`, et recopier la liste dans le workflow la
// ferait diverger au premier ajout d'arche (règle 9 : une maison, plusieurs lecteurs).
//
// Usage : `tsx scripts/print-shipped-triples.ts [mac|win|linux]` (défaut : cette machine).
import { currentBlock, shippedTriples } from "./shippedTriples";

process.stdout.write(shippedTriples(process.argv[2] ?? currentBlock()).join(" "));

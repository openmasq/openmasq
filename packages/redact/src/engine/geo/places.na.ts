// North America — US (state = 2-letter) + Canada (province = 2-letter). Real city
// + a real ZIP / postal code + admin code. Seed data (hand-written).
import type { GeoPlace, ISO2 } from "./types";

export const NA_PLACES: Record<ISO2, GeoPlace[]> = {
  US: [
    { city: "New York", postal: "10001", region: "NY" }, { city: "Los Angeles", postal: "90001", region: "CA" }, { city: "Chicago", postal: "60601", region: "IL" }, { city: "Houston", postal: "77001", region: "TX" }, { city: "Phoenix", postal: "85001", region: "AZ" }, { city: "Philadelphia", postal: "19101", region: "PA" }, { city: "San Diego", postal: "92101", region: "CA" }, { city: "Dallas", postal: "75201", region: "TX" }, { city: "Austin", postal: "78701", region: "TX" }, { city: "San Francisco", postal: "94102", region: "CA" }, { city: "Boston", postal: "02108", region: "MA" }, { city: "Seattle", postal: "98101", region: "WA" }, { city: "Denver", postal: "80201", region: "CO" }, { city: "Miami", postal: "33101", region: "FL" }, { city: "Atlanta", postal: "30301", region: "GA" }, { city: "Portland", postal: "97201", region: "OR" }, { city: "Nashville", postal: "37201", region: "TN" }, { city: "Minneapolis", postal: "55401", region: "MN" }, { city: "Columbus", postal: "43201", region: "OH" }, { city: "Detroit", postal: "48201", region: "MI" },
  ],
  CA: [
    { city: "Toronto", postal: "M5H 2N2", region: "ON" }, { city: "Montréal", postal: "H2Y 1C6", region: "QC" }, { city: "Vancouver", postal: "V6B 1A1", region: "BC" }, { city: "Calgary", postal: "T2P 1J9", region: "AB" }, { city: "Ottawa", postal: "K1P 1J1", region: "ON" }, { city: "Edmonton", postal: "T5J 1N9", region: "AB" }, { city: "Québec", postal: "G1R 2L3", region: "QC" }, { city: "Winnipeg", postal: "R3C 1A5", region: "MB" }, { city: "Halifax", postal: "B3J 1S9", region: "NS" }, { city: "Victoria", postal: "V8W 1P6", region: "BC" },
  ],
};

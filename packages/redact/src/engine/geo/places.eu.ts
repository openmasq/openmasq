// Europe (non-FR) — real cities with a real postal code + admin region (Land /
// comunidad / regione / county / province). Seed data (hand-written). ~10-15 per
// country so a same-region swap is usually possible.
import type { GeoPlace, ISO2 } from "./types";

export const EU_PLACES: Record<ISO2, GeoPlace[]> = {
  DE: [
    { city: "Berlin", postal: "10115", region: "Berlin" }, { city: "München", postal: "80331", region: "Bayern" }, { city: "Hamburg", postal: "20095", region: "Hamburg" }, { city: "Köln", postal: "50667", region: "Nordrhein-Westfalen" }, { city: "Frankfurt", postal: "60311", region: "Hessen" }, { city: "Stuttgart", postal: "70173", region: "Baden-Württemberg" }, { city: "Düsseldorf", postal: "40210", region: "Nordrhein-Westfalen" }, { city: "Dortmund", postal: "44135", region: "Nordrhein-Westfalen" }, { city: "Leipzig", postal: "04109", region: "Sachsen" }, { city: "Dresden", postal: "01067", region: "Sachsen" }, { city: "Hannover", postal: "30159", region: "Niedersachsen" }, { city: "Nürnberg", postal: "90402", region: "Bayern" }, { city: "Bremen", postal: "28195", region: "Bremen" }, { city: "Mainz", postal: "55116", region: "Rheinland-Pfalz" },
  ],
  ES: [
    { city: "Madrid", postal: "28001", region: "Madrid" }, { city: "Barcelona", postal: "08001", region: "Cataluña" }, { city: "Valencia", postal: "46001", region: "Comunidad Valenciana" }, { city: "Sevilla", postal: "41001", region: "Andalucía" }, { city: "Zaragoza", postal: "50001", region: "Aragón" }, { city: "Málaga", postal: "29001", region: "Andalucía" }, { city: "Bilbao", postal: "48001", region: "País Vasco" }, { city: "Granada", postal: "18001", region: "Andalucía" }, { city: "Valladolid", postal: "47001", region: "Castilla y León" }, { city: "Murcia", postal: "30001", region: "Región de Murcia" }, { city: "Alicante", postal: "03001", region: "Comunidad Valenciana" }, { city: "Vigo", postal: "36201", region: "Galicia" }, { city: "Gijón", postal: "33201", region: "Asturias" },
  ],
  IT: [
    { city: "Roma", postal: "00118", region: "Lazio" }, { city: "Milano", postal: "20121", region: "Lombardia" }, { city: "Napoli", postal: "80121", region: "Campania" }, { city: "Torino", postal: "10121", region: "Piemonte" }, { city: "Palermo", postal: "90121", region: "Sicilia" }, { city: "Genova", postal: "16121", region: "Liguria" }, { city: "Bologna", postal: "40121", region: "Emilia-Romagna" }, { city: "Firenze", postal: "50121", region: "Toscana" }, { city: "Bari", postal: "70121", region: "Puglia" }, { city: "Catania", postal: "95121", region: "Sicilia" }, { city: "Venezia", postal: "30121", region: "Veneto" }, { city: "Verona", postal: "37121", region: "Veneto" }, { city: "Trieste", postal: "34121", region: "Friuli-Venezia Giulia" },
  ],
  GB: [
    { city: "London", postal: "EC1A 1BB", region: "England" }, { city: "Manchester", postal: "M1 1AE", region: "England" }, { city: "Birmingham", postal: "B1 1AA", region: "England" }, { city: "Leeds", postal: "LS1 1UR", region: "England" }, { city: "Liverpool", postal: "L1 8JQ", region: "England" }, { city: "Bristol", postal: "BS1 4DJ", region: "England" }, { city: "Sheffield", postal: "S1 2HE", region: "England" }, { city: "Nottingham", postal: "NG1 1AA", region: "England" }, { city: "Edinburgh", postal: "EH1 1BB", region: "Scotland" }, { city: "Glasgow", postal: "G1 1XW", region: "Scotland" }, { city: "Cardiff", postal: "CF10 1AA", region: "Wales" }, { city: "Belfast", postal: "BT1 1AA", region: "Northern Ireland" },
  ],
  NL: [
    { city: "Amsterdam", postal: "1011 AB", region: "Noord-Holland" }, { city: "Rotterdam", postal: "3011 AA", region: "Zuid-Holland" }, { city: "Den Haag", postal: "2511 AA", region: "Zuid-Holland" }, { city: "Utrecht", postal: "3511 AA", region: "Utrecht" }, { city: "Eindhoven", postal: "5611 AA", region: "Noord-Brabant" }, { city: "Groningen", postal: "9711 AA", region: "Groningen" }, { city: "Tilburg", postal: "5011 AA", region: "Noord-Brabant" }, { city: "Almere", postal: "1315 AA", region: "Flevoland" }, { city: "Breda", postal: "4811 AA", region: "Noord-Brabant" }, { city: "Nijmegen", postal: "6511 AA", region: "Gelderland" },
  ],
  BE: [
    { city: "Bruxelles", postal: "1000", region: "Bruxelles-Capitale" }, { city: "Antwerpen", postal: "2000", region: "Vlaanderen" }, { city: "Gent", postal: "9000", region: "Vlaanderen" }, { city: "Charleroi", postal: "6000", region: "Wallonie" }, { city: "Liège", postal: "4000", region: "Wallonie" }, { city: "Brugge", postal: "8000", region: "Vlaanderen" }, { city: "Namur", postal: "5000", region: "Wallonie" }, { city: "Leuven", postal: "3000", region: "Vlaanderen" }, { city: "Mons", postal: "7000", region: "Wallonie" }, { city: "Hasselt", postal: "3500", region: "Vlaanderen" },
  ],
  CH: [
    { city: "Zürich", postal: "8001", region: "Zürich" }, { city: "Genève", postal: "1201", region: "Genève" }, { city: "Basel", postal: "4001", region: "Basel-Stadt" }, { city: "Lausanne", postal: "1003", region: "Vaud" }, { city: "Bern", postal: "3001", region: "Bern" }, { city: "Winterthur", postal: "8400", region: "Zürich" }, { city: "Luzern", postal: "6003", region: "Luzern" }, { city: "Lugano", postal: "6900", region: "Ticino" }, { city: "Fribourg", postal: "1700", region: "Fribourg" }, { city: "Neuchâtel", postal: "2000", region: "Neuchâtel" },
  ],
  PT: [
    { city: "Lisboa", postal: "1000-001", region: "Lisboa" }, { city: "Porto", postal: "4000-001", region: "Porto" }, { city: "Braga", postal: "4700-001", region: "Braga" }, { city: "Coimbra", postal: "3000-001", region: "Coimbra" }, { city: "Faro", postal: "8000-001", region: "Faro" }, { city: "Aveiro", postal: "3800-001", region: "Aveiro" }, { city: "Setúbal", postal: "2900-001", region: "Setúbal" }, { city: "Funchal", postal: "9000-001", region: "Madeira" }, { city: "Évora", postal: "7000-001", region: "Évora" }, { city: "Leiria", postal: "2400-001", region: "Leiria" },
  ],
  AT: [
    { city: "Wien", postal: "1010", region: "Wien" }, { city: "Graz", postal: "8010", region: "Steiermark" }, { city: "Linz", postal: "4020", region: "Oberösterreich" }, { city: "Salzburg", postal: "5020", region: "Salzburg" }, { city: "Innsbruck", postal: "6020", region: "Tirol" }, { city: "Klagenfurt", postal: "9020", region: "Kärnten" }, { city: "Villach", postal: "9500", region: "Kärnten" }, { city: "Wels", postal: "4600", region: "Oberösterreich" }, { city: "Sankt Pölten", postal: "3100", region: "Niederösterreich" }, { city: "Dornbirn", postal: "6850", region: "Vorarlberg" },
  ],
  LU: [
    { city: "Luxembourg", postal: "1009", region: "Luxembourg" }, { city: "Esch-sur-Alzette", postal: "4001", region: "Esch-sur-Alzette" }, { city: "Differdange", postal: "4501", region: "Esch-sur-Alzette" }, { city: "Dudelange", postal: "3401", region: "Esch-sur-Alzette" }, { city: "Ettelbruck", postal: "9001", region: "Diekirch" },
  ],
  IE: [
    { city: "Dublin", postal: "D01 F5P2", region: "Leinster" }, { city: "Cork", postal: "T12 A2XR", region: "Munster" }, { city: "Limerick", postal: "V94 T2XA", region: "Munster" }, { city: "Galway", postal: "H91 XY2X", region: "Connacht" }, { city: "Waterford", postal: "X91 PK30", region: "Munster" }, { city: "Kilkenny", postal: "R95 XY2X", region: "Leinster" }, { city: "Sligo", postal: "F91 XY2X", region: "Connacht" },
  ],
};

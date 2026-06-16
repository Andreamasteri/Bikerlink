/**
 * Task #2527 — Registry centralizzato dei tipi di matching.
 *
 * Sorgente unica condivisa client+server. Aggiungere un nuovo tipo di match =
 * una riga in `MATCHING_REGISTRY`. Server route `admin/matching` legge da qui
 * (niente più array MATCH_TYPES hardcoded); il client ottiene la stessa lista
 * via `GET /api/admin/matching/registry`.
 *
 * Categorie:
 *  - "garage": match basati su preferenze garage (brand, tipo, distanza)
 *  - "biker":  match biker-biker (gps, percorso, eventi, musica, ecc.)
 *  - "club":   match con i motoclub
 *  - "affinity": affinity score (bio, music, route, time)  ← slot futuri
 *
 * Tabella `match_preferences` (vedi `shared/db/matching.ts`).
 * Tabella match concrete: `biker_biker_matches` / `biker_zavorrina_matches`.
 *
 * `brandPattern` è la clausola SQL applicata a `motorcycle_brand` per
 * estrarre i record di questo tipo. Per i tipi che non popolano la tabella
 * canonica (es. affinity futuri) `brandPattern` può essere undefined e
 * `table` può essere null → l'audit/registry restituisce 0 per `totalMatches`
 * ma li elenca comunque nell'UI.
 */
export type MatchingCategory = "garage" | "biker" | "club" | "affinity";

export interface MatchingTypeDef {
  id: number;
  key: string;
  label: string;
  category: MatchingCategory;
  /** Tabella SQL che contiene i record di questo tipo (null se non ancora popolata) */
  table: "biker_biker_matches" | "biker_zavorrina_matches" | null;
  /** Clausola WHERE applicata su `motorcycle_brand`. Se null/undefined → conteggio 0 */
  brandPattern: string | null;
  /** Nome colonna in `match_preferences` (snake_case) */
  prefColumn: string;
  /** Default value se l'utente non ha record in match_preferences */
  defaultEnabled: boolean;
  /** Riferimento al task che ha introdotto questo tipo */
  addedBy: string;
}

export const MATCHING_REGISTRY: ReadonlyArray<MatchingTypeDef> = [
  {
    id: 1,
    key: "bikerBikerBrand",
    label: "Biker-Biker Brand",
    category: "garage",
    table: "biker_biker_matches",
    brandPattern:
      "motorcycle_brand NOT LIKE '%:%' AND motorcycle_brand NOT IN ('musica','musica_zav','distanza','distanza_zav','eventi','base_intent') AND motorcycle_brand NOT LIKE 'gps_%' AND motorcycle_brand NOT LIKE 'zona_%' AND motorcycle_brand NOT LIKE 'percorso%'",
    prefColumn: "biker_biker_brand",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 2,
    key: "bikerZavorrinaBrand",
    label: "Biker-Zavorrina Brand",
    category: "garage",
    table: "biker_zavorrina_matches",
    brandPattern: "1=1",
    prefColumn: "biker_zavorrina_brand",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 3,
    key: "bikerClubBrand",
    label: "Biker-Club Brand",
    category: "club",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand LIKE 'club:%' AND motorcycle_brand NOT LIKE 'club_zav:%'",
    prefColumn: "biker_club_brand",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 4,
    key: "zavorrinaClubBrand",
    label: "Zavorrina-Club Brand",
    category: "club",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand LIKE 'club_zav:%'",
    prefColumn: "zavorrina_club_brand",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 5,
    key: "bikerBikerTypeStyle",
    label: "Biker-Biker Type+Style",
    category: "garage",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand LIKE 'tipo:%' AND motorcycle_brand NOT LIKE 'tipo_zav:%'",
    prefColumn: "biker_biker_type_style",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 6,
    key: "bikerZavorrinaTypeStyle",
    label: "Biker-Zavorrina Type+Style",
    category: "garage",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand LIKE 'tipo_zav:%'",
    prefColumn: "biker_zavorrina_type_style",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 7,
    key: "bikerBikerDistance",
    label: "Biker-Biker Distance",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand = 'distanza'",
    prefColumn: "biker_biker_distance",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 8,
    key: "bikerZavorrinaDistance",
    label: "Biker-Zavorrina Distance",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand = 'distanza_zav'",
    prefColumn: "biker_zavorrina_distance",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 9,
    key: "bikerBikerMusic",
    label: "Biker-Biker Music Affinity",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand = 'musica'",
    prefColumn: "biker_biker_music",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 10,
    key: "bikerZavorrinaMusic",
    label: "Biker-Zavorrina Music Affinity",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand = 'musica_zav'",
    prefColumn: "biker_zavorrina_music",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 11,
    key: "bikerBikerLeanAngle",
    label: "Biker-Biker Lean Angle (GPS)",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand IN ('gps_tilt', 'gps_full')",
    prefColumn: "biker_biker_lean_angle",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 12,
    key: "bikerBikerRouteTypeZone",
    label: "Biker-Biker Route Type+Zone",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand LIKE 'zona_bb:%' OR motorcycle_brand LIKE 'percorso:%'",
    prefColumn: "biker_biker_route_type_zone",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 13,
    key: "bikerZavorrinaRouteTypeZone",
    label: "Biker-Zavorrina Route Type+Zone",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand LIKE 'zona_zav:%' OR motorcycle_brand LIKE 'percorso_zav:%'",
    prefColumn: "biker_zavorrina_route_type_zone",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 14,
    key: "bikerBikerAvgSpeed",
    label: "Biker-Biker Avg Speed (GPS)",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand IN ('gps_speed', 'gps_full')",
    prefColumn: "biker_biker_avg_speed",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 15,
    key: "bikerBikerAvgDuration",
    label: "Biker-Biker Avg Duration (GPS)",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand IN ('gps_speed', 'gps_full')",
    prefColumn: "biker_biker_avg_duration",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 16,
    key: "bikerBikerDayTime",
    label: "Biker-Biker Day+Time (GPS)",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand IN ('gps_day', 'gps_full')",
    prefColumn: "biker_biker_day_time",
    defaultEnabled: true,
    addedBy: "core",
  },
  {
    id: 17,
    key: "bikerBikerEvents",
    label: "Biker-Biker Events",
    category: "biker",
    table: "biker_biker_matches",
    brandPattern: "motorcycle_brand = 'eventi'",
    prefColumn: "biker_biker_events",
    defaultEnabled: true,
    addedBy: "core",
  },
  // ── Slot affinity (Task #2515/#2516/#2520/#2521) ────────────────────────
  // I matcher dedicati popolano tabelle proprie (es. music_affinity_matches);
  // qui esponiamo solo la preferenza per l'UI admin + audit colonne.
  {
    id: 18,
    key: "routeAffinity",
    label: "Route Affinity (#2520)",
    category: "affinity",
    table: null,
    brandPattern: null,
    prefColumn: "route_affinity",
    defaultEnabled: true,
    addedBy: "#2520",
  },
  {
    id: 19,
    key: "musicAffinity",
    label: "Music Affinity (#2516)",
    category: "affinity",
    table: null,
    brandPattern: null,
    prefColumn: "music_affinity",
    defaultEnabled: true,
    addedBy: "#2516",
  },
  {
    id: 20,
    key: "bioAffinity",
    label: "Bio Affinity (#2515)",
    category: "affinity",
    table: null,
    brandPattern: null,
    prefColumn: "bio_affinity",
    defaultEnabled: true,
    addedBy: "#2515",
  },
  {
    id: 21,
    key: "timeOverlap",
    label: "Time Overlap (#2521)",
    category: "affinity",
    table: null,
    brandPattern: null,
    prefColumn: "time_overlap",
    defaultEnabled: true,
    addedBy: "#2521",
  },
  {
    id: 22,
    key: "plannedRouteInvite",
    label: "Planned Route Invite (#2528)",
    category: "affinity",
    table: null,
    brandPattern: null,
    prefColumn: "planned_route_invite",
    defaultEnabled: true,
    addedBy: "#2528",
  },
  {
    id: 23,
    key: "telemetryAffinity",
    label: "Telemetry Affinity (#3393)",
    category: "affinity",
    table: null,
    brandPattern: null,
    prefColumn: "telemetry_affinity",
    defaultEnabled: true,
    addedBy: "#3393",
  },
  {
    id: 24,
    key: "bikerZavorrinaBase",
    label: "BZ Base",
    category: "garage",
    table: "biker_biker_matches",
    brandPattern: "pair_type = 'bz' AND motorcycle_brand = 'base_intent'",
    prefColumn: "biker_zavorrina_brand",
    defaultEnabled: true,
    addedBy: "#3917",
  },
];

/**
 * Tipi che popolano una tabella SQL (utili per query di conteggio).
 * Esclude gli slot affinity (table=null).
 */
export function getCountableMatchingTypes(): MatchingTypeDef[] {
  return MATCHING_REGISTRY.filter((t) => t.table !== null && t.brandPattern !== null);
}

/**
 * Colonne preference attese in `match_preferences`.
 * Usato dall'audit + dallo script `check-match-preferences-sync.ts`.
 */
export function getRegistryPrefColumns(): string[] {
  return MATCHING_REGISTRY.map((t) => t.prefColumn).filter((c): c is string => c !== null && c !== undefined);
}

/** Look-up helpers */
export function getMatchingTypeByKey(key: string): MatchingTypeDef | undefined {
  return MATCHING_REGISTRY.find((t) => t.key === key);
}

export function getMatchingTypeById(id: number): MatchingTypeDef | undefined {
  return MATCHING_REGISTRY.find((t) => t.id === id);
}

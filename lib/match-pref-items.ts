export type MatchPrefsPayload = {
  bikerBikerBrand: boolean;
  bikerZavorrinaBrand: boolean;
  bikerClubBrand: boolean;
  zavorrinaClubBrand: boolean;
  bikerBikerTypeStyle: boolean;
  bikerZavorrinaTypeStyle: boolean;
  bikerBikerDistance: boolean;
  bikerZavorrinaDistance: boolean;
  bikerBikerMusic: boolean;
  bikerZavorrinaMusic: boolean;
  bikerBikerLeanAngle: boolean;
  bikerBikerRouteTypeZone: boolean;
  bikerZavorrinaRouteTypeZone: boolean;
  bikerBikerAvgSpeed: boolean;
  bikerBikerAvgDuration: boolean;
  bikerBikerDayTime: boolean;
  bikerBikerEvents: boolean;
  routeAffinity: boolean;
  bioAffinity: boolean;
  musicAffinity: boolean;
  telemetryAffinity: boolean;
  timeOverlap: boolean;
  directMatch: boolean;
  plannedRouteInvite: boolean;
  topMatchesOnly: boolean;
  weeklyRecap: boolean;
};

export const DEFAULT_MATCH_PREFS: MatchPrefsPayload = {
  bikerBikerBrand: true,
  bikerZavorrinaBrand: true,
  bikerClubBrand: true,
  zavorrinaClubBrand: true,
  bikerBikerTypeStyle: true,
  bikerZavorrinaTypeStyle: true,
  bikerBikerDistance: true,
  bikerZavorrinaDistance: true,
  bikerBikerMusic: true,
  bikerZavorrinaMusic: true,
  bikerBikerLeanAngle: true,
  bikerBikerRouteTypeZone: true,
  bikerZavorrinaRouteTypeZone: true,
  bikerBikerAvgSpeed: true,
  bikerBikerAvgDuration: true,
  bikerBikerDayTime: true,
  bikerBikerEvents: true,
  routeAffinity: true,
  bioAffinity: true,
  musicAffinity: true,
  telemetryAffinity: true,
  timeOverlap: true,
  directMatch: true,
  plannedRouteInvite: true,
  topMatchesOnly: false,
  weeklyRecap: true,
};

export const MATCH_PREF_ITEMS: { key: keyof MatchPrefsPayload; label: string }[] = [
  { key: "bikerBikerBrand", label: "Biker ↔ Biker — Marca moto" },
  { key: "bikerZavorrinaBrand", label: "Biker ↔ Zavorra — Marca moto" },
  { key: "bikerClubBrand", label: "Biker ↔ Club — Marca moto" },
  { key: "zavorrinaClubBrand", label: "Zavorra ↔ Club — Marca moto" },
  { key: "bikerBikerTypeStyle", label: "Biker ↔ Biker — Tipo + Stile guida" },
  { key: "bikerZavorrinaTypeStyle", label: "Biker ↔ Zavorra — Tipo + Stile guida" },
  { key: "bikerBikerDistance", label: "Biker ↔ Biker — Distanza giro" },
  { key: "bikerZavorrinaDistance", label: "Biker ↔ Zavorra — Distanza giro" },
  { key: "bikerBikerMusic", label: "Biker ↔ Biker — Musica (≥65%)" },
  { key: "bikerZavorrinaMusic", label: "Biker ↔ Zavorra — Musica (≥65%)" },
  { key: "bikerBikerLeanAngle", label: "Biker ↔ Biker — Angolo piega" },
  { key: "bikerBikerRouteTypeZone", label: "Biker ↔ Biker — Tipo + Zona percorso" },
  { key: "bikerZavorrinaRouteTypeZone", label: "Biker ↔ Zavorra — Tipo + Zona percorso" },
  { key: "bikerBikerAvgSpeed", label: "Biker ↔ Biker — Velocità media" },
  { key: "bikerBikerAvgDuration", label: "Biker ↔ Biker — Durata media uscita" },
  { key: "bikerBikerDayTime", label: "Biker ↔ Biker — Giorno/Fascia oraria" },
  { key: "bikerBikerEvents", label: "Biker ↔ Biker — Raduni frequentati" },
  { key: "routeAffinity", label: "Biker ↔ Biker — Similarità percorsi GPS" },
  { key: "bioAffinity", label: "Biker ↔ Biker — Affinità bio (testo libero)" },
  { key: "musicAffinity", label: "Biker ↔ Biker — Affinità musicale (combinata)" },
  { key: "telemetryAffinity", label: "Biker ↔ Biker — Stile di guida simile (telemetria)" },
  { key: "timeOverlap", label: "Biker ↔ Biker — Sovrapposizione fasce orarie" },
  { key: "directMatch", label: "Match Diretto (Richiedi Match)" },
  { key: "plannedRouteInvite", label: "Invito Percorso Pianificato" },
];

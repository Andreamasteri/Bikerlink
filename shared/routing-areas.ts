// =============================================================================
// BikerLink — Registro gruppi-area di routing (contratto condiviso)
//
// Questo file è la FONTE DI VERITÀ del sistema di routing "ad aree regionali":
// l'Europa è divisa in gruppi di nazioni, ognuno servito da una propria istanza
// GraphHopper self-hosted sul ThinkCentre (vedi infra/self-host/).
//
// È un contratto CONDIVISO consumato da:
//   - il server app (Task B "Server + Toggle") per scegliere l'istanza giusta
//     in base alle coordinate della richiesta e leggere/scrivere lo stato attivo;
//   - la UI admin (Task C) per mostrare/abilitare i gruppi.
//
// ⚠️ SINCRONIZZAZIONE INFRA — i campi `codice` e `portaInterna` qui DEVONO
// combaciare con:
//   - infra/self-host/docker-compose.yml          (servizi graphhopper-<codice>)
//   - infra/self-host/build-regions.sh            (build dei grafi)
//   - infra/self-host/download-regions.sh         (download/merge dei .pbf)
//   - infra/self-host/expose/nginx-bikerlink.conf (location /areas/<codice>/)
// Gli script bash NON importano questo TS: tengono una copia parallela dei dati.
// Se cambi codici/porte qui, aggiorna anche quei file.
// =============================================================================

/** Codici stabili dei gruppi-area. NON rinominare: usati come chiave DB/URL. */
export type RoutingAreaCode =
  | "grecia"
  | "balcani"
  | "est"
  | "iberia"
  | "arco-alpino"
  | "germania-centro"
  | "francia-benelux"
  | "ecuador";

/**
 * Fascia operativa del gruppo:
 *  - "core"      → area di guida principale, tipicamente sempre attiva;
 *  - "on-demand" → area di nicchia, accesa solo quando serve (libera RAM).
 */
export type RoutingAreaTier = "core" | "on-demand";

/** Bounding box geografico (gradi WGS84). */
export interface RoutingAreaBBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/** Nazione appartenente a un gruppo-area. */
export interface RoutingAreaCountry {
  /** Codice ISO 3166-1 alpha-2 (es. "IT"). */
  iso: string;
  /** Nome leggibile in italiano. */
  nome: string;
  /** Slug Geofabrik per il download (europe/<slug>-latest.osm.pbf). */
  geofabrik: string;
}

/** Definizione completa di un gruppo-area di routing. */
export interface RoutingArea {
  /** Codice stabile (chiave DB/URL). */
  codice: RoutingAreaCode;
  /** Nome leggibile per la UI. */
  nome: string;
  /** Nazioni coperte dal gruppo. */
  nazioni: RoutingAreaCountry[];
  /** Bounding box complessivo (unione delle nazioni) per il match per-coordinata. */
  bbox: RoutingAreaBBox;
  /** Porta interna dell'istanza GraphHopper sul ThinkCentre. */
  portaInterna: number;
  /** Path pubblico dietro il reverse proxy (es. "/areas/grecia"). */
  path: string;
  /** Fascia operativa. */
  tier: RoutingAreaTier;
  /**
   * Stato abilitato di DEFAULT (seed). A runtime lo stato reale è gestito dal
   * toggle DB/admin (Task B/C): questo è solo il valore iniziale di semina.
   */
  abilitatoDefault: boolean;
  /** Dimensione approssimativa del .pbf unito (GB), solo informativa/docs. */
  pbfApproxGb: number;
  /** Heap JVM consigliato in serving (MB). Grafi grandi → 4096, piccoli → 2048. */
  serveHeapMb: number;
}

/**
 * Registro dei gruppi-area. L'ordine va dal più piccolo al più grande
 * (stesso ordine di build consigliato in infra/self-host).
 */
export const ROUTING_AREAS: RoutingArea[] = [
  {
    codice: "grecia",
    nome: "Grecia",
    nazioni: [
      { iso: "GR", nome: "Grecia", geofabrik: "greece" },
      { iso: "AL", nome: "Albania", geofabrik: "albania" },
    ],
    bbox: { minLon: 19.2, minLat: 34.8, maxLon: 28.3, maxLat: 42.7 },
    portaInterna: 8990,
    path: "/areas/grecia",
    tier: "core",
    abilitatoDefault: true,
    pbfApproxGb: 0.6,
    serveHeapMb: 2048,
  },
  {
    codice: "balcani",
    nome: "Balcani",
    nazioni: [
      { iso: "HR", nome: "Croazia", geofabrik: "croatia" },
      { iso: "BA", nome: "Bosnia ed Erzegovina", geofabrik: "bosnia-herzegovina" },
      { iso: "ME", nome: "Montenegro", geofabrik: "montenegro" },
      { iso: "RS", nome: "Serbia", geofabrik: "serbia" },
      { iso: "MK", nome: "Macedonia del Nord", geofabrik: "macedonia" },
      { iso: "AL", nome: "Albania", geofabrik: "albania" },
    ],
    bbox: { minLon: 13.4, minLat: 39.6, maxLon: 23.0, maxLat: 46.6 },
    portaInterna: 8991,
    path: "/areas/balcani",
    tier: "core",
    abilitatoDefault: true,
    pbfApproxGb: 1.5,
    serveHeapMb: 2048,
  },
  {
    codice: "est",
    nome: "Europa dell'Est",
    nazioni: [
      { iso: "RO", nome: "Romania", geofabrik: "romania" },
      { iso: "HU", nome: "Ungheria", geofabrik: "hungary" },
      { iso: "BG", nome: "Bulgaria", geofabrik: "bulgaria" },
    ],
    bbox: { minLon: 16.1, minLat: 41.2, maxLon: 29.7, maxLat: 48.6 },
    portaInterna: 8992,
    path: "/areas/est",
    tier: "on-demand",
    abilitatoDefault: false,
    pbfApproxGb: 1.5,
    serveHeapMb: 2048,
  },
  {
    codice: "iberia",
    nome: "Iberia",
    nazioni: [
      { iso: "ES", nome: "Spagna", geofabrik: "spain" },
      { iso: "PT", nome: "Portogallo", geofabrik: "portugal" },
    ],
    bbox: { minLon: -9.6, minLat: 35.9, maxLon: 4.4, maxLat: 43.9 },
    portaInterna: 8993,
    path: "/areas/iberia",
    tier: "core",
    abilitatoDefault: true,
    pbfApproxGb: 1.8,
    serveHeapMb: 2048,
  },
  {
    codice: "arco-alpino",
    nome: "Arco Alpino",
    nazioni: [
      { iso: "IT", nome: "Italia", geofabrik: "italy" },
      { iso: "AT", nome: "Austria", geofabrik: "austria" },
      { iso: "CH", nome: "Svizzera", geofabrik: "switzerland" },
      { iso: "SI", nome: "Slovenia", geofabrik: "slovenia" },
    ],
    bbox: { minLon: 5.9, minLat: 35.4, maxLon: 18.6, maxLat: 49.0 },
    portaInterna: 8994,
    path: "/areas/arco-alpino",
    tier: "core",
    abilitatoDefault: true,
    pbfApproxGb: 3.6,
    serveHeapMb: 4096,
  },
  {
    codice: "germania-centro",
    nome: "Germania e Centro Europa",
    nazioni: [
      { iso: "DE", nome: "Germania", geofabrik: "germany" },
      { iso: "CZ", nome: "Repubblica Ceca", geofabrik: "czech-republic" },
    ],
    bbox: { minLon: 5.8, minLat: 47.2, maxLon: 18.9, maxLat: 55.1 },
    portaInterna: 8995,
    path: "/areas/germania-centro",
    tier: "on-demand",
    abilitatoDefault: false,
    pbfApproxGb: 5.2,
    serveHeapMb: 4096,
  },
  {
    codice: "francia-benelux",
    nome: "Francia e Benelux",
    nazioni: [
      { iso: "FR", nome: "Francia", geofabrik: "france" },
      { iso: "BE", nome: "Belgio", geofabrik: "belgium" },
      { iso: "NL", nome: "Paesi Bassi", geofabrik: "netherlands" },
      { iso: "LU", nome: "Lussemburgo", geofabrik: "luxembourg" },
    ],
    bbox: { minLon: -5.2, minLat: 41.3, maxLon: 9.6, maxLat: 53.7 },
    portaInterna: 8996,
    path: "/areas/francia-benelux",
    tier: "on-demand",
    abilitatoDefault: false,
    pbfApproxGb: 6.7,
    serveHeapMb: 4096,
  },
  {
    codice: "ecuador",
    nome: "Ecuador",
    nazioni: [
      { iso: "EC", nome: "Ecuador", geofabrik: "ecuador" },
    ],
    bbox: { minLon: -92.0, minLat: -5.1, maxLon: -75.0, maxLat: 1.7 },
    portaInterna: 8997,
    path: "/areas/ecuador",
    tier: "on-demand",
    abilitatoDefault: false,
    pbfApproxGb: 0.1,
    serveHeapMb: 2048,
  },
];

/** Mappa codice → gruppo, per lookup O(1). */
export const ROUTING_AREAS_BY_CODE: Record<RoutingAreaCode, RoutingArea> =
  ROUTING_AREAS.reduce((acc, area) => {
    acc[area.codice] = area;
    return acc;
  }, {} as Record<RoutingAreaCode, RoutingArea>);

/** Restituisce il gruppo dato il codice (o undefined se sconosciuto). */
export function getRoutingArea(codice: string): RoutingArea | undefined {
  return ROUTING_AREAS_BY_CODE[codice as RoutingAreaCode];
}

/** Vero se la coordinata cade dentro il bounding box del gruppo. */
export function isInRoutingArea(
  area: RoutingArea,
  lat: number,
  lon: number,
): boolean {
  const { minLon, minLat, maxLon, maxLat } = area.bbox;
  return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
}

/**
 * Tutti i gruppi il cui bbox contiene la coordinata. Più gruppi possono
 * combaciare nelle zone di confine (es. Albania è in "grecia" e "balcani"):
 * l'ordine segue ROUTING_AREAS (dal più piccolo), così il primo risultato è
 * il candidato più stretto.
 */
export function findRoutingAreasForPoint(
  lat: number,
  lon: number,
): RoutingArea[] {
  return ROUTING_AREAS.filter((area) => isInRoutingArea(area, lat, lon));
}

/**
 * Costruisce l'URL pubblico dell'istanza GraphHopper di un gruppo a partire
 * dalla base (es. `https://gh.bikerlink.duckdns.org`).
 * Esempio risultato: `https://gh.bikerlink.duckdns.org/areas/grecia`.
 */
export function routingAreaUrl(area: RoutingArea, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${area.path}`;
}

// =============================================================================
// Esiti tipizzati del routing ad aree (contratto server ⇄ frontend)
//
// Quando il routing ad aree è attivo, una richiesta può non essere servibile da
// una singola istanza per-area. In quel caso il server risponde 422 con
// `{ code, message }`: il codice è stabile (machine-readable, in lockstep con il
// frontend), il messaggio è la stringa amichevole in italiano già pronta da
// mostrare all'utente. Tenere codici e messaggi qui evita divergenze.
// =============================================================================

/** Codici stabili degli esiti bloccanti del routing ad aree. */
export const ROUTING_AREA_OUTCOMES = {
  /** I waypoint non condividono una singola area: rotta tra gruppi diversi. */
  CROSS_GROUP: "cross_group",
  /** L'area del punto di partenza non è (ancora) abilitata/coperta. */
  AREA_NOT_ENABLED: "area_not_enabled",
} as const;

export type RoutingAreaOutcomeCode =
  (typeof ROUTING_AREA_OUTCOMES)[keyof typeof ROUTING_AREA_OUTCOMES];

/** Messaggi utente (italiano) associati a ciascun esito bloccante. */
export const ROUTING_AREA_OUTCOME_MESSAGES: Record<RoutingAreaOutcomeCode, string> = {
  [ROUTING_AREA_OUTCOMES.CROSS_GROUP]:
    "Questo percorso attraversa più aree regionali: per ora puoi pianificare un giro solo all'interno di una singola area.",
  [ROUTING_AREA_OUTCOMES.AREA_NOT_ENABLED]:
    "Il routing non è ancora disponibile nel tuo paese: stiamo ampliando la copertura, riprova presto.",
};

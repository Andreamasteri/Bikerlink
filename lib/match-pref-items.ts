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

export type MatchPrefSection =
  | "Moto"
  | "Stile di guida"
  | "Percorsi"
  | "Musica & Bio"
  | "Fascia oraria"
  | "Connessioni"
  | "Notifiche";

export const MATCH_PREF_SECTIONS: MatchPrefSection[] = [
  "Moto",
  "Stile di guida",
  "Percorsi",
  "Musica & Bio",
  "Fascia oraria",
  "Connessioni",
  "Notifiche",
];

export const MATCH_PREF_ITEMS: {
  key: keyof MatchPrefsPayload;
  label: string;
  description?: string;
  section: MatchPrefSection;
}[] = [
  {
    key: "bikerBikerBrand",
    section: "Moto",
    label: "Biker ↔ Biker — Marca moto",
    description: "Considera la marca della moto nel matching tra biker. Disattivando, la marca non influenza il punteggio di compatibilità tra biker.",
  },
  {
    key: "bikerZavorrinaBrand",
    section: "Moto",
    label: "Biker ↔ Zavorra — Marca moto",
    description: "Considera la marca della moto nel matching tra biker e zavorra. Disattivando, la marca non influenza il punteggio di compatibilità con le zavorrine.",
  },
  {
    key: "bikerClubBrand",
    section: "Moto",
    label: "Biker ↔ Club — Marca moto",
    description: "Considera la marca della moto per suggerire club compatibili al biker. Disattivando, i club non vengono filtrati per marca.",
  },
  {
    key: "zavorrinaClubBrand",
    section: "Moto",
    label: "Zavorra ↔ Club — Marca moto",
    description: "Considera la marca della moto per suggerire club compatibili alla zavorra. Disattivando, i club non vengono filtrati per marca.",
  },
  {
    key: "bikerBikerTypeStyle",
    section: "Moto",
    label: "Biker ↔ Biker — Tipo + Stile guida",
    description: "Usa il tipo di moto e lo stile di guida per abbinare biker simili. Disattivando, questi criteri non influenzano il match tra biker.",
  },
  {
    key: "bikerZavorrinaTypeStyle",
    section: "Moto",
    label: "Biker ↔ Zavorra — Tipo + Stile guida",
    description: "Usa il tipo di moto e lo stile di guida per abbinare biker e zavorra. Disattivando, questi criteri non influenzano il match con le zavorrine.",
  },
  {
    key: "bikerBikerLeanAngle",
    section: "Stile di guida",
    label: "Biker ↔ Biker — Angolo piega",
    description: "Usa i dati di piega telemetrica per abbinare biker con stile di guida simile in curva. Disattivando, l'angolo di piega non contribuisce al match.",
  },
  {
    key: "bikerBikerAvgSpeed",
    section: "Stile di guida",
    label: "Biker ↔ Biker — Velocità media",
    description: "Abbina biker con velocità medie simili rilevate dalla telemetria. Disattivando, la velocità di crociera non viene considerata nel match.",
  },
  {
    key: "bikerBikerAvgDuration",
    section: "Stile di guida",
    label: "Biker ↔ Biker — Durata media uscita",
    description: "Confronta la durata tipica delle uscite in moto. Disattivando, la durata del giro non influenza il punteggio di compatibilità.",
  },
  {
    key: "telemetryAffinity",
    section: "Stile di guida",
    label: "Biker ↔ Biker — Stile di guida simile (telemetria)",
    description: "Usa i dati di telemetria (accelerazione, frenata, piega) per abbinare biker con stile di guida affine. Disattivando, la telemetria non viene usata per il calcolo dell'affinità.",
  },
  {
    key: "bikerBikerDistance",
    section: "Percorsi",
    label: "Biker ↔ Biker — Distanza giro",
    description: "Confronta la distanza media dei giri per abbinare biker con abitudini simili. Disattivando, la lunghezza del percorso non viene considerata nel match.",
  },
  {
    key: "bikerZavorrinaDistance",
    section: "Percorsi",
    label: "Biker ↔ Zavorra — Distanza giro",
    description: "Confronta la distanza media dei giri tra biker e zavorra. Disattivando, la lunghezza del percorso non viene considerata nel match con le zavorrine.",
  },
  {
    key: "bikerBikerRouteTypeZone",
    section: "Percorsi",
    label: "Biker ↔ Biker — Tipo + Zona percorso",
    description: "Confronta il tipo di strada preferito (montagna, costa, pianura) e la zona geografica dei percorsi. Disattivando, questi criteri non influenzano il match tra biker.",
  },
  {
    key: "bikerZavorrinaRouteTypeZone",
    section: "Percorsi",
    label: "Biker ↔ Zavorra — Tipo + Zona percorso",
    description: "Confronta il tipo di strada e la zona geografica tra biker e zavorra. Disattivando, questi criteri non influenzano il match con le zavorrine.",
  },
  {
    key: "routeAffinity",
    section: "Percorsi",
    label: "Biker ↔ Biker — Similarità percorsi GPS",
    description: "Confronta le tracce GPS salvate per trovare biker che percorrono strade simili. Disattivando, la sovrapposizione geografica dei percorsi non viene considerata.",
  },
  {
    key: "bikerBikerMusic",
    section: "Musica & Bio",
    label: "Biker ↔ Biker — Musica (≥65%)",
    description: "Abbina biker con almeno il 65% di affinità musicale. Disattivando, i gusti musicali non influenzano il punteggio di compatibilità.",
  },
  {
    key: "bikerZavorrinaMusic",
    section: "Musica & Bio",
    label: "Biker ↔ Zavorra — Musica (≥65%)",
    description: "Abbina biker e zavorra con almeno il 65% di affinità musicale. Disattivando, i gusti musicali non influenzano il match con le zavorrine.",
  },
  {
    key: "musicAffinity",
    section: "Musica & Bio",
    label: "Biker ↔ Biker — Affinità musicale (combinata)",
    description: "Combina generi, artisti e playlist per calcolare un punteggio musicale complessivo. Disattivando, l'affinità musicale combinata non contribuisce al match.",
  },
  {
    key: "bioAffinity",
    section: "Musica & Bio",
    label: "Biker ↔ Biker — Affinità bio (testo libero)",
    description: "Analizza il testo della bio del profilo per trovare interessi e passioni in comune. Disattivando, il contenuto della bio non influenza il punteggio di compatibilità.",
  },
  {
    key: "bikerBikerDayTime",
    section: "Fascia oraria",
    label: "Biker ↔ Biker — Giorno/Fascia oraria",
    description: "Abbina biker che escono negli stessi giorni e fasce orarie della settimana. Disattivando, giorno e orario preferito non influenzano il match.",
  },
  {
    key: "timeOverlap",
    section: "Fascia oraria",
    label: "Biker ↔ Biker — Sovrapposizione fasce orarie",
    description: "Attiva il match basato sulla sovrapposizione degli orari abituali di uscita. Disattivando questa opzione non comparirai nei risultati per compatibilità di fascia oraria.",
  },
  {
    key: "bikerBikerEvents",
    section: "Fascia oraria",
    label: "Biker ↔ Biker — Raduni frequentati",
    description: "Considera i raduni e gli eventi moto frequentati per trovare biker con interessi comuni. Disattivando, la partecipazione agli eventi non contribuisce al match.",
  },
  {
    key: "directMatch",
    section: "Connessioni",
    label: "Match Diretto (Richiedi Match)",
    description: "Consenti ad altri biker di inviarti una richiesta di match diretto. Disattivando, non riceverai richieste di match e non sarai visibile nelle ricerche dirette.",
  },
  {
    key: "plannedRouteInvite",
    section: "Connessioni",
    label: "Invito Percorso Pianificato",
    description: "Ricevi inviti a giri pianificati da biker compatibili con il tuo profilo. Disattivando non riceverai notifiche per percorsi condivisi da altri biker.",
  },
  {
    key: "topMatchesOnly",
    section: "Notifiche",
    label: "Solo match top",
    description: "Ricevi push solo per Supermatch o match prioritari (le altre confluiscono nei digest).",
  },
  {
    key: "weeklyRecap",
    section: "Notifiche",
    label: "Recap settimanale",
    description: "Ogni lunedì alle 9:00 ricevi una push con i tuoi 5 migliori match della settimana.",
  },
];

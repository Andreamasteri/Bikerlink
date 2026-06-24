# Business Reach — Nota privacy (Task #4818)

Pilota "Business Reach" (locali + concessionarie). Questa nota documenta la
garanzia di **aggregazione** e l'**assunzione di consenso** del pilota.

## Garanzia: solo dati aggregati

Nessuna traccia individuale di rider è mai esposta a un business o nel report admin.

- **Passaggi qualificati** (`business_passage_stats`): calcolati da `ride_telemetry`
  con `COUNT(DISTINCT user_id || ':' || session_id)` (passaggi) e
  `COUNT(DISTINCT user_id)` (rider unici). In tabella si persistono **solo i
  conteggi** (`qualified_passages`, `unique_riders`, `radius_m`): nessuna
  coordinata, nessun `user_id`, nessun timestamp per-rider.
- **Click di conversione** (`business_clicks`): il `user_id` è salvato solo per
  dedup/audit interno ed è `ON DELETE SET NULL`. Il report
  (`getBusinessReport`) raggruppa per `actionType` e restituisce **solo i
  conteggi** (`clicks`, `clicksByAction`); il `user_id` non viene mai
  selezionato né esposto.
- Filtri "passaggio qualificato": raggio configurabile
  (`business_reach_radius_m`, default 150 m) + velocità massima
  (`business_reach_max_speed_kmh`, default 60 km/h) per escludere i flyby ad alta
  velocità. Configurabili dalla sezione admin Marketing.

## Assunzione di consenso

Il calcolo riusa la telemetria di guida (`ride_telemetry`) già raccolta per le
funzioni di tracking/percorsi dell'app. Il pilota **assume** che la
geolocalizzazione sia già coperta dal consenso esistente dell'utente, in quanto:

1. i dati vengono usati **solo in forma aggregata** (conteggi), senza profilazione
   né esposizione di tracce individuali;
2. nessun nuovo dato personale viene raccolto rispetto a quanto già acquisito.

**Da integrare (segnalazione, non implementato qui):** se per la finalità
statistica/commerciale di "Business Reach" è richiesto un consenso esplicito e
distinto alla geolocalizzazione per scopi statistici (oltre a quello per il
tracking), va aggiunto al flusso di onboarding/consenso prima del go-live oltre
il perimetro del pilota. Questo MVP/concierge non introduce tale consenso
esplicito.

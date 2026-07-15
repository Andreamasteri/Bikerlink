// Costanti del manuale BikerLink (Task #152) estratte da horus-scanner-finalize.ts
// per mantenere ogni file ≤450 righe (ratchet 600-line gate).
//
// Le 24 aree funzionali OBBLIGATORIE del manuale + il glossario da 35 termini
// sono definiti qui e importati da horus-scanner-finalize-manual.ts.

// Task #152 — Le 24 aree funzionali OBBLIGATORIE del manuale, ciascuna con le
// domande specifiche a cui la sezione deve rispondere. Sostituiscono la vecchia
// mappatura per cartella di codice (areaOf): il manuale è organizzato per
// FUNZIONALITÀ dell'app, non per struttura del repository.
export const MANUAL_AREAS: ReadonlyArray<{ title: string; questions: string }> = [
  {
    title: "Mappa Live e Visibilità Rider",
    questions:
      "Chi vede chi sulla mappa? Come funzionano hide_from_map e il ghost mode? Come agiscono i filtri Biker/Zavorrina/Motoclub? Cosa succede con coordinate null? Che differenza c'è tra vista admin e vista utente?",
  },
  {
    title: "Routing Moto — Pianificazione Percorsi",
    questions:
      "Quali profili esistono (curvy, panoramico, auto panoramica, ecc.)? Quando si usa GraphHopper e quando Valhalla? Cosa sono le routing_areas? Come funziona il fallback offline? Cosa fa il pulsante \"Calcola Percorso\"?",
  },
  {
    title: "Navigazione in Tempo Reale",
    questions:
      "Come si inizia e si termina una sessione di navigazione? Cosa mostra l'overlay (istruzione, distanza, tempo)? Ci sono comandi vocali? Cosa fanno \"Inizia Navigazione\" e \"Arrivato\"?",
  },
  {
    title: "Tracking GPS e Sessioni di Guida",
    questions:
      "Come si avvia e conclude il tracking? Come si aggiungono i waypoint? Cos'è il Dead-Reckoning e come interagisce con la telemetria? Dove si vede lo storico giri? Come si cambia unità/velocità?",
  },
  {
    title: "Telemetria e Calibrazione Sensori",
    questions:
      "Come funziona il batch GPS? Cos'è il fusion gate? Cosa fa il Kalman filter? Cosa sono speedBias e headingBias? Cosa succede quando il ThinkCentre è offline?",
  },
  {
    title: "MotoClub — Gestione Club",
    questions:
      "Come si crea e si scopre un club? Cos'è il \"club padre\"? Come ci si iscrive? Chi è il responsabile? Come funzionano marketplace e mappa del club?",
  },
  {
    title: "Matching tra Rider",
    questions:
      "Su cosa si basa il matching? Come si generano le proposals? Come si accetta o rifiuta? Cosa succede senza telemetria? Cosa fa \"Trova Biker Compatibili\"?",
  },
  {
    title: "Proposte e Richieste di Giro",
    questions:
      "Quali tipi esistono (Giro, Raduno, Con Zavorrina, Richiesta)? Come si crea una proposta? Come si risponde? Dove appaiono le proposte?",
  },
  {
    title: "Eventi Motociclistici",
    questions:
      "Chi crea gli eventi? Come si partecipa? Come appaiono sulla mappa? Quali notifiche generano?",
  },
  {
    title: "SOS e Segnalazione Pericoli Stradali",
    questions:
      "Quali tipi di SOS esistono e chi viene notificato? Come funziona la segnalazione road-hazard e la durata di visibilità? Cosa fanno \"Segnala Pericolo\" e \"Invia Segnalazione\"?",
  },
  {
    title: "Contest Foto",
    questions:
      "Qual è il flusso del contest? Come si carica una foto? Come si vota? Dov'è l'albo dei vincitori? Quanti voti al giorno sono ammessi?",
  },
  {
    title: "Arcade e Gamification",
    questions:
      "Quali giochi esistono? Come funzionano le classifiche? Come si connette la gamification alla telemetria?",
  },
  {
    title: "Chat e Messaggistica",
    questions:
      "Quali tipi di chat esistono (privata, gruppo, amici)? Come si crea una chat? Cos'è la chat con Bowie? Cosa fa \"Nuovo messaggio\"?",
  },
  {
    title: "Profilo Utente e Garage",
    questions:
      "Cosa contiene il profilo? Come si modifica? Cos'è il garage? Quali statistiche mostra? Quali impostazioni privacy ci sono (fake position, ghost mode, visibilità)?",
  },
  {
    title: "Assistente AI Bowie",
    questions:
      "Quali sono le capacità di Bowie? Come si attiva? Dov'è il pulsante? Quali azioni può compiere? Come usa Nadir? Dà suggerimenti proattivi? Come si disattiva? Cosa fanno \"Chiedi a Bowie\" e il tour?",
  },
  {
    title: "Horus — AI di Routing e Analisi Codice",
    questions:
      "Cosa fa Horus per il routing? Come analizza il codice? Cos'è la modalità manuale? Come interagisce con Nadir?",
  },
  {
    title: "Nadir — Ricerca Semantica e RAG",
    questions:
      "Cos'è Nadir e cosa indicizza? Come funziona il reindex? Come cerca Bowie tramite Nadir? Come gestisce il multi-lingua e il sourceHash? Dove vivono i file (TC `agent-shared/nadir/manuale/` + fallback Replit)?",
  },
  {
    title: "Ares — Diagnostica Tecnica (solo admin)",
    questions:
      "Qual è la funzione di Ares? Come si invoca? Quali analisi produce? Come interagisce con Nadir?",
  },
  {
    title: "Quebracho — Coordinamento Job AI",
    questions:
      "Qual è il ruolo di Quebracho? Come orchestra i job? Come funzionano pause/resume? Cos'è un gated-job?",
  },
  {
    title: "Watchdog, Monitoraggio e Alert",
    questions:
      "Cosa monitora il watchdog? Come genera gli alert? Cos'è il kill-switch? Come funziona l'auto-fix? Quando invia notifiche push agli admin?",
  },
  {
    title: "Sistema OTA e Aggiornamenti App",
    questions:
      "Come funziona l'OTA? Cos'è il BootGate? Cos'è l'HWM? Come funziona il rollback? A cosa serve il canale \"diagnostic\"?",
  },
  {
    title: "ThinkCentre e Infrastruttura Self-Hosted",
    questions:
      "Quali servizi ospita il ThinkCentre? Come sono esposti (Cloudflare Tunnel)? Come funziona il fallback offline? Come si monitora la salute? Cosa sono ai-hub e la cartella `agent-shared/`?",
  },
  {
    title: "Autenticazione, Ruoli e Admin Panel",
    questions:
      "Quali ruoli esistono? Come funziona la registrazione (4 step)? Cos'è il pannello admin mobile? Come funziona la moderazione foto?",
  },
  {
    title: "Notifiche Push, Localizzazione e Multi-Lingua",
    questions:
      "Quali tipi di notifica esistono? Che differenze ci sono tra iOS e Android? Quali lingue sono supportate (elencale tutte con il nome nativo)? Come funziona la traduzione AI del manuale?",
  },
];

// Task #152 — I 35 termini obbligatori del glossario (chiude il manuale).
export const GLOSSARY_TERMS =
  "ThinkCentre, Horus, Bowie, Nadir, Ares, Quebracho, OTA, BootGate, HWM, " +
  "curvy routing, routing area, telemetria, Dead-Reckoning, Kalman filter, " +
  "fusion gate, MotoClub, road-hazard, SOS, watchdog, kill-switch, AI Coordinator, " +
  "db-integrity, reindex, sourceHash, persona AI, RAG, embedding, Cloudflare Tunnel, " +
  "qwen3, EAS, ghost mode, fake position, zavorrina, biker matching, proposta";

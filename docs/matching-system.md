# Sistema di Matching BikerLink

**Versione documento:** 1.0 — Maggio 2026  
**Lingua:** Italiano  
**Destinatari:** Investitori, partner, team non tecnico, nuovi utenti

---

## 1. Introduzione

Il **sistema di matching** è il cuore di BikerLink. La sua funzione è mettere in contatto persone che condividono la stessa passione per le moto, sulla base di affinità reali: la moto che guidano, il modo in cui la guidano, la musica che ascoltano, gli eventi a cui partecipano e i percorsi che fanno.

Un **match** è una coppia di utenti che il sistema ha riconosciuto come compatibili. Quando due utenti fanno match, entrambi ricevono una notifica e possono iniziare una conversazione privata, accettare o rifiutare il match, e — nel caso delle proposte — organizzare un viaggio insieme.

BikerLink non usa un algoritmo unico: ha **17 tipi di match distinti**, ciascuno basato su un criterio diverso. In questo modo ogni utente ha più possibilità di trovare qualcuno con cui ha qualcosa in comune.

---

## 2. Glossario dei Ruoli

| Ruolo | Chi è | Cosa fa su BikerLink |
|-------|-------|----------------------|
| **Biker** | Chi possiede e guida una moto | Inserisce la propria moto nel garage, crea proposte di viaggio, cerca altri biker o zavorrine compatibili |
| **Zavorrina** (o Zavorra) | Chi ama le moto ma non ne possiede una (passeggero/a) | Inserisce una wishlist con le moto con cui vorrebbe viaggiare, cerca biker che abbiano quella moto |
| **Club** | Un gruppo di motociclisti registrato in app (es. club di marca, club regionale) | Non è un singolo utente ma un'entità collettiva: i suoi membri vengono abbinati ai biker o alle zavorrine che hanno affinità con il brand del club |

> **Nota:** Il termine "Zavorrina" (o "Zavorra") è il nome affettuoso e ironico usato nella community motociclistica italiana per indicare il passeggero. In BikerLink è un ruolo ufficiale, privo di connotazione negativa.

> **Ruolo aggiuntivo — Coppia:** due persone che viaggiano insieme sulla stessa moto. Internamente può fare match sia come biker sia come zavorrina, a seconda del contesto.

---

## 3. I 17 Tipi di Match

La tabella seguente elenca tutti i tipi di match attivi nel sistema, con i criteri esatti utilizzati.

| # | Tipo di Match | Ruoli Coinvolti | Criterio | Dati Utilizzati | Note |
|---|--------------|-----------------|----------|-----------------|------|
| 1 | **Brand moto (BB)** | Biker ↔ Biker | Stesso marchio di moto nel garage | Tabella `user_motorcycles`, campo `brand` | Supermatch se anche modello + tipo + stile di guida coincidono |
| 2 | **Wishlist / Garage (BZ)** | Biker ↔ Zavorrina | Il brand o il tipo di moto del biker corrisponde alla wishlist della zavorrina | Tabelle `user_motorcycles` e `zavorrina_wishlist_motos` | Supermatch se brand + modello + tipo + stile coincidono |
| 3 | **Brand Club — Biker** | Biker ↔ Membro Club | Il biker possiede una moto del brand ufficiale di un club, e viene abbinato ai membri di quel club | Tabelle `user_motorcycles` e `moto_clubs` (campo `brand_name`) | Il club deve essere approvato dall'admin |
| 4 | **Brand Club — Zavorrina** | Zavorrina ↔ Membro Club | La zavorrina ha in wishlist il brand ufficiale di un club, e viene abbinata ai membri di quel club | Tabelle `zavorrina_wishlist_motos` e `moto_clubs` | Stesso meccanismo del #3, lato zavorrina |
| 5 | **Tipo + Stile di guida (BB)** | Biker ↔ Biker | Stesso tipo di moto (es. naked, enduro) e stesso stile di guida | Tabella `user_motorcycles`, campi `motorcycle_type` e `riding_style` | Entrambi i campi devono coincidere esattamente |
| 6 | **Tipo + Stile di guida (BZ)** | Biker ↔ Zavorrina | Il tipo e lo stile della moto del biker corrispondono alla preferenza in wishlist della zavorrina | Tabelle `user_motorcycles` e `zavorrina_wishlist_motos` | Entrambi i campi devono essere presenti nella wishlist |
| 7 | **Distanza percorsi (BB)** | Biker ↔ Biker | Il centro geografico dei percorsi registrati dei due biker è entro 150 km | Tabelle `routes` e `route_points` (centroide GPS medio) | Attivo anche come criterio nelle proposte di viaggio biker↔biker |
| 8 | **Distanza percorsi (BZ)** | Biker ↔ Zavorrina | Stessa logica del #7, tra biker e zavorrina | Tabelle `routes` e `route_points` | Attivo anche come criterio nelle proposte biker↔zavorrina |
| 9 | **Affinità musicale (BB)** | Biker ↔ Biker | Almeno il 65% delle canzoni in comune rispetto alla libreria più piccola | Tabella `user_music_tracks`, campo `lastfm_track_id` | Richiede la connessione Last.fm su entrambi gli account |
| 10 | **Affinità musicale (BZ)** | Biker ↔ Zavorrina | Stessa logica del #9, tra biker e zavorrina | Tabella `user_music_tracks` | Richiede Last.fm su entrambi gli account |
| 11 | **Angolo di piega (GPS)** | Biker ↔ Biker | Stesso "bucket" di inclinazione media (bassa / media / alta), con almeno 3 percorsi registrati ciascuno | Tabella `routes`, campo `max_tilt_deg` (media su tutti i percorsi) | Soglie: bassa <20°, media 20–35°, alta >35°. Se il telefono non ha il giroscopio il campo vale 0 (bucket basso) |
| 12 | **Zona + Profilo percorso (BB)** | Biker ↔ Biker | Centroide GPS entro 50 km E stesso profilo di percorso (curvy / highway / city / mixed) | Tabelle `routes` e `route_points` | Profilo calcolato da: velocità media, inclinazione media, distanza media |
| 13 | **Zona + Profilo percorso (BZ)** | Biker ↔ Zavorrina | Stessa logica del #12, tra biker e zavorrina | Tabelle `routes` e `route_points` | La zavorrina deve avere percorsi registrati |
| 14 | **Velocità media GPS** | Biker ↔ Biker | Stesso "bucket" di velocità media (lenta / media / veloce) | Tabella `routes`, campo `avg_speed_kmh` | Soglie: lenta <50 km/h, media 50–80, veloce >80 |
| 15 | **Durata media GPS** | Biker ↔ Biker | Stesso "bucket" di durata media delle uscite (breve / media / lunga) | Tabella `routes`, campo `duration_seconds` | Soglie: breve <2h, media 2–6h, lunga >6h |
| 16 | **Orario preferito GPS** | Biker ↔ Biker | Stesso giorno della settimana e fascia oraria (mattina / pomeriggio / sera) | Tabella `proposals` (timestamp di partenza `scheduled_at` / `departure_time_from`) | Calcolato sulla mediana degli orari delle proposte create dall'utente |
| 17 | **Partecipazione a raduni/eventi** | Biker ↔ Biker | Entrambi hanno partecipato allo stesso raduno o evento in app | Tabella `event_participants` | I match vengono creati tra tutti i partecipanti dello stesso evento |

> **Supermatch:** un match speciale che si genera quando due utenti soddisfano criteri più stringenti (es. stessa marca + stesso modello + stesso tipo + stesso stile). I supermatch vengono evidenziati visivamente nell'app.

> **Proposte di viaggio:** le proposte (es. "cerco compagno per sabato mattina") generano un tipo aggiuntivo di match detto "match proposta". Vengono abbinati automaticamente tra utenti compatibili per ruolo, zona e finestra oraria. Le preferenze `bikerBikerDistance` e `bikerZavarrinaDistance` controllano anche questo tipo di match.

---

## 4. Come Funziona il Calcolo della Distanza

BikerLink non usa il paese o la regione per capire se due utenti sono vicini. Usa la **formula di Haversine**, che calcola la distanza reale in linea d'aria tra due punti GPS sulla superficie terrestre.

**In parole semplici:** immagina di tracciare una linea retta (passando attraverso la curvatura della Terra) tra la posizione di due utenti. Haversine calcola quella distanza in chilometri, con alta precisione, tenendo conto del fatto che la Terra è sferica.

**Perché è importante:** due utenti che abitano a Milano e Bergamo sono a ~45 km in linea d'aria. Con una logica basata su "stessa regione" non farebbero mai match perché abitano in province diverse. Con Haversine vengono correttamente abbinati.

Nei tipi di match basati su percorsi (# 7, 8, 12, 13), la distanza non è misurata sulla posizione attuale dell'utente, ma sul **centroide geografico** di tutti i percorsi registrati: la media delle coordinate GPS di tutti i punti tracciati. Questo rappresenta la zona in cui l'utente guida abitualmente.

---

## 5. Preferenze Utente

Ogni utente può **disattivare singoli tipi di match** dalle impostazioni dell'app. Questo permette, ad esempio, di ricevere match per brand moto ma non per musica, o viceversa.

**Come funziona:**
- Nella sezione "Preferenze Match" dell'app, ogni tipo di match ha un interruttore on/off.
- Il default è tutto attivo.
- Se un utente disattiva un tipo di match, non comparirà mai più in abbinamenti di quel tipo — né come mittente né come destinatario.
- Il blocco è bidirezionale: se anche uno solo dei due utenti ha disattivato quel tipo, il match non viene creato.

**Quando questa sezione è visibile:**
- La sezione preferenze match è accessibile dal profilo dell'utente → Impostazioni → Preferenze Match.
- Viene mostrata solo dopo che l'utente ha completato il profilo (garage o wishlist inseriti).

---

## 6. Controllo Admin

L'amministratore di BikerLink ha accesso a strumenti avanzati per monitorare e controllare il sistema di matching.

### Pannello Admin — Cosa vede

| Funzione | Descrizione |
|----------|-------------|
| **Monitoraggio match** | Visualizza statistiche e log dei match creati (per tipo, per coppia di utenti, con timestamp dell'ultimo ciclo) |
| **Toggle globale matching** | Abilita o disabilita l'intero motore di matching con un singolo interruttore (`auto_matching_enabled`) |
| **Statistiche ciclo** | Mostra data/ora dell'ultimo ciclo di matching, durata in secondi, numero di match creati per tipo |
| **Trigger manuale** | Lancia un ciclo di matching on-demand senza aspettare il ciclo automatico |
| **Paesi abilitati** | Configura in quali paesi è attivo il matching (es. solo Italia) tramite l'impostazione `matching_countries` |

### Toggle Globale

Quando il toggle globale è **OFF**, nessun match viene creato, indipendentemente dalle preferenze dei singoli utenti. Questo è utile in fase di manutenzione, aggiornamenti del database, o per congelare il sistema in un determinato stato.

---

## 7. Match Predisposti ma Non Ancora Attivi

Alcuni tipi di match sono stati progettati e implementati nel codice, ma richiedono dati che attualmente pochi utenti hanno. Verranno attivati progressivamente man mano che la base utenti cresce e il comportamento in app diventa più ricco.

### Angolo di piega — Sensori Giroscopio (Tipo #11)

Questo match confronta l'inclinazione media della moto nei percorsi registrati. **Richiede:**
- Almeno 3 percorsi registrati con il sensore giroscopio attivo sul telefono
- Un telefono compatibile con la rilevazione dell'asse laterale durante la guida

**Stato:** il codice è attivo, ma il match si genera solo quando entrambi gli utenti hanno abbastanza percorsi con dati di piega reali. Con una base utenti ridotta o con telefoni che non registrano il giroscopio, questo tipo di match rimane silente.

**Quando si attiverà pienamente:** man mano che più utenti registreranno percorsi con sensori abilitati. Nessun intervento tecnico necessario — è già pronto.

### Raduni ed Eventi (Tipo #17)

Il match per raduni abbina tutti gli utenti che hanno partecipato allo stesso evento o raduno motociclistico registrato in app. **Richiede:**
- Che gli eventi (raduni) vengano creati e approvati in app
- Che gli utenti si iscrivano agli eventi tramite l'apposita funzione

**Stato:** il codice è attivo, ma si genera solo se c'è un numero sufficiente di eventi con partecipanti iscritti. In questa fase iniziale, il feature eventi è operativo ma poco utilizzato.

**Quando si attiverà pienamente:** quando i raduni motoristici verranno inseriti regolarmente in app e gli utenti inizieranno a segnare la propria partecipazione. È prevista una campagna di onboarding dedicata.

### Affinità musicale (Tipi #9 e #10)

Il match musicale confronta le canzoni ascoltate tramite **Last.fm**, la piattaforma di scrobbling musicale. **Richiede** che l'utente colleghi il proprio account Last.fm a BikerLink.

**Stato:** funzionante, ma dipende dall'adozione di Last.fm. Quando il numero di utenti con Last.fm collegato sarà sufficiente, i match musicali diventeranno più frequenti.

---

## 8. FAQ

**Perché non ho ancora match?**  
I match si generano automaticamente ogni volta che un utente accede all'app (con un intervallo minimo di 2 minuti per utente). Se non hai ancora match, probabilmente non ci sono abbastanza utenti compatibili nella tua zona, oppure il tuo profilo non è completo (garage o wishlist mancanti).

**Il match musicale richiede Last.fm?**  
Sì. I tipi di match #9 e #10 richiedono che tu abbia collegato il tuo account Last.fm nelle impostazioni del profilo. Senza Last.fm, questi match non vengono mai generati per te, ma tutti gli altri tipi rimangono attivi.

**Posso bloccare una persona per non ricevere più match da lei?**  
Sì. Bloccando un utente, nessun tipo di match verrà mai più creato tra voi due. Il blocco è permanente finché non viene rimosso.

**I match nelle proposte di viaggio sono diversi dagli altri?**  
Sì. I match delle proposte hanno una logica separata: vengono abbinati due utenti che hanno creato proposte compatibili per ruolo, data, fascia oraria e zona geografica. Una volta accettato da entrambe le parti, si apre automaticamente una chat.

**Cosa significa "Supermatch"?**  
Un Supermatch si genera quando la compatibilità è massima: stessa marca di moto, stesso modello, stesso tipo e stesso stile di guida. È evidenziato nell'app con un'icona speciale per segnalarne la qualità.

**Il matching funziona anche all'estero?**  
Dipende dalla configurazione dell'admin. Di default il matching può essere limitato ad alcuni paesi. Se sei in un paese non coperto, potresti non ricevere match finché non viene abilitato il tuo paese.

**Ogni quanto gira il motore di matching?**  
Il motore viene attivato ogni volta che un utente accede all'app, con un minimo di 5 minuti tra un ciclo globale e l'altro. Un utente riceve match personalizzati entro 2 minuti dalla connessione.

**Cosa fa il Club nel matching?**  
Un Club in BikerLink ha spesso un brand di moto associato (es. "Honda Club Roma"). Quando un biker possiede una moto di quel brand, viene abbinato ai membri del club — e viceversa per le zavorrine che hanno quel brand in wishlist. Il Club non è un utente ma un catalizzatore di match tra persone con la stessa moto.

---

<details>
<summary><strong>Appendice Tecnica</strong> — Dettagli per sviluppatori e team tecnico</summary>

## Tabelle del Database

| Tabella | Contenuto |
|---------|-----------|
| `users` | Anagrafica utenti: `user_type` (biker/zavorrina/coppia), `role` (user/admin) |
| `user_motorcycles` | Garage biker: brand, model, motorcycle_type, riding_style |
| `zavorrina_wishlists` | Wishlist zavorrina (contenitore) |
| `zavorrina_wishlist_motos` | Singole voci wishlist: brand, model, motorcycle_type, riding_style |
| `biker_zavorrina_matches` | Match biker↔zavorrina da wishlist/garage (**solo tipo #2**): bikerId, zavarrinaId, bikerMotorcycleId, wishlistMotoId |
| `biker_biker_matches` | Tutti gli altri match (tipi #1, #3–#17): biker↔biker e biker↔zavorrina generici — distinguibili dal campo `motorcycle_brand` e `pair_type` |
| `proposals` | Proposte di viaggio: search_type, departure coords, time window, club_id |
| `proposal_matches` | Match tra proposte compatibili |
| `match_preferences` | Preferenze per tipo di match, una riga per utente |
| `routes` | Percorsi registrati: avg_speed_kmh, max_tilt_deg, duration_seconds |
| `route_points` | Punti GPS dei percorsi |
| `user_music_tracks` | Tracce Last.fm collegate all'utente: lastfm_track_id, artist_id, genres |
| `event_participants` | Iscrizioni eventi/raduni: user_id, event_id |
| `moto_clubs` | Club moto: brand_name, is_approved |
| `moto_club_members` | Membri dei club: status (active/pending) |
| `user_blocks` | Coppie bloccate: blocker_id, blocked_id |
| `app_settings` | Impostazioni globali: `auto_matching_enabled`, `matching_countries`, `fake_users_enabled` |

> **Importante:** la tabella `biker_biker_matches` è usata sia per coppie biker↔biker (pair_type='bb') sia per coppie biker↔zavorrina (pair_type='bz') generate da tutti i motori di matching eccetto il wishlist/garage (tipo #2). La distinzione si legge dal campo `pair_type` e dal valore `motorcycle_brand`.

## Tipi di Match — Chiavi Interne (`motorcycle_brand` in `biker_biker_matches`)

| Valore `motorcycle_brand` | Tipo di match | pair_type |
|---------------------------|---------------|-----------|
| `<brand reale>` (es. "Honda") | Tipo #1 — Brand BB | bb |
| `tipo:<motorcycle_type>` | Tipo #5 — Tipo+Stile BB | bb |
| `club:<brand>` | Tipo #3 — Brand Club Biker | bb |
| `club_zav:<brand>` | Tipo #4 — Brand Club Zavorrina | bz |
| `tipo_zav:<type>` | Tipo #6 — Tipo+Stile BZ | bz |
| `musica` | Tipo #9 — Musica BB | bb |
| `musica_zav` | Tipo #10 — Musica BZ | bz |
| `gps_full` | Tipi #11+#14+#15+#16 combinati (Supermatch GPS) | bb |
| `gps_speed` | Tipi #14+#15 — Velocità+Durata GPS | bb |
| `gps_tilt` | Tipo #11 — Angolo piega | bb |
| `gps_day` | Tipo #16 — Orario preferito | bb |
| `zona_bb:<profile>` | Tipo #12 — Zona+Profilo BB | bb |
| `zona_zav:<profile>` | Tipo #13 — Zona+Profilo BZ | bz |
| `distanza` | Tipo #7 — Distanza percorsi BB | bb |
| `distanza_zav` | Tipo #8 — Distanza percorsi BZ | bz |
| `eventi` | Tipo #17 — Raduni/Eventi | bb |

## Preferenze Match — Colonne `match_preferences`

| Colonna DB | Tipo di match |
|------------|---------------|
| `biker_biker_brand` | #1 |
| `biker_zavorrina_brand` | #2 |
| `biker_club_brand` | #3 |
| `zavorrina_club_brand` | #4 |
| `biker_biker_type_style` | #5 |
| `biker_zavorrina_type_style` | #6 |
| `biker_biker_distance` | #7 (e proposte BB) |
| `biker_zavorrina_distance` | #8 (e proposte BZ) |
| `biker_biker_music` | #9 |
| `biker_zavorrina_music` | #10 |
| `biker_biker_lean_angle` | #11 |
| `biker_biker_route_type_zone` | #12 |
| `biker_zavorrina_route_type_zone` | #13 |
| `biker_biker_avg_speed` | #14 |
| `biker_biker_avg_duration` | #15 |
| `biker_biker_day_time` | #16 |
| `biker_biker_events` | #17 |
| `direct_match` | Match proposta diretto |

## Soglie Numeriche

| Metrica | Soglie bucket |
|---------|---------------|
| Velocità media GPS | lenta <50 km/h · media 50–80 · veloce >80 |
| Durata media uscita | breve <7.200 s (2h) · media 7.200–21.600 s (2–6h) · lunga >21.600 s |
| Angolo di piega medio | basso <20° · medio 20–35° · alto >35° |
| Profilo percorso | curvy (tilt>30°) · highway (speed>100 km/h) · city (dist<30 km) · mixed |
| Soglia distanza centroide BB | 150 km |
| Soglia distanza zona (tipo+zona) | 50 km |
| Soglia overlap musicale | 65% rispetto alla libreria più piccola |
| Raggio proposta default | 50 km (configurabile per proposta) |

## Funzioni Principali — `server/matching-engine.ts`

| Funzione | Tipo |
|----------|------|
| `runMatching()` | Proposte compatibili (search_type + zona + orario) |
| `runWishlistMatching()` | #2 — Wishlist/Garage → `biker_zavorrina_matches` |
| `runBikerBikerMatching()` | #1 — Brand BB → `biker_biker_matches` |
| `runBikerBikerTypeStyleMatching()` | #5 — Tipo+Stile BB → `biker_biker_matches` |
| `runClubBrandMatching()` | #3 e #4 — Brand Club → `biker_biker_matches` |
| `runMusicMatchBikerZavarrina()` | #9 e #10 — Musica → `biker_biker_matches` |
| `runGpsBasedMatching()` | #11, #14, #15, #16 — GPS → `biker_biker_matches` |
| `runEventMatching()` | #17 — Raduni/Eventi → `biker_biker_matches` |
| `runBikerZavarrinaTypeStyleMatching()` | #6 — Tipo+Stile BZ → `biker_biker_matches` (pair_type='bz') |
| `runDistanceMatching()` | #7 e #8 — Distanza percorsi → `biker_biker_matches` |
| `runRouteTypeZoneMatching()` | #12 e #13 — Zona+Profilo → `biker_biker_matches` |
| `triggerMatchingRun()` | Ciclo globale on-demand (debounce 5 min) |
| `triggerMatchingForUser(userId)` | Ciclo personalizzato per singolo utente (debounce 2 min) |

## Endpoint API

| Endpoint | Metodo | Descrizione |
|----------|--------|-------------|
| `GET /api/matches` | GET | Lista match biker↔zavorrina dell'utente (`biker_zavorrina_matches`) |
| `GET /api/biker-biker-matches` | GET | Lista match biker↔biker (e bz generici) dell'utente |
| `GET /api/proposals/matches` | GET | Match tra proposte di viaggio dell'utente |
| `GET /api/match/music` | GET | Match musicali on-demand via Last.fm (`server/routes/music-match.ts`) |
| `GET /api/match-preferences` | GET | Preferenze match dell'utente autenticato |
| `PUT /api/match-preferences` | PUT | Aggiorna preferenze match dell'utente autenticato |
| `POST /api/admin/force-matching` | POST | Avvia ciclo di matching manuale (solo admin) |
| `GET /api/admin/matching-stats` | GET | Statistiche ultimo ciclo: data, durata, contatori per tipo (solo admin) |
| `GET /api/admin/settings/matching_countries` | GET | Legge i paesi abilitati al matching (solo admin) |
| `PUT /api/admin/settings/matching_countries` | PUT | Aggiorna i paesi abilitati al matching (solo admin) |

</details>

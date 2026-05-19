# Skill: Match Engine Health Check

## Descrizione

Questa skill consente di eseguire in qualsiasi momento un controllo completo della salute del motore di matching e del database BikerLink. Il check rileva cambiamenti strutturali al DB, verifica che tutti i 17 tipi di match producano risultati, controlla l'allineamento delle preferenze utente, campiona le distanze e verifica il flag admin globale.

## Quando usare questa skill

- Prima di un deploy per verificare che il motore di matching sia sano
- Dopo una migrazione del DB per verificare che non ci siano regressioni
- Quando un utente segnala assenza di match
- Dopo aver modificato `server/matching-engine.ts` o `shared/schema.ts`
- Periodicamente (es. ogni settimana) come monitoraggio di routine

---

## Come eseguire il health check

### Opzione A — Script CLI (consigliato per agent)

```bash
npx tsx server/scripts/check-match-health.ts
```

Stampa un report markdown completo in console. Exit code:
- `0` = OK o solo WARN
- `1` = errori critici (ERROR)
- `2` = errore di esecuzione

### Opzione B — Endpoint HTTP (solo admin)

```
GET /api/admin/match-health
Authorization: sessione admin attiva
```

Restituisce un JSON strutturato con tutti i check e i conteggi per tipo.

Esempio risposta:
```json
{
  "overallStatus": "OK",
  "checkedAt": "2026-05-19T10:00:00.000Z",
  "summary": {
    "totalMatchTypes": 17,
    "typesWithZeroResults": 0,
    "schemaStatus": "OK",
    "prefsStatus": "OK",
    "distanceStatus": "OK",
    "adminGateStatus": "OK"
  },
  "checks": {
    "schema": { "status": "OK", "diff": null },
    "matchCounts": [ ... ],
    "preferences": { "status": "OK" },
    "distanceSample": { "status": "OK", "distancesKm": [12, 45, 7, 230, 88] },
    "adminGate": { "status": "OK", "value": "true" }
  }
}
```

---

## I 17 Tipi di Match

| # | Chiave | Descrizione | Tabella DB | Identificatore nel DB |
|---|--------|-------------|------------|----------------------|
| 1 | `bikerBikerBrand` | Brand moto uguale tra due biker | `biker_biker_matches` | `motorcycle_brand` = nome brand, `pair_type='bb'` |
| 2 | `bikerZavorrinaBrand` | Brand/tipo moto da wishlist zavarrina | `biker_zavarrina_matches` | tutte le righe |
| 3 | `bikerClubBrand` | Biker con brand del proprio motoclub | `biker_biker_matches` | `motorcycle_brand LIKE 'club:%'` |
| 4 | `zavarrinaClubBrand` | Zavarrina con brand del motoclub | `biker_biker_matches` | `motorcycle_brand LIKE 'club_zav:%'` |
| 5 | `bikerBikerTypeStyle` | Tipo+stile moto identici tra biker | `biker_biker_matches` | `motorcycle_brand LIKE 'tipo:%'` |
| 6 | `bikerZavarrinaTypeStyle` | Tipo+stile tra biker e wishlist zavarrina | `biker_biker_matches` | `motorcycle_brand LIKE 'tipo_zav:%'` |
| 7 | `bikerBikerDistance` | Zona geografica simile (centroide route) tra biker | `biker_biker_matches` | `motorcycle_brand = 'distanza'` |
| 8 | `bikerZavarrinaDistance` | Zona geografica simile tra biker e zavarrina | `biker_biker_matches` | `motorcycle_brand = 'distanza_zav'` |
| 9 | `bikerBikerMusic` | Affinità musicale ≥65% tra biker | `biker_biker_matches` | `motorcycle_brand = 'musica'` |
| 10 | `bikerZavarrinaMusic` | Affinità musicale ≥65% tra biker e zavarrina | `biker_biker_matches` | `motorcycle_brand = 'musica_zav'` |
| 11 | `bikerBikerLeanAngle` | Angolo di piega GPS simile | `biker_biker_matches` | `motorcycle_brand IN ('gps_tilt','gps_full')` |
| 12 | `bikerBikerRouteTypeZone` | Profilo route (curvy/highway/city/mixed) + zona <50km | `biker_biker_matches` | `motorcycle_brand LIKE 'zona_bb:%'` |
| 13 | `bikerZavarrinaRouteTypeZone` | Profilo route + zona tra biker e zavarrina | `biker_biker_matches` | `motorcycle_brand LIKE 'zona_zav:%'` |
| 14 | `bikerBikerAvgSpeed` | Velocità media GPS simile | `biker_biker_matches` | `motorcycle_brand IN ('gps_speed','gps_full')` |
| 15 | `bikerBikerAvgDuration` | Durata media percorsi GPS simile | `biker_biker_matches` | `motorcycle_brand IN ('gps_speed','gps_full')` |
| 16 | `bikerBikerDayTime` | Fascia oraria/giorno preferita simile | `biker_biker_matches` | `motorcycle_brand IN ('gps_day','gps_full')` |
| 17 | `bikerBikerEvents` | Partecipazione agli stessi eventi | `biker_biker_matches` | `motorcycle_brand = 'eventi'` |

> **Nota**: I tipi 14 e 15 condividono lo stesso bucket `gps_speed`/`gps_full` perché il motore li combina in un'unica query GPS. `gps_full` è il supermatch GPS (tutti e 4 i criteri soddisfatti).

---

## Come leggere il report

### Sezione 1 — Schema Check

| Stato | Significato | Azione |
|-------|-------------|--------|
| OK | Nessuna modifica al DB dall'ultimo check | Nessuna azione |
| WARN (tabelle aggiunte) | Nuova tabella nel DB | Verificare che la migrazione sia intenzionale |
| WARN (colonne modificate) | Colonna alterata | Verificare che il codice sia allineato |
| ERROR (tabelle rimosse) | Tabella eliminata | **Attenzione**: potrebbe causare crash del server |
| WARN (primo avvio) | Nessuno snapshot precedente | Normale al primo run — lo snapshot verrà creato |

### Sezione 2 — Conteggi Match per Tipo

| Stato | Significato | Azione |
|-------|-------------|--------|
| ✅ N match | Il tipo produce risultati | Nessuna azione |
| ⚠️ 0 match | Il tipo non ha mai prodotto risultati | Verificare se ci sono utenti/dati sufficienti (es. per eventi, devono esistere partecipanti) |

**Cause comuni di 0 match:**
- **bikerBikerLeanAngle** (tipo 11): richiede percorsi GPS con `max_tilt_deg` registrato — normale se nessun utente ha usato il tracciamento avanzato
- **bikerBikerEvents** (tipo 17): richiede partecipanti nella tabella `event_participants`
- **bikerBikerMusic / bikerZavarrinaMusic** (tipi 9,10): richiede utenti con tracce Last.fm sincronizzate
- **bikerClubBrand / zavarrinaClubBrand** (tipi 3,4): richiede motoclub con `brand_name` configurato

### Sezione 3 — Preferenze Utente

| Stato | Significato | Azione |
|-------|-------------|--------|
| OK | `match_preferences` ha esattamente le 17 colonne attese | Nessuna azione |
| WARN (colonne extra) | Colonne non mappate a nessun tipo noto | Verificare se è un nuovo tipo da aggiungere allo script |
| ERROR (colonne mancanti) | Mancano colonne dalla tabella | Eseguire la migrazione mancante |

### Sezione 4 — Campione Distanze

| Stato | Significato | Azione |
|-------|-------------|--------|
| OK | 5 campioni con distanza Haversine ≥0 km | Nessuna azione |
| WARN (0 campioni) | Nessun match con coordinate GPS nelle tabelle | Normale se gli utenti non hanno condiviso la posizione |
| WARN (distanze non plausibili) | Valori negativi o anomali | Verificare il calcolo Haversine nel motore |

### Sezione 5 — Admin Gate

| Stato | Significato | Azione |
|-------|-------------|--------|
| OK, value=`true` | Matching automatico abilitato | Nessuna azione |
| OK, value=`false` | Matching automatico **disabilitato** | Se non intenzionale, riabilitarlo da admin panel |
| WARN | Chiave non trovata | Eseguire `INSERT INTO app_settings (key, value) VALUES ('auto_matching_enabled', 'true')` |

---

## Aggiornare manualmente lo snapshot

Se lo schema è cambiato intenzionalmente e si vuole azzerare il diff:

```bash
npx tsx server/scripts/snapshot-schema.ts
```

Oppure chiamare `GET /api/admin/match-health` — salva automaticamente lo snapshot aggiornato al termine di ogni check.

Lo snapshot viene anche aggiornato automaticamente ad ogni avvio del backend.

---

## File rilevanti

- `server/scripts/snapshot-schema.ts` — cattura e confronta snapshot dello schema
- `server/scripts/check-match-health.ts` — script CLI completo del health check
- `server/routes/admin.ts` — endpoint `GET /api/admin/match-health`
- `server/data/schema-snapshot.json` — snapshot dello schema (generato automaticamente)
- `server/matching-engine.ts` — implementazione dei 17 tipi di match
- `shared/schema.ts` — definizione della tabella `match_preferences`

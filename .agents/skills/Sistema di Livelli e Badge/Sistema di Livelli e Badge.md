---
name: bikerlink-levels
description: Sistema di livelli, badge e gamification per BikerLink. Aumenta la retention degli utenti nei primi 90 giorni trasformando i dati già esistenti nell'app (km, giri, match) in progressi visibili. IMPORTANTE: questa skill descrive una funzionalità da aggiungere all'app esistente — non va costruita da zero, va integrata nel codice già presente. Leggi prima il codice dell'app per capire la struttura dati esistente prima di implementare qualsiasi cosa.
---

# BikerLink — Sistema di Livelli e Badge

## Contesto importante per l'agente

**Questa funzionalità va integrata nell'app Android esistente.**

Prima di implementare qualsiasi cosa:
1. Leggi la struttura del database esistente — tabelle utenti, giri, match, messaggi
2. Leggi il codice del profilo utente — dove vengono mostrati i dati
3. Leggi il sistema di notifiche esistente — per agganciare le notifiche badge
4. **Non creare tabelle o strutture che duplicano dati già esistenti**

I dati per calcolare livelli e badge ci sono già nell'app — km percorsi, giri registrati, match avvenuti, percorsi pubblicati. Basta leggerli e renderli visibili in modo gratificante.

---

## Perché farlo

L'obiettivo non è la competizione tra utenti — è dare all'utente una **ragione per tornare nell'app anche nei giorni in cui non va in moto**.

Vedere i propri progressi, sbloccare badge, salire di livello:
- Riduce il churn (abbandono) nei primi 90 giorni — il periodo più critico
- Crea contenuto da condividere organicamente ("ho raggiunto 1000km!")
- Trasforma gli utenti più attivi in ambassador naturali
- Dà visibilità pubblica alla community più fedele

---

## Badge — lista completa

I badge si basano su eventi già tracciati nell'app. Nessun dato nuovo da raccogliere.

### Badge Milestone (progressi personali)

| Badge | Condizione | Descrizione |
|---|---|---|
| **Primo giro** | 1 giro registrato | Il tuo primo giro con BikerLink |
| **10 giri** | 10 giri completati | Stai prendendo il ritmo |
| **50 giri** | 50 giri completati | Biker di razza |
| **1.000 km** | 1.000 km totali | Mille km macinati |
| **5.000 km** | 5.000 km totali | Il lungo viaggio inizia |
| **10.000 km** | 10.000 km totali | Leggenda della strada |
| **Primo match** | Primo match ricevuto o inviato | U'll Never Ride Alone |
| **Never Alone** | 5 giri fatti in compagnia (match attivo) | Lo spirito BikerLink |
| **Worldwide** | GPS attivo in 3 nazioni diverse | Biker senza confini |

### Badge Community (contributo agli altri)

| Badge | Condizione | Descrizione |
|---|---|---|
| **Cartografo** | 1 percorso pubblicato sull'archivio | Hai condiviso la strada |
| **Cartografo Esperto** | 5 percorsi pubblicati con almeno 10 voti ciascuno | La community ti segue |
| **Guida** | 10 commenti utili su percorsi altrui | Aiuti chi non conosce la zona |
| **Zavorrina Gold** | (solo Zavorrine) 10 giri fatti con biker diversi | Esplori con tutti |
| **Biker Generoso** | (solo Biker) 10 giri fatti con Zavorrine | Nessuno rimane a terra |

### Badge Stagionali (limitati nel tempo)

| Badge | Condizione | Periodo |
|---|---|---|
| **Estate in moto** | 3 giri in luglio/agosto | Estate |
| **Invernale** | 1 giro con temperatura < 5°C | Inverno |
| **Ferragosto Biker** | Giro il 15 agosto | 15 agosto |
| **Primo dell'Anno** | Giro il 1 gennaio | 1 gennaio |

### Badge Speciali (sbloccati una volta sola)

| Badge | Condizione |
|---|---|
| **Early Adopter** | Iscritto nei primi 500 utenti |
| **Beta Tester** | Iscritto durante il beta test |
| **Ambassador** | Invitato 5 nuovi utenti tramite referral |

---

## Sistema di livelli

I livelli si basano su **punti esperienza (XP)** accumulati nel tempo.

### Tabella livelli

| Livello | Nome | XP necessari |
|---|---|---|
| 1 | **Principiante** | 0 |
| 2 | **Biker** | 500 |
| 3 | **Biker Esperto** | 1.500 |
| 4 | **Road Master** | 4.000 |
| 5 | **Iron Rider** | 10.000 |
| 6 | **Legend** | 25.000 |

### Come si guadagnano XP

| Azione | XP |
|---|---|
| Registra un giro | +50 |
| Ogni 100 km percorsi | +100 |
| Completa un giro in compagnia (match attivo) | +150 |
| Pubblica un percorso sull'archivio | +200 |
| Ricevi 10 voti positivi su un percorso | +100 |
| Sblocchi un badge | +50 |
| Prima apertura del giorno (streak) | +10 |
| Streak 7 giorni consecutivi | +100 bonus |
| Streak 30 giorni consecutivi | +500 bonus |

---

## Streak giornaliero

Meccanica semplice: ogni giorno che l'utente apre l'app mantiene la streak.

```
Streak attuale: 🔥 12 giorni
Record personale: 34 giorni
```

Se la streak si rompe → notifica push leggera il giorno dopo:
```
"La tua streak di 12 giorni è finita. Ricomincia oggi 💪"
```

Non essere aggressivo con questa notifica — una volta sola, poi basta.

---

## Dove mostrare livelli e badge nell'app

### Profilo utente (schermata esistente)
Aggiungere sotto il nickname e la moto:
```
[Livello 3 — Road Master]  🔥 18 giorni streak

Badge: [🏅][🏅][🏅]...  [ Vedi tutti →  ]
```

### Schermata Badge dedicata
Una sezione nel profilo con tutti i badge:
- Sbloccati (a colori, con data di sblocco)
- Non ancora sbloccati (in grigio, con condizione visibile)

```
✅ Primo giro         sbloccato il 12 mag 2025
✅ 1.000 km           sbloccato il 3 giu 2025
⬜ 5.000 km           ti mancano 2.847 km
⬜ Never Alone        ti mancano 3 giri in compagnia
```

### Scheda altri utenti (matching)
Nel profilo di un altro utente mostrato durante il matching:
```
[Livello 4 — Iron Rider]  Badge: 🏅🏅🏅
```
Questo aumenta la fiducia reciproca — vedi subito se è un utente attivo e serio.

---

## Notifiche badge

Quando un utente sblocca un badge → notifica push immediata:

```
Titolo:  🏅 Badge sbloccato!
Corpo:   Hai percorso 1.000 km con BikerLink.
         Badge "1.000 km Club" sbloccato.
         [ Condividi ]
```

Il pulsante **Condividi** genera un'immagine del badge con nickname e km — pronta per Instagram/WhatsApp. Questo è il contenuto virale organico.

---

## Schema database da aggiungere

```sql
-- Tabella XP e livello utente
CREATE TABLE user_xp (
  user_id       TEXT PRIMARY KEY REFERENCES users(id),
  total_xp      INTEGER NOT NULL DEFAULT 0,
  current_level INTEGER NOT NULL DEFAULT 1,
  streak_days   INTEGER NOT NULL DEFAULT 0,
  last_active   DATE,
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- Tabella badge sbloccati
CREATE TABLE user_badges (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  badge_id    TEXT NOT NULL,      -- es. "first_ride", "1000km", "never_alone"
  unlocked_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);
```

Questi sono i due soli tavoli nuovi necessari. Tutto il resto (km, giri, match) viene letto dalle tabelle esistenti.

---

## Logica di aggiornamento XP

```typescript
// Chiamato ogni volta che avviene un evento rilevante
async function awardXp(userId: string, event: XpEvent) {
  const xpMap: Record<XpEvent, number> = {
    ride_completed:      50,
    per_100km:           100,
    ride_with_match:     150,
    route_published:     200,
    route_10_votes:      100,
    badge_unlocked:      50,
    daily_open:          10,
    streak_7_days:       100,
    streak_30_days:      500,
  };

  const xpGained = xpMap[event];
  if (!xpGained) return;

  const current = await getUserXp(userId);
  const newTotal = current.total_xp + xpGained;
  const newLevel = calculateLevel(newTotal);

  await updateUserXp(userId, { total_xp: newTotal, current_level: newLevel });

  // Notifica se è salito di livello
  if (newLevel > current.current_level) {
    await sendLevelUpNotification(userId, newLevel);
  }

  // Controlla badge da sbloccare
  await checkAndAwardBadges(userId);
}
```

---

## Cosa NON fare

- **Non fare classifiche pubbliche globali** nei primi mesi — con pochi utenti la classifica è demotivante (vedi sempre gli stessi 3 in cima)
- **Non bombardare di notifiche** — massimo 1 notifica badge al giorno, anche se ne sblocca più d'una
- **Non bloccare funzionalità** dietro livelli — i livelli sono cosmetic, non paywall
- **Non mostrare badge grigi ossessivamente** — solo i più vicini allo sblocco, non tutti i 30 che mancano

---

## Skills correlate

- **bikerlink-app** — struttura esistente dell'app, auth, matching, GPS
- **bikerlink-website** — il profilo pubblico sul sito può mostrare livello e badge dell'utente

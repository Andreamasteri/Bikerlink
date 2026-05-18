---
name: bikerlink-referral
description: Strategia di referral per BikerLink — codici invito personalizzati, reward per chi porta nuovi utenti, crescita virale integrata con il sistema badge e livelli. IMPORTANTE: va integrato nell'app esistente, leggi prima la struttura utenti e il sistema badge (skill bikerlink-levels) prima di implementare.
---

# BikerLink — Strategia Referral e Crescita Virale

## Contesto importante per l'agente

**Questa funzionalità va integrata nell'app Android esistente.**

Dipendenze da leggere prima:
1. **bikerlink-levels** — il badge "Ambassador" è già definito lì, non ricrearlo
2. **bikerlink-app** — struttura utenti esistente, auth, sistema notifiche
3. Leggi la tabella utenti nel DB prima di aggiungere colonne — potrebbero esistere già campi utili

---

## Concept

Ogni utente BikerLink ha un **codice referral personale** — corto, mnemonico, legato al nickname.

```
Il tuo codice: MARCO-42
Condividi: bikerlink.app/join/MARCO-42
```

Chi si iscrive usando il codice:
- Viene collegato al referrer nel DB
- Il referrer accumula credito / sblocca badge
- Entrambi ricevono un bonus di benvenuto

---

## Generazione codice

```typescript
// Formato: NICKNAME-XX (max 12 caratteri totali)
// Nickname troncato a 8 caratteri + dash + 2 cifre random anti-collisione
function generateReferralCode(nickname: string): string {
  const base = nickname.toUpperCase().slice(0, 8).replace(/[^A-Z0-9]/g, "");
  const suffix = Math.floor(Math.random() * 90 + 10); // 10-99
  return `${base}-${suffix}`;
}
// Es: "marco_rossi" → "MARCOROS-47"
// Es: "biker99"     → "BIKER99-23"

// Verifica unicità nel DB prima di salvare
// Se collisione → rigenera con suffix diverso
```

---

## Reward — cosa riceve chi invita

### Livello 1 — Primi inviti (1-4 nuovi utenti)
- +100 XP per ogni utente invitato che si iscrive
- Notifica push: "Mario si è iscritto con il tuo codice! +100 XP"

### Livello 2 — Ambassador (5+ utenti invitati)
- Badge **Ambassador** sbloccato (già definito in bikerlink-levels)
- +500 XP bonus una tantum
- Profilo con etichetta "Ambassador" visibile agli altri utenti

### Livello 3 — Super Ambassador (20+ utenti invitati)
- Menzione nella pagina Partner del sito
- Badge speciale "Fondatore della Community"
- Accesso beta a funzionalità nuove prima degli altri

---

## Reward — cosa riceve chi viene invitato

All'iscrizione con codice referral:
- Badge **"Arrivato con stile"** (edizione limitata — solo chi arriva via invito)
- +100 XP di benvenuto (invece di 0)
- Messaggio automatico dall'invitante: "Benvenuto! Sono [nickname], se hai domande scrivimi."

Il messaggio automatico è importante — crea subito un contatto umano, riduce l'abbandono nei primi giorni.

---

## Flusso iscrizione con codice

```
1. Utente apre bikerlink.app/join/MARCO-42
   → Landing page con: "Marco ti ha invitato su BikerLink"
   → Foto/avatar di Marco (se disponibile), livello, badge
   → Pulsante "Scarica l'app e unisciti"

2. Nell'app, schermata registrazione
   → Campo "Codice invito" pre-compilato con MARCO-42
   → (se arrivato dal link — altrimenti campo vuoto opzionale)

3. Dopo la registrazione
   → Notifica a Marco: "Ciao! [nickname] si è iscritto con il tuo codice."
   → Messaggio automatico inviato da Marco al nuovo utente
   → XP accreditati a Marco
   → Badge "Arrivato con stile" al nuovo utente
```

---

## Pagina referral nell'app

Una schermata dedicata nel profilo utente:

```
IL TUO CODICE INVITO
━━━━━━━━━━━━━━━━━━━━
  MARCO-42
  [ Copia ]  [ Condividi ]

Link diretto: bikerlink.app/join/MARCO-42

━━━━━━━━━━━━━━━━━━━━
I TUOI INVITATI
  3 amici iscritti
  Prossimo obiettivo: 5 → Badge Ambassador (mancano 2)

  ✅ Luca_V    iscritto il 12 mag
  ✅ Sara99    iscritto il 18 mag
  ✅ GioMoto   iscritto il 2 giu
```

---

## Schema database da aggiungere

```sql
-- Colonna sul tavolo utenti esistente
ALTER TABLE users ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE users ADD COLUMN referred_by   TEXT REFERENCES users(id);

-- Tabella tracciamento referral
CREATE TABLE referrals (
  id              SERIAL PRIMARY KEY,
  referrer_id     TEXT REFERENCES users(id),
  referred_id     TEXT REFERENCES users(id) UNIQUE,
  referral_code   TEXT NOT NULL,
  created_at      TIMESTAMP DEFAULT NOW(),
  xp_awarded      BOOLEAN DEFAULT FALSE  -- evita doppio accredito
);
```

Solo 2 colonne nuove sulla tabella utenti + 1 tabella referral. Leggero.

---

## Condivisione — testo pre-compilato

Il pulsante "Condividi" apre il dialog nativo Android con testo già pronto:

```
Versione breve (WhatsApp/Telegram):
"Uso BikerLink per trovare biker con cui girare.
Iscriviti con il mio codice MARCO-42 e parti con 100XP:
bikerlink.app/join/MARCO-42"

Versione Instagram Stories:
Immagine generata con:
- Logo BikerLink
- "MARCO-42 ti invita"
- QR code che punta al link
- Tagline "U'll Never Ride Alone"
```

L'immagine per le Stories si genera server-side o con Canvas API nel browser — nessuna libreria esterna necessaria.

---

## Integrazione con i QR code fisici

I QR code sui traghetti e nei parcheggi puntano a `bikerlink.app/download`.

I QR code **personali** (per ambassador e biker attivi) puntano a `bikerlink.app/join/MARCO-42`.

Questo permette di tracciare esattamente quante iscrizioni arrivano da ogni persona fisica — utile per identificare gli ambassador più efficaci sul campo.

Idea pratica: stampare QR code personalizzati su adesivi da mettere sul casco o sulla moto. Ogni passante che li scansiona vede il profilo del biker e si iscrive collegato a lui.

---

## Analytics referral (lato admin)

Dashboard interna per monitorare la crescita virale:

```
Iscrizioni totali:          1.247
  → Via referral:             412  (33%)
  → Via QR code traghetti:    389  (31%)
  → Organico/diretto:         446  (36%)

Top referrer questa settimana:
  1. GIOMOTO-11   → 14 invitati
  2. SARA_V-33    →  9 invitati
  3. LUCA99-07    →  7 invitati
```

Il K-factor (quanti nuovi utenti porta in media ogni utente) è la metrica chiave. Se K > 1 la crescita è virale. Obiettivo: K = 0.5 nei primi 6 mesi, K > 1 entro 12 mesi.

---

## Cosa NON fare

- **Non fare referral con cashback o premi monetari** nei primi mesi — crea aspettative difficili da gestire e attira utenti non genuini
- **Non rendere obbligatorio il codice invito** — deve essere opzionale, non un muro
- **Non mostrare classifiche pubbliche dei top referrer** finché la base utenti è piccola — può sembrare vuoto
- **Non mandare notifiche push aggressive** per spingere la condivisione — una volta mostrata la schermata, basta

---

## Skills correlate

- **bikerlink-levels** — badge Ambassador e XP già definiti lì, non duplicare
- **bikerlink-app** — struttura utenti, auth, notifiche esistenti
- **bikerlink-website** — pagina /join/:code da creare sul sito, landing personalizzata per ogni invito

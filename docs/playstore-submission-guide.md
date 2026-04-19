# Guida Submission Google Play Store — BikerLink

Segui questa checklist nell'ordine indicato. Ogni passo ha le risposte già precompilate.

---

## PRIMA DI INIZIARE

- [ ] Hai un account Google personale (Gmail) da usare come sviluppatore
- [ ] Hai €25 disponibili per la quota una-tantum Google Play Developer
- [ ] Hai generato l'AAB (versionCode 30) seguendo il PASSO 3 — vedi istruzioni sotto
- [ ] Hai letto `docs/playstore-listing.md` per i testi pronti

---

## PASSO 1 — Crea Account Google Play Developer

**URL:** https://play.google.com/console/signup

1. Accedi con il tuo account Google (usa bikerlinkapp@gmail.com)
2. Accetta i Termini di Servizio per Sviluppatori
3. Paga la quota di registrazione: **€25 una tantum** (carta di credito/debito)
4. Compila il profilo sviluppatore:
   - **Nome sviluppatore (pubblico):** `BikerLink`
   - **Email di contatto:** `bikerlinkapp@gmail.com`
   - **Sito web (opzionale):** URL del backend o lascia vuoto
5. Attendi la verifica (di solito pochi minuti, max 48h)

---

## PASSO 2 — Crea Nuova App

**Nel Play Console → "Crea app"**

| Campo | Valore |
|---|---|
| Lingua predefinita | Italiano (it-IT) |
| Nome app | `BikerLink — Moto Community` |
| App o gioco | App |
| Gratuita o a pagamento | Gratuita |
| Dichiarazione sviluppatore | Spunta entrambe le caselle |

Clicca **"Crea app"**.

---

## PASSO 3 — Carica il Bundle/APK

**Menu laterale → "Produzione" → "Versioni" → "Crea nuova versione"**

> ℹ️ **FORMATO FILE:**
> - Google Play Store richiede **AAB** (Android App Bundle) per la pubblicazione pubblica
> - Il codice è già pronto con **versionCode 30** — serve solo avviare il build EAS

### AAB pronto — versionCode 30

| Campo | Valore |
|---|---|
| **Scarica AAB** | https://expo.dev/artifacts/eas/fJ6BA3F6wrhESvmNmqwC1K.aab |
| Build ID | `7740a399-bdb9-415d-b3d9-d65d09f4be6b` |
| Dashboard EAS | https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds/7740a399-bdb9-415d-b3d9-d65d09f4be6b |
| versionCode | **30** |
| Profilo | production |
| Status | ✅ FINISHED |

**Passi:**
1. Scarica il file `.aab` dal link sopra
2. Caricalo su Play Console
3. Nel campo **"Note sulla versione"** inserisci:

```
Prima versione pubblica di BikerLink.
Funzionalità: matching tra motociclisti, tracking GPS percorsi, SOS emergenza stradale, MotoClub, Garage, integrazione Spotify/Last.fm, contest fotografici settimanali.
```

Clicca **"Salva"** (non pubblicare ancora — completa prima tutti gli altri passi)

---

## PASSO 4 — Scheda Principale (Store Listing)

**Menu laterale → "Presenza nello store" → "Scheda principale dello store"**

### Dettagli app
| Campo | Valore |
|---|---|
| Nome app | `BikerLink — Moto Community` |
| Breve descrizione | `Trova motociclisti, registra i tuoi giri GPS e unisciti alla community italiana` |
| Descrizione completa | Copia da `docs/playstore-listing.md` sezione "DESCRIZIONE LUNGA" |

### Grafica
| Asset | Cosa caricare | Dove trovarlo |
|---|---|---|
| Icona app (512×512) | `assets/images/playstore-icon.png` | Nella root del progetto |
| Feature graphic (1024×500) | `assets/images/playstore-feature-graphic.png` | Nella root del progetto |
| Screenshot telefono (min 2) | Vedi sezione screenshot in `docs/playstore-listing.md` | Dal tuo telefono |

### Dettagli contatto
| Campo | Valore |
|---|---|
| Email supporto | `bikerlinkapp@gmail.com` |
| Sito web (opzionale) | URL backend o lascia vuoto |

---

## PASSO 5 — Data Safety (Sicurezza dei Dati)

**Menu laterale → "Sicurezza dei dati"**

Questa è la sezione più importante. Risposte precompilate:

### Raccolta dati
**"L'app raccoglie o condivide dati utente?"** → **Sì**

### Dati da dichiarare (spunta queste categorie):

| Categoria Google | Tipo dato | Scopo | Condiviso con terzi |
|---|---|---|---|
| **Dati personali** → Nome | Nickname | Funzionalità app | No |
| **Dati personali** → Indirizzo email | Email | Autenticazione | No |
| **Dati personali** → Numero di telefono | Telefono | Opzionale, profilo | No |
| **Dati personali** → Altre informazioni | Anno nascita, sesso, bio | Matching | No |
| **Posizione** → Posizione esatta | GPS lat/lng | Mappa community, tracking, SOS | No |
| **Posizione** → Posizione approssimativa | (inclusa) | (inclusa) | No |
| **Foto e video** → Foto | Foto profilo, moto, contest | Funzionalità app | No |
| **Audio** → Altri file audio | Musica Spotify/LastFM | Matching musicale | Sì (Spotify, LastFM) |
| **Messaggi** → Messaggi in-app | Chat privata e di gruppo | Comunicazione | No |
| **Contatti** → (nessuno) | — | — | — |
| **File e documenti** → (nessuno) | — | — | — |
| **Attività nell'app** → Interazioni app | Matching, voti, punteggi | Analisi interna | No |
| **Identificatori del dispositivo** → ID dispositivo | Push token | Notifiche | Sì (Expo) |

### Pratiche di sicurezza
- **"I dati sono cifrati in transito?"** → **Sì** (HTTPS/TLS)
- **"Puoi richiedere la cancellazione dei dati?"** → **Sì** (email a bikerlinkapp@gmail.com)

---

## PASSO 6 — Content Rating (Classificazione Contenuti)

**Menu laterale → "Classificazione dei contenuti" → "Avvia questionario"**

| Domanda | Risposta |
|---|---|
| Categoria app | Social networking |
| Violenza? | No |
| Contenuti sessualmente espliciti? | No |
| Linguaggio volgare? | No |
| Prodotti controllati (alcol, tabacco, droghe)? | No |
| Gioco d'azzardo? | No |
| Informazioni finanziarie sensibili? | No |
| Dati di localizzazione condivisi? | **Sì** (mappa community) |
| L'app permette comunicazione tra utenti? | **Sì** (chat) |
| L'app genera contenuti utente? | **Sì** (foto, profilo) |
| L'app è destinata ai bambini? | **No** |
| Pubblicità? | No (per ora) |

**Classificazione attesa risultante:** PEGI 12 o 16 (per interazione social e localizzazione condivisa)

---

## PASSO 7 — Target Audience ed Età

**Menu laterale → "Target audience e contenuti"**

| Campo | Valore |
|---|---|
| Fascia d'età target | 18 anni e oltre |
| L'app è rivolta principalmente ai bambini? | No |
| Appeal per bambini? | No |

---

## PASSO 8 — Privacy Policy

**Menu laterale → "Politica sulla privacy" (o nella scheda store)**

**URL da inserire:**
```
https://[DOMINIO-BACKEND]/privacy
```

Sostituisci `[DOMINIO-BACKEND]` con il dominio del server Replit.  
Esempio: `https://bikerlink.replit.app/privacy`

La pagina `/privacy` è già attiva sul backend — rispondete in HTML con la privacy policy completa.

---

## PASSO 9 — Categoria App

**Nella scheda store → "Categoria"**

| Campo | Valore |
|---|---|
| Tipo | App (non gioco) |
| Categoria | **Social** |
| Tag (opzionali) | Sport, Lifestyle |

---

## PASSO 10 — Distribuzione e Prezzi

**Menu laterale → "Distribuzione"**

| Campo | Valore |
|---|---|
| Paesi | Italia (inizialmente — poi espandi) |
| Prezzo | Gratuita |
| Dispositivi | Telefoni (non ottimizzata per tablet) |
| Android Go | No |
| Wear OS, TV, Auto | No |

---

## PASSO 11 — Revisione Finale e Pubblicazione

Prima di inviare, verifica:
- [ ] Titolo e descrizione inseriti
- [ ] Icona 512×512 caricata
- [ ] Feature graphic caricata
- [ ] Almeno 2 screenshot caricati
- [ ] Data Safety compilata
- [ ] Content Rating completata
- [ ] Privacy Policy URL inserita
- [ ] APK/AAB caricato

**Clicca "Invia per revisione"**

### Tempi di revisione
- **Prima submission:** 3-7 giorni lavorativi (Google rivede manualmente le nuove app)
- **Aggiornamenti successivi:** 1-3 giorni
- Riceverai email all'indirizzo del developer account quando l'app è approvata o rifiutata

---

## SE L'APP VIENE RIFIUTATA

Le cause più comuni per app social/localizzazione:

| Motivo rifiuto | Soluzione |
|---|---|
| Privacy policy incompleta | Aggiungere sezione su localizzazione in background e SOS |
| Permessi non giustificati | Già giustificati in `app.json` con descrizioni dettagliate |
| Data Safety incompleta | Rivedere il Passo 5 |
| Screenshot insufficienti | Aggiungere altri screenshot |
| Contenuti inappropriati | Non applicabile (moderazione attiva) |

---

## DOPO LA PUBBLICAZIONE

1. Condividi il link Play Store nella community BikerLink
2. Monitora le recensioni (rispondi entro 24-48h)
3. Tieni d'occhio il **Android Vitals** nel Play Console (crash rate, ANR)
4. Per aggiornamenti: bump `versionCode` in `app.json` + `android/app/build.gradle` → nuovo AAB EAS (profilo production)

---

*File generato il 19 aprile 2026 — BikerLink v1.9.4 (versionCode 30) — AAB production*

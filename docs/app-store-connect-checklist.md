# Checklist Metadata App Store Connect — BikerLink

App: **BikerLink** · Bundle ID: `com.bikerlink.app` · Versione: **1.9.3** · Build: **2**

Percorso: App Store Connect → My Apps → BikerLink

> Tutti gli URL sotto sono stati verificati raggiungibili (HTTP 200) il giorno della preparazione di questa checklist.

---

## 1) App Information (info statiche dell'app)

Sezione: **App Information** (a sinistra, sotto "General")

- [ ] **Privacy Policy URL**
  `https://biker-link.replit.app/privacy-policy`
- [ ] **EULA**
  Lasciare **Standard Apple EULA** (non incollare nulla nel campo Custom EULA) salvo necessità specifiche. Se in futuro serve un EULA custom, usare `https://biker-link.replit.app/terms`.
- [ ] **Subtitle** (max 30 caratteri): `Community moto e SOS biker`
- [ ] **Category**:
  - Primary: `Travel`
  - Secondary (opzionale): `Social Networking`
- [ ] **Content Rights**: dichiarare se l'app contiene contenuti di terze parti (selezionare **No** se tutto è prodotto in‑house).
- [ ] **Age Rating**: completare il questionario (atteso 4+ se non sono presenti contenuti sensibili).

---

## 2) General → App Privacy

Sezione: **App Privacy** (obbligatoria, blocca la submission se vuota)

- [ ] **Privacy Policy URL** (di nuovo qui): `https://biker-link.replit.app/privacy-policy`
- [ ] **Data Types collected**: dichiarare almeno
  - `Email Address` (Account creation, App functionality, linked to user)
  - `Name` (linked to user)
  - `Precise Location` (App functionality, NOT used for tracking) — usata per mappa, SOS, motoclub
  - `Coarse Location` (App functionality)
  - `User Content → Photos` (se l'utente carica foto profilo)
  - `Identifiers → User ID` (App functionality)
  - `Diagnostics → Crash Data, Performance Data` (linked or not, se usati)
- [ ] **Tracking**: selezionare **No, we do not track**.

---

## 3) Version 1.9.3 → App Store (questa versione)

Sezione: **1.9.3 Prepare for Submission**

### Promotional Text (max 170 caratteri, IT)
```
Nuovo: SOS Biker per emergenze stradali, motoclub con chat di gruppo, codici invito e mappa motociclisti in tempo reale.
```

### Description (IT)
```
BikerLink è la community italiana dei motociclisti.

• Mappa in tempo reale con altri biker nelle vicinanze
• SOS Biker: invio rapido della tua posizione in caso di emergenza
• Motoclub: crea o entra in club, chat di gruppo, inviti dedicati
• Profilo moto: brand, modello, anno, foto
• Codici invito per crescere la tua rete

Tutti i calcoli (posizione, distanze, matching) avvengono localmente sul telefono. La posizione è condivisa solo quando l'app è attiva e l'hai autorizzata.

Privacy: https://biker-link.replit.app/privacy-policy
Termini: https://biker-link.replit.app/terms
```

### Keywords (max 100 caratteri totali, separati da virgola — niente spazi dopo la virgola)
```
moto,motociclisti,biker,sos,emergenza,motoclub,chat,mappa,raduni,community
```

### Support URL
```
https://biker-link.replit.app
```

### Marketing URL (opzionale)
```
https://biker-link.replit.app
```

### Copyright
```
2026 BikerLink
```

### Routing App Coverage File (opzionale): lasciare vuoto.

---

## 4) Version 1.9.3 → App Review Information

Sezione: **App Review Information** (in fondo alla pagina della versione)

### Sign-in required
- [ ] Selezionare **Yes** (l'app richiede login).

### Demo Account
- [ ] **Username**: `apple.review@bikerlink.app`
- [ ] **Password**: (generare una password robusta e annotarla nel password manager prima della submission)
- [ ] Verificare che l'account esista, sia confermato e abbia almeno 1 motoclub di esempio già joinato.

### Notes for Reviewer
```
Hi Apple Review Team,

BikerLink is a community app for motorcyclists in Italy.

KEY POINTS FOR REVIEW:
1. Demo credentials above grant full access (already verified, joined to a sample motorcycle club, profile completed).
2. All distance / matching / nearby-biker calculations are performed LOCALLY on device. The backend only stores user profile, motoclub membership and chat messages.
3. Location permission ("Always" optional, "While Using" sufficient) is required for the core features: live biker map, SOS Biker emergency feature, and motoclub auto-join by area. The app explains each permission in the request dialog.
4. SOS Biker feature: when the user taps the SOS button, the app sends current GPS coordinates to nearby bikers and emergency contacts. It does NOT call emergency services automatically.
5. Push notifications are used only for chat messages and SOS alerts.
6. A dedicated reviewer info page with screenshots and quick links is available at:
   https://biker-link.replit.app/apple-review

Privacy Policy: https://biker-link.replit.app/privacy-policy
Terms of Service: https://biker-link.replit.app/terms

Thanks for the review!
The BikerLink team
```

### Contact Information
- [ ] First name / Last name / Phone / Email del responsabile della submission compilati.
- [ ] Email controllabile durante la review (Apple può rispondere lì).

### Attachment (opzionale)
- [ ] Allegare uno screenshot della home loggata se aiuta la review (non obbligatorio).

---

## 5) Version 1.9.3 → Build & Screenshots

- [ ] **Build**: selezionata la build `1.9.3 (2)` caricata da Expo Launch.
- [ ] **Screenshot 6.7"** (iPhone 15 Pro Max): almeno 3 caricati.
- [ ] **Screenshot 6.5"** (fallback): almeno 3 caricati.
- [ ] **App Preview** (video, opzionale): può essere lasciato vuoto.
- [ ] **Promo Text / What's New in this Version** compilati in IT.

---

## 6) Pricing and Availability

- [ ] **Price**: Free.
- [ ] **Availability**: Italia (e altri paesi se desiderato).

---

## 7) Final pre-submit

- [ ] Tutte le checkbox qui sopra sono spuntate.
- [ ] Pulsante **"Add for Review"** → diventa **"Submit for Review"**.
- [ ] Domande "Export Compliance / Content Rights / Advertising Identifier" risposte:
  - Export Compliance: usa solo HTTPS standard → **Yes** alla domanda "uses only exempt encryption".
  - Advertising Identifier (IDFA): **No** (l'app non usa IDFA).
- [ ] Submit.

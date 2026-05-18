---
name: bikerlink-monetization
description: Strategia di monetizzazione per BikerLink — revenue senza abbonamenti mensili nelle fasi iniziali, partnership verticali moto, modello freemium progressivo. Usa questa skill quando devi implementare funzionalità a pagamento, integrare partner commerciali, o costruire il pitch economico per investitori.
---

# BikerLink — Monetizzazione

## Principio guida

**Non fare abbonamenti mensili nei primi 12-18 mesi.**

Un abbonamento mensile nelle fasi iniziali:
- Blocca la crescita — gli utenti non pagano per un'app che non conosce nessuno
- Crea aspettativa di perfezione — se paghi, ti aspetti tutto funzionante
- Uccide il referral — nessuno invita amici a un'app a pagamento

L'obiettivo della fase 1 è **massa critica di utenti**, non revenue. La revenue arriva dopo, quando l'app ha valore percepito.

---

## Fase 1 — 0-500 utenti: tutto gratis, costruisci dati

Nessuna monetizzazione diretta. Si costruisce:
- Database di utenti attivi con dati GPS, preferenze, km percorsi
- Archivio percorsi con voti e commenti
- Reputazione community

Questi dati valgono più di qualsiasi abbonamento a €3/mese.

---

## Fase 2 — 500-5.000 utenti: partnership verticali

### Canale 1 — Assicurazioni moto

Le assicurazioni moto pagano per accedere a utenti profilati e attivi.

**Modello:** non vendere dati (illegale GDPR), ma vendere **visibilità contestuale**.

```
Esempi concreti:
- Banner "Rinnova la tua assicurazione" nel profilo utente
  a Marzo/Aprile (periodo rinnovi polizze)
- Notifica push "La tua polizza scade? Confronta le offerte"
  taggata come sponsorizzata
- Pagina partner con comparatore assicurazioni moto

Partner target: Direct Line Moto, ConTe.it, Linear Moto,
               Generali Moto, broker comparatori (Segugio, Facile)
```

Revenue model: CPL (cost per lead) — BikerLink riceve €X per ogni utente che clicca e richiede un preventivo. Tipicamente €5-15 per lead nel settore assicurativo moto.

### Canale 2 — Accessori e abbigliamento moto

I biker spendono molto in accessori. Chi guida 10.000 km/anno è un cliente ad alto valore.

```
Partner target:
- Rev'it, Dainese, AGV (abbigliamento/caschi)
- Touratech, Hepco & Becker (valigie/accessori touring)
- Motul, Castrol (olio motore)
- Michelin, Pirelli (pneumatici)

Modello:
- Sezione "Shop" nel sito con link affiliati Amazon/partner
- Badge "Sponsored Gear" su utenti ambassador che usano certi prodotti
- Coupon esclusivi per utenti BikerLink (es. -10% su Rev'it)
  → tracciabile con codice BIKERLINK10
```

Revenue model: affiliazione (3-8% sul venduto) + fee fissa per coupon esclusivi.

### Canale 3 — Tour operator e agenzie moto-turismo

Chi propone giri multi-giorno su BikerLink è già il cliente ideale di un tour operator moto.

```
Partner target:
- Agenzia specializzate in moto-tour (Dolomiti, Toscana, Sicilia, Marocco)
- Bed & Bike (strutture ricettive moto-friendly)
- Traghetti Jadrolinija, Superfast, Grimaldi (già nel network del developer!)
- Ferry booking con filtro "trasporto moto"

Modello:
- Pagina /partner sul sito con vetrina tour operator
- Nel planner multi-giorno: "Vuoi che qualcuno organizzi tutto per te?"
  → link al tour operator partner
- Commissione sul booking (tipicamente 10-15%)
```

### Canale 4 — Officine e concessionari moto

Geolocalizzazione + profilo moto = target perfetto per officine locali.

```
Modello "BikerLink Business":
- Pagina vetrina per officine/concessionari
  (nome, orari, specializzazioni, foto)
- Appare nei POI dell'app quando un utente è nelle vicinanze
- Recensioni verificate dalla community BikerLink
- Costo: €X/mese per la pagina vetrina (piccolo, ma ricorrente)

Questo è l'unico modello in abbonamento — ma B2B,
non sull'utente finale.
```

Revenue model: abbonamento B2B €29-99/mese per officine/concessionari.

---

## Fase 3 — 5.000+ utenti: freemium

Solo quando l'app ha valore percepito si introduce il freemium.

### Piano Free (sempre gratuito)
- GPS matching base
- Messaggistica
- Archivio percorsi (lettura)
- Route planner base (A→B)
- Badge e livelli

### Piano Pro (€4.99/mese o €39/anno)
- Route planner avanzato (multi-giorno, sorpresa, meteo dettagliato)
- Pubblicazione percorsi sull'archivio
- Statistiche avanzate giri (km, curve, velocità media)
- Badge esclusivi Pro
- Visibilità aumentata nel matching ("Biker Pro" nel profilo)
- Export GPX dei percorsi

### Piano Club (per motoclub — €19.99/mese)
- Spazio gruppo privato
- Giri di gruppo con tracciamento GPS condiviso
- Dashboard admin per il presidente del club
- Pagina pubblica del club su BikerLink

---

## Pitch per investitori — numeri chiave

Quando presenti a CDP Venture Capital o angel investor:

```
Mercato Italia:
- 7 milioni di moto immatricolate
- ~4 milioni di motociclisti attivi
- Spesa media annua biker: €1.200 (abbigliamento + accessori + viaggi)

Revenue potenziale a 50.000 utenti attivi:
- 5% Pro (2.500 utenti × €4.99/mese)    = €12.475/mese
- Partnership assicurazioni (€3/lead × 500 lead/mese) = €1.500/mese
- Affiliazioni accessori (2% su €50k GMV) = €1.000/mese
- B2B officine (50 officine × €49/mese)  = €2.450/mese
                                    TOTALE ~€17.425/mese

A 500.000 utenti attivi (Europa):
  ~€175.000/mese → €2.1M ARR
```

Questi numeri sono conservativi e dimostrabili — non proiezioni ottimistiche.

---

## Cosa NON monetizzare mai

- **Dati GPS degli utenti** — illegale GDPR, distrugge la fiducia
- **Profili utente venduti a terzi** — stessa cosa
- **Notifiche push pubblicitarie aggressive** — gli utenti disattivano tutto
- **Paywall sul matching base** — è la funzione core, bloccarla uccide l'app
- **Abbonamento obbligatorio per leggere i percorsi** — l'archivio deve restare pubblico per la SEO

---

## Implementazione tecnica — cosa costruire

### Tabella partner nel DB
```sql
CREATE TABLE partners (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,  -- insurance | gear | tour | workshop
  logo_url    TEXT,
  website_url TEXT,
  coupon_code TEXT,
  commission_pct NUMERIC(5,2),
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE partner_clicks (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT REFERENCES users(id),
  partner_id  INTEGER REFERENCES partners(id),
  source      TEXT,  -- app | web | notification
  clicked_at  TIMESTAMP DEFAULT NOW()
);
```

### API
```typescript
GET  /api/partners                    // lista partner attivi
GET  /api/partners/:category          // per categoria
POST /api/partners/:id/click          // traccia click (per CPL)
GET  /api/user/subscription           // piano attivo dell'utente
POST /api/user/subscription/upgrade   // upgrade a Pro
```

### Feature flag per funzionalità Pro
```typescript
// Middleware da applicare alle route Pro
function requirePro(req, res, next) {
  if (req.user.plan === "pro" || req.user.plan === "club") return next();
  return res.status(403).json({
    error: "pro_required",
    message: "Questa funzionalità richiede BikerLink Pro",
    upgradeUrl: "/upgrade"
  });
}
```

---

## Skills correlate

- **bikerlink-app** — struttura utenti, dove aggiungere campo `plan`
- **bikerlink-website** — pagina /partner, pagina /upgrade, prezzi
- **bikerlink-levels** — badge esclusivi Pro da aggiungere alla lista
- **bikerlink-referral** — ambassador come canale di acquisizione clienti Pro

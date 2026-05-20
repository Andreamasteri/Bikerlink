---
name: tabella-comparativa-pianificazione
description: Tabella comparativa delle funzioni di pianificazione route tra BikerLink e i principali concorrenti (Kurviger, Calimoto, MotoPlanner, Rever, MyRouteApp). Usa questa skill per verificare quali funzioni sono già implementate in BikerLink e quali sono ancora mancanti rispetto alla concorrenza.
---

# Tabella Comparativa — Pianificazione Route

## Come usare questa skill

Richiama questa skill ogni volta che devi:

1. **Verificare lo stato di avanzamento** — controllare quali funzioni di pianificazione route sono già implementate in BikerLink vs ancora mancanti.
2. **Prioritizzare il backlog** — identificare le funzioni dove BikerLink è in ritardo rispetto ai concorrenti principali (Kurviger, Calimoto, MyRouteApp).
3. **Aggiornare la tabella** — dopo aver implementato una funzione, aggiornare la cella BikerLink da `❌→implementare` a `✅` in questo file.
4. **Identificare differenziatori unici** — le voci marcate `✅ UNICO` sono i punti di forza esclusivi di BikerLink da valorizzare nel marketing.

## Legenda

| Simbolo | Significato |
|---------|-------------|
| ✅ | Implementato e funzionante |
| ⚠️ | Parzialmente implementato o con limitazioni |
| ❌ | Non implementato |
| ❌→implementare | Non implementato — da aggiungere al backlog |
| ✅ UNICO | Funzione esclusiva di BikerLink, non presente nei concorrenti |

## Tabella Comparativa

| Funzione | Kurviger | Calimoto | MotoPlanner | Rever | MyRouteApp | BikerLink |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Routing curvy | ✅ slider | ✅ | ⚠️ | ❌ | ⚠️ | ✅ 3 mode |
| Slider curviness granulare (5 livelli) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌→implementare |
| Evita sterrato / traghetti | ✅ | ⚠️ | ❌ | ❌ | ✅ | ❌→implementare |
| Round trip + direzione bussola | ✅ | ✅ | ❌ | ❌ | ✅ | ⚠️ solo durata→implementare |
| Multi-day / split tappe | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Street View sul percorso | ❌ | ❌ | ❌ | ❌ | ✅ | ❌→implementare |
| Meteo durante pianificazione | ❌ | ⚠️ | ❌ | ❌ | ✅ | ❌→implementare (post-save già fatto) |
| Profilo altimetrico | ✅ | ✅ | ❌ | ❌ | ✅ | ❌→implementare |
| POI foto community | ✅ | ❌ | ❌ | ❌ | ✅ | ❌→implementare |
| Libreria percorsi esperti | ❌ | ⚠️ | ❌ | ⚠️ | ✅ RouteXpert | ⚠️ Giri community |
| Export Garmin/TomTom nativo | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ |
| GPX import/export | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Meteo lungo percorso (ETA) | ❌ | ⚠️ | ❌ | ❌ | ✅ | ✅ |
| BikerScore (fun index) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ UNICO |
| AI linguaggio naturale | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ UNICO |
| Matching biker | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ UNICO |

## Funzioni prioritarie da implementare

Basandosi sulla tabella, le funzioni con maggiore impatto competitivo ancora mancanti in BikerLink:

1. **Profilo altimetrico** — presente in Kurviger, Calimoto e MyRouteApp (i 3 concorrenti principali)
2. **Slider curviness granulare (5 livelli)** — punto di forza distintivo di Kurviger, assente in tutti gli altri
3. **Round trip + direzione bussola** — presente in Kurviger, Calimoto e MyRouteApp; BikerLink ha solo la durata
4. **Evita sterrato / traghetti** — presente in Kurviger e MyRouteApp
5. **Meteo durante pianificazione** — parziale in Calimoto, completo in MyRouteApp; BikerLink ha solo post-save
6. **POI foto community** — presente in Kurviger e MyRouteApp
7. **Street View sul percorso** — esclusivo MyRouteApp, alta differenziazione

## Differenziatori unici BikerLink

Questi punti di forza **non sono presenti in nessun concorrente** e devono essere valorizzati:

- **BikerScore** — indice di "divertimento" del percorso, concetto unico nel settore
- **AI linguaggio naturale** — pianificazione percorso via descrizione testuale
- **Matching biker** — connessione tra motociclisti per viaggiare insieme

## Aggiornamento tabella

Quando una funzione viene implementata, aggiorna la cella BikerLink in questo file:
- Sostituisci `❌→implementare` con `✅`
- Se parziale, usa `⚠️` con una nota breve
- Aggiorna anche la sezione "Funzioni prioritarie da implementare" rimuovendo le voci completate

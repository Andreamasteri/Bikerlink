# Skill: metro-cache-reset

## Quando usarla

Usa questa skill quando:

- **Metro serve il vecchio binario** dopo un riavvio: le modifiche al codice non compaiono nell'app anche dopo riavvio del workflow "Start App".
- **Errori di risoluzione moduli post-OTA**: `Cannot resolve module 'X'` o `Module not found` dopo una pubblicazione OTA, nonostante il modulo esista.
- **Cache corrotta**: Metro non si avvia o mostra errori di transform insoliti (es. `SyntaxError` su file invariati).
- **Si vuole verificare** se la pulizia notturna automatica è avvenuta o meno.

---

## Come funziona la pulizia automatica (01:00 UTC)

Ogni notte alle **01:00 UTC**, `scripts/metro-cache-nightly.sh` (lanciato in background da `cerbero.sh` al suo avvio):

1. Verifica la sicurezza della purge (regola: "aspetta che la porta 8081 sia libera"):
   - **Metro spento** (lock libero) → cancellazione immediata
   - **Metro attivo** (lock detenuto + porta 8081 risponde) → attende fino a 5 minuti che la porta si liberi; se scade, skip (riprova la notte successiva)
   - **Metro fermato** (lock detenuto + porta 8081 non risponde) → cancellazione immediata (lock stale: Metro è appena uscito)
2. Cancella `.metro-cache/` nella root del progetto.
3. Scrive il flag `/tmp/.metro-cache-purged`.

Al successivo riavvio del workflow "Start App", `start-expo.sh`:
1. Esegue `source scripts/metro-cache-check.sh` — riconosce il flag.
2. Imposta `FORCE_RESET=1` e rimuove il flag.
3. Avvia Metro con `--reset-cache` (pulizia completa), ricreando la cache da zero.

---

## Come forzare il reset manuale (fuori orario)

Se devi resettare la cache subito senza aspettare le 01:00 UTC:

```bash
touch /tmp/.metro-cache-purged
```

Poi **riavvia il workflow "Start App"** dal pannello Replit.  
Il flag viene rilevato da `metro-cache-check.sh`, Metro parte con `--reset-cache`.

In alternativa, usa il workflow **"Clean Metro"** che chiama `clean-metro-restart.sh` con `FORCE_RESET=1`.

---

## Come leggere i log di Cerbero per verificare la pulizia notturna

I log del job notturno vengono scritti in `logs/cerbero.log` con il prefisso `[metro-cache-nightly]`:

```bash
grep "metro-cache-nightly" logs/cerbero.log | tail -20
```

Messaggi attesi:
- `Avviato — pulizia notturna .metro-cache/ alle 01:00 UTC ogni giorno.` → job partito
- `Prossima pulizia in Xs (ore 01:00 UTC).` → job in attesa
- `OK: .metro-cache/ rimossa.` → cache cancellata
- `Flag scritto: /tmp/.metro-cache-purged` → Metro resettato al prossimo avvio

Se vedi `WARN: lock Metro ancora detenuto dopo 5 minuti — skip`, il job ha saltato la notte perché Metro era in avvio durante il momento di pulizia: si ripresenta domani.

---

## Script di supporto

| Script | Uso |
|--------|-----|
| `scripts/metro-cache-check.sh` | Sourciato da `start-expo.sh`: legge il flag e imposta `FORCE_RESET` |
| `scripts/metro-cache-nightly.sh` | Loop notturno: dorme → cancella cache → scrive flag |

---

## Fuori scope

- `/tmp/metro-file-map-*` — NON toccare salvo `CLEAN_METRO_CACHE=1` (regola esistente).
- Cache EAS / APK build — problema separato, usa `scripts/eas.sh`.
- Invalidazione basata su hash dei sorgenti — non implementata (troppo costosa).

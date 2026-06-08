---
name: Ollama nginx Host header fix
description: Ollama 0.24+ rifiuta richieste proxy se il Host header non è localhost — fix nginx ThinkCentre
---

# Ollama 0.24.x — Host header check + nginx coexistenza Tailscale

## La regola
Nel location block nginx che proxia verso Ollama, usare **sempre**:
```nginx
proxy_set_header Host "localhost";
proxy_set_header X-Real-IP "";
proxy_set_header X-Forwarded-For "";
```

**Why:** Ollama 0.24+ controlla il `Host` header in ingresso. Se vede qualcosa di diverso da `localhost`/`127.0.0.1`, ritorna 403 — anche con `OLLAMA_ORIGINS=*` attivo e token valido. Il 403 compare nei log GIN con l'IP esterno come client (perché GIN legge X-Real-IP/X-Forwarded-For).

**How to apply:** Ogni volta che nginx proxia verso `http://127.0.0.1:11434` (Ollama), usare questi tre proxy_set_header. Non passare l'IP reale del chiamante — Ollama non ne ha bisogno, l'auth è già fatta da nginx.

## nginx su ThinkCentre — conflitto porta Tailscale

**La regola:** nginx deve ascoltare sull'IP LAN specifico, non su `0.0.0.0`:
```nginx
listen 192.168.1.35:443 ssl;
# listen [::]:443 ssl;  # commentato: tailscale usa già [::]:443
```

**Why:** Tailscale (tailscaled) si lega a `100.91.225.19:443` e `[::]:443`. Se nginx usa `listen 0.0.0.0:443`, fallisce il bind a runtime — `nginx -s reload` mantiene i vecchi worker funzionanti ma `systemctl restart` abbatte tutto e non riesce a ripartire.

**How to apply:** Dopo ogni modifica che richiede restart nginx (non solo reload), verificare che il bind sia su `192.168.1.35:443`, non su `0.0.0.0:443`. Il restart è necessario per applicare modifiche ai worker.

## Sequenza fix applicata (giugno 2026)
1. Token aggiornato in nginx (hex 64-char)
2. `listen 0.0.0.0:443` → `listen 192.168.1.35:443` (conflitto Tailscale)
3. `OLLAMA_ORIGINS=*` aggiunto al service systemd ollama (non era la causa radice)
4. `X-Real-IP ""` e `X-Forwarded-For ""` nel proxy (non era la causa radice ma corretto)
5. `proxy_set_header Host "localhost"` → **causa radice del 403**

# Esporre i servizi self-host all'app BikerLink (tunnel + TLS)

Lo stack self-host (`infra/self-host/`) avvia GraphHopper, Valhalla, Postgres,
Redis e pgAdmin **solo su `localhost`** del PC di casa. L'app BikerLink deployata
su Replit gira nel cloud e **non può raggiungere `localhost`**: serve esporre i
due servizi di routing su un dominio pubblico in HTTPS e con autenticazione.

Questa cartella contiene due strade equivalenti — **scegline una**:

| | Cloudflare Tunnel | Nginx + Let's Encrypt |
|---|---|---|
| File | `cloudflared-config.yml` | `nginx-bikerlink.conf` |
| Serve IP pubblico statico | ❌ no | ✅ sì |
| Serve aprire porte sul router | ❌ no | ✅ 80/443 |
| TLS | gestito da Cloudflare | certbot (Let's Encrypt) |
| Ideale per | casa dietro CG-NAT / IP dinamico | VPS o casa con IP statico + DNS |

In **entrambi** i casi l'autenticazione applicativa resta sui token che l'app
invia già: `X-GH-Token` (= `GRAPHHOPPER_TOKEN`) per GraphHopper e
`X-Valhalla-Key` (= `VALHALLA_API_KEY`) per Valhalla. Anche se l'URL è pubblico,
senza token le richieste ottengono `401`.

> **Postgres e Redis restano privati.** Non vengono esposti né dal tunnel né da
> Nginx. Se ti serve l'accesso remoto al DB, usalo solo via VPN
> (WireGuard/Tailscale) o `cloudflared access` (TCP), mai come hostname HTTP
> pubblico.

---

## 0. Genera i token (una tantum)

Se non li hai già nel tuo `.env.local` / Secrets di Replit:

```bash
openssl rand -base64 32   # -> GRAPHHOPPER_TOKEN
openssl rand -base64 32   # -> VALHALLA_API_KEY
```

GraphHopper e Valhalla **non leggono i token loro stessi**: a verificarli è il
reverse proxy (Nginx) o — con Cloudflare Tunnel — il fatto che l'app è l'unica a
conoscerli. Devono coincidere tra il proxy e le variabili dell'app.

---

## Generazione automatica dei config (consigliata)

Invece di sostituire i segnaposto a mano, usa lo script `setup-expose.sh`: legge
i token dal `.env.local`, chiede dominio / origin / Tunnel UUID, **valida che i
token coincidano** con quelli del `.env.local` e produce i file già compilati
in `generated/`.

```bash
chmod +x setup-expose.sh
./setup-expose.sh
```

Output (token in chiaro, `chmod 600`, cartella ignorata da git):

- `generated/nginx-bikerlink.conf`
- `generated/cloudflared-config.yml`

I template originali (`nginx-bikerlink.conf`, `cloudflared-config.yml`) restano
intatti come riferimento. Modalità non-interattiva per scripting:

```bash
NONINTERACTIVE=1 BASE_DOMAIN=bikerlink.app APP_ORIGIN=https://bikerlink.app \
  TUNNEL_UUID=<uuid> ./setup-expose.sh
```

Variabili opzionali: `GRAPHHOPPER_TOKEN`, `VALHALLA_API_KEY` (override del
`.env.local`), `ENV_LOCAL_FILE` (percorso alternativo), `SKIP_TOKEN_VALIDATION=1`
(forza la generazione anche con token non coincidenti).

Se preferisci farlo a mano, segui le sezioni sottostanti.

---

## Opzione A — Cloudflare Tunnel (consigliata per il PC di casa)

Nessuna porta da aprire sul router, funziona anche dietro CG-NAT.

1. Installa `cloudflared` e crea il tunnel (vedi le istruzioni in testa a
   `cloudflared-config.yml`).
2. Crea i record DNS:
   ```bash
   cloudflared tunnel route dns bikerlink gh.bikerlink.app
   cloudflared tunnel route dns bikerlink valhalla.bikerlink.app
   ```
3. Copia `cloudflared-config.yml` in `/etc/cloudflared/config.yml`, sostituisci
   `__TUNNEL_UUID__` e `__BASE_DOMAIN__`, poi:
   ```bash
   sudo cloudflared service install
   sudo systemctl enable --now cloudflared
   ```
4. Verifica:
   ```bash
   curl https://gh.bikerlink.app/health
   curl https://valhalla.bikerlink.app/status
   ```

Con questa opzione l'autenticazione è data dal token applicativo. Per uno strato
extra puoi attivare **Cloudflare Access** (Zero Trust) sui due hostname e
richiedere un service token, ma non è obbligatorio.

---

## Opzione B — Nginx + Let's Encrypt (VPS / IP statico)

1. Punta i record DNS `A`/`AAAA` di `gh.bikerlink.app` e
   `valhalla.bikerlink.app` all'IP pubblico della macchina.
2. Installa Nginx e certbot, poi copia il config:
   ```bash
   sudo cp nginx-bikerlink.conf /etc/nginx/sites-available/bikerlink
   sudo ln -s /etc/nginx/sites-available/bikerlink /etc/nginx/sites-enabled/
   ```
3. Sostituisci i segnaposto nel file (`sed` o a mano):
   ```bash
   sudo sed -i \
     -e "s/__BASE_DOMAIN__/bikerlink.app/g" \
     -e "s|__APP_ORIGIN__|https://bikerlink.app|g" \
     -e "s/__GH_TOKEN__/IL_TUO_GRAPHHOPPER_TOKEN/g" \
     -e "s/__VALHALLA_KEY__/LA_TUA_VALHALLA_API_KEY/g" \
     /etc/nginx/sites-available/bikerlink
   ```
4. Emetti i certificati e ricarica:
   ```bash
   sudo certbot --nginx -d gh.bikerlink.app -d valhalla.bikerlink.app
   sudo nginx -t && sudo systemctl reload nginx
   ```
5. Verifica come nell'Opzione A.

> I servizi devono restare in ascolto su `127.0.0.1` (lo sono già via
> docker-compose, che pubblica le porte su localhost dell'host). Nginx fa da
> unico punto di ingresso pubblico.

---

## Punta l'app cloud agli URL pubblici

Nei **Secrets di Replit** (deploy cloud) imposta le variabili routing sugli URL
del tunnel **al posto di `localhost`**:

```
GRAPHHOPPER_URL=https://gh.bikerlink.app
GRAPHHOPPER_TOKEN=<lo stesso __GH_TOKEN__ del proxy>
VALHALLA_URL=https://valhalla.bikerlink.app
VALHALLA_API_KEY=<la stessa __VALHALLA_KEY__ del proxy>
ROUTING_DISABLED=0
```

- `server/graphhopper-client.ts` invia automaticamente `X-GH-Token` quando
  `GRAPHHOPPER_URL` è impostata.
- `server/routing/valhalla-client.ts` invia `X-Valhalla-Key` quando
  `VALHALLA_API_KEY` è impostata.

`DATABASE_URL` e `REDIS_URL` **non** cambiano in pubblico: il deploy cloud usa il
proprio Postgres/Redis gestito. Lo stack self-host serve solo per il routing.

---

## Test end-to-end

```bash
# Senza token -> 401 (auth funzionante)
curl -i https://gh.bikerlink.app/route

# Con token -> 200 / risposta valida
curl -s -H "X-GH-Token: $GRAPHHOPPER_TOKEN" \
  "https://gh.bikerlink.app/route?point=45.46,9.19&point=45.07,7.69&profile=motorcycle&points_encoded=false" \
  | head -c 200

# Valhalla con chiave
curl -s -H "X-Valhalla-Key: $VALHALLA_API_KEY" \
  -X POST https://valhalla.bikerlink.app/route \
  -d '{"locations":[{"lat":45.46,"lon":9.19},{"lat":45.07,"lon":7.69}],"costing":"motorcycle"}' \
  | head -c 200
```

## Troubleshooting

- **401 anche con token** → il token del proxy non coincide con quello dell'app,
  oppure (Nginx) non hai rieseguito `sed`/`reload` dopo la modifica.
- **502/504** → il container del servizio non è up: `docker compose ps`,
  `curl http://localhost:8989/health` sul PC.
- **CORS bloccato dal browser** → aggiorna `__APP_ORIGIN__` con l'origin esatto
  dell'app (incluso schema). Le chiamate server-to-server da Replit non sono
  soggette a CORS; questo conta solo per chiamate dirette dal browser.
- **Cloudflare 1033/1016** → il servizio `cloudflared` non gira o i record DNS
  non puntano al tunnel: `sudo systemctl status cloudflared`.

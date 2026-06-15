---
name: Deploy probe porta 8081 + GET / boot guard
description: Due cause del deploy fallito con stack=EXPO — probe porta 8081 e GET / che chiama DB durante init.
---

# Deploy probe porta 8081 + GET / boot guard

## Il problema (due cause indipendenti)

### Causa 1: piattaforma attende Metro su porta 8081
Con `[agent] stack = "EXPO"` in `.replit`, la piattaforma Replit si aspetta che Metro (dev server Expo) giri su porta 8081 anche in produzione. In produzione Metro non parte mai → dopo il timeout la piattaforma riporta `expected port 8081` → deploy fail.

### Causa 2: GET / restituisce 500 durante il boot
Il route handler di GET / in `server/site/routes.ts` chiama `getLandingImages()` → query DB (`storage.getAppSetting`) prima che il DB sia completamente warm. Se lancia → `next(err)` → error handler Express → HTTP 500. Il deploy probe colpisce GET / durante i primi secondi del boot e trova sempre 500.

**Nota**: Express logga solo le route `/api/*` — GET / non compare nei log → il problema era invisibile.

## Fix

### server/index.ts
Probe server minimale su `0.0.0.0:8081` solo se `NODE_ENV === "production"`:
```typescript
if (process.env.NODE_ENV === "production") {
  const probeApp = createProbeServer((_req, probeRes) => {
    probeRes.writeHead(200, { "Content-Type": "text/plain" });
    probeRes.end("ok");
  });
  probeApp.listen(8081, "0.0.0.0", ...);
  probeApp.on("error", (err) => { if (err.code !== "EADDRINUSE") console.warn(...); });
}
```
In sviluppo Metro occupa già la porta → `EADDRINUSE` ignorato silenziosamente.

### server/site/routes.ts
Import `initState` + guard prima della query DB:
```typescript
if (route === "/" && initState.initializing) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send("<!doctype html>...");
}
```
Dopo `initState.initializing = false` la landing page completa viene servita normalmente.

**Why:**
Il deploy probe della piattaforma colpisce GET / su porta 8081 (non 5000) durante il boot. Se 8081 non risponde → connection refused → probe fallisce → deploy fail. La seconda causa (GET / → 500) è un fallback di sicurezza: anche se il probe usasse porta 5000, la landing page non deve crashare durante il boot.

**How to apply:**
- Non rimuovere la guard `NODE_ENV === "production"` dal probe server — in dev causerebbe conflitto con Metro.
- Non aggiungere la guard agli altri route (es. `/features`, `/privacy`) — solo GET / chiama DB.
- Se si aggiungono altre route che chiamano DB in modo top-level (non lazy), aggiungere la stessa guard.

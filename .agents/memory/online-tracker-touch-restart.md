---
name: OnlineTracker touch() e restart server
description: Il metodo touch() del tracker online restituisce false se l'utente non è nel tracker — questo accade dopo ogni restart del server. Il heartbeat handler deve rilevare questo caso e richiamare setOnline() con i dati dal DB.
---

## Regola

`onlineTracker.touch(userId)` restituisce `false` quando l'utente NON è presente nella Map in-memory. Questo accade invariabilmente dopo un restart del server perché il tracker è in-memory puro.

Se il heartbeat handler chiama solo `touch()` senza gestire il `false`, i counter home (online/biker/zavorrine) restano a 0 dopo ogni restart per max 2 minuti (intervallo heartbeat), e non si ripopolano mai perché `touch()` non re-registra.

**Why:** L'OnlineTracker è stato progettato con `touch()` che aggiorna solo il timestamp di un entry esistente — non fa upsert. Il login chiama `setOnline()` con tutti i dati; il heartbeat originariamente assumeva che l'utente fosse già nel tracker (invariante che crolla al restart).

**How to apply:**

Nel heartbeat handler (`server/routes/auth/profile.ts`):

```ts
const wasTracked = onlineTracker.touch(userId);
if (!wasTracked) {
  Promise.all([storage.getUser(userId), storage.getUserProfile(userId)])
    .then(([user, profile]) => {
      if (!user || user.status !== "active" || user.isFake) return;
      const isGhost = user.ghostMode ?? false;
      onlineTracker.setOnline(userId, {
        role: user.role, nickname: user.nickname, status: user.status,
        userType: user.userType, isAvailable: !isGhost && (profile?.isAvailable ?? false),
        ghostMode: isGhost, country: user.country ?? null,
        isFake: user.isFake ?? false, isSystem: user.isSystem ?? false,
      });
    }).catch(() => {});
}
```

Il blocco è fire-and-forget (non blocca la risposta HTTP) perché è non-critico — se fallisce, il prossimo heartbeat ritenta.

Ogni volta che si modifica la firma di `setOnline()` o si aggiungono campi a `TrackedUser`, verificare che questo blocco di re-idratazione venga aggiornato di conseguenza.

---
name: MapScreen boot guard — isLoading || !user
description: MapScreen export default deve bloccare quando user=null (non solo isLoading), altrimenti useHomeMapState causa loop con user=null
---

## La regola

`export default function MapScreen()` in `app/(tabs)/index.tsx` DEVE avere:
```javascript
const { isLoading, user } = useAuth();
if (isLoading || !user) return <View style={{ flex: 1 }} />;
```

Non solo `if (isLoading)`.

**Why:** `useHomeMapState` contiene decine di useEffect che causano "Maximum update depth exceeded" quando `user=null`. Il redirect login dal TabLayout ha un delay di 150ms (hasWaited); durante quella finestra la home screen non deve montare `MapScreenContent`. Il bisect BootGate (OTA 206) ha confermato: steps 1-24 tutti passed, white screen solo dopo `bootComplete=true` (mount reale NormalRootLayout). Root cause: `MapScreen` rendeva `MapScreenContent` quando `isLoading=false` ma `user=null` (token scaduto o fresh install).

**How to apply:** Se il guard viene modificato o semplificato, verificare sempre che blocchi ENTRAMBE le condizioni: `isLoading=true` E `user=null`. Lo stesso pattern va applicato a qualsiasi screen che usa `useHomeMapState` o hook simili con molti useEffect dipendenti da user.

Fix deployato in OTA 207 (giugno 2026).

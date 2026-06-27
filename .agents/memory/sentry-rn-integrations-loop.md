---
name: Sentry RN integrations loop
description: @sentry/react-native default integrations causano loop React Navigation — usa integrations:[]
---

## Regola

`Sentry.init()` in `lib/sentry.ts` DEVE usare `integrations: []`.

**Why:** `@sentry/react-native` 8.x include `@sentry/react` con SentryReact profiler globale.
Quando il DSN è vuoto la init è no-op (innocuo). Con DSN reale, i default integrations
registrano un profiler che chiama `setState` dentro `commitLayoutEffects` → loop
"Maximum update depth exceeded" identico al pattern React Navigation setOptions.
Scoperto in OTA 217 (prima OTA con EXPO_PUBLIC_SENTRY_DSN baked); fixato in OTA 218.

**How to apply:** Qualsiasi modifica a `lib/sentry.ts` deve mantenere `integrations: []`.
NON ripristinare `integrations: (defaults) => defaults` né rimuovere il campo.
L'error capture base (crash reporting) funziona senza integrazioni aggiuntive.

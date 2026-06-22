---
name: Expo (tabs) route pollution
description: Why any non-route helper file inside app/(tabs)/ becomes a broken, tappable tab icon in BikerLink
---

# Non-route files inside `app/(tabs)/` become visible broken tabs

Any `.ts`/`.tsx` file placed directly in `app/(tabs)/` is auto-registered as a route by Expo Router. The custom tab bar (`renderCustomTabBar` in `app/(tabs)/_layout.tsx`) maps over **every** `state.routes` entry (filtering only on `tabBarButton`), so an unregistered file shows up as a tab icon. If the file has no default React component (e.g. a StyleSheet helper exporting `{ styles }`), tapping it errors.

**Why:** Expo Router treats the whole `app/` dir as the route tree; the custom tab bar does not restrict itself to the explicitly declared `<Tabs.Screen>` entries.

**How to apply:** Never co-locate helper files (`*.styles.ts`, `*.types.ts`, `*.helpers.ts`) directly in `app/(tabs)/`. Put them in `components/`, `lib/`, etc. and import via `@/`.

**Automated gate:** `scripts/post-merge.sh` contains a blocking gate ("Gate rotte fantasma app/(tabs)/") that scans `app/(tabs)/*.ts` and fails if any `.ts` file without `_` prefix is found. Gate added 2026-06-22. All files in app/(tabs)/ are currently clean (all helpers use `_` prefix).

**Latent issue (not yet fixed):** the same co-location pattern exists in non-tab route folders (`app/route/[id].styles.ts`, `app/profile/[id].styles.ts`, `app/giri/[id].styles.ts`, `app/navigate/[id].styles.ts`, `app/proposals/create.styles.ts`, `app/admin/analytics.styles.ts`). These are latent broken routes/deeplinks but invisible because those navigators are stacks, not the custom tab bar. Clean up if navigation weirdness appears.

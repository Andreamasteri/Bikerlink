---
name: Expo (tabs) route pollution
description: Why any non-route helper file inside app/(tabs)/ becomes a broken, tappable tab icon in BikerLink
---

# Non-route files inside `app/(tabs)/` become visible broken tabs

Any `.ts`/`.tsx` file placed directly in `app/(tabs)/` is auto-registered as a route by Expo Router. The custom tab bar (`renderCustomTabBar` in `app/(tabs)/_layout.tsx`) maps over **every** `state.routes` entry (filtering only on `tabBarButton`), so an unregistered file shows up as a tab icon. If the file has no default React component (e.g. a StyleSheet helper exporting `{ styles }`), tapping it errors.

**Why:** Expo Router treats the whole `app/` dir as the route tree; the custom tab bar does not restrict itself to the explicitly declared `<Tabs.Screen>` entries.

**How to apply:** Never co-locate helper files (`*.styles.ts`, `*.types.ts`, `*.helpers.ts`) directly in `app/(tabs)/`. Put them in `components/`, `lib/`, etc. and import via `@/`.

**IMPORTANT — what `_` prefix actually does:** Empirically (expo-router `getRoutes`, SDK 56), an `_`-prefixed NON-layout file is STILL registered as a route — both `edit.styles.ts` and `_edit.styles.ts` produce route nodes. Only `_layout` is special. So `_` prefix does NOT remove the ghost route. What actually keeps `app/(tabs)/` safe is the custom tab bar filter in `_layout.tsx` (it drops routes with no `tabBarIcon`), NOT the `_` prefix. In stack folders a ghost route is harmless-but-latent: an unused deeplink that warns "missing the required default export" only if loaded. The `_` prefix is therefore a TEAM CONVENTION (mark "not a screen") + the lever the gate enforces, not a true fix. The only thing that fully removes a ghost route is moving the file OUT of `app/` (into `components/`/`lib/`).

**Automated gates (both blocking, `scripts/post-merge.sh`):**
1. "Gate rotte fantasma app/(tabs)/" — scans `app/(tabs)/*.ts`, fails on any `.ts` without `_` prefix.
2. "Gate rotte fantasma stack app/**" — `find app -type f -name '*.ts' ! -path 'app/(tabs)/*' ! -name '_*'`, fails on any un-prefixed `.ts` recursively in stack folders.
Both added 2026-06-22.

**Stack-folder cleanup (done 2026-06-22):** all 37 co-located helper `.ts` files in non-tab route folders (`app/admin/**`, `app/profile/`, `app/giri`-style, `app/navigate/`, `app/proposals/`, `app/route/`, `app/motoclub/`, `app/chat/`, plus `app/notifications.*`) were renamed with a `_` prefix (e.g. `edit.styles.ts` → `_edit.styles.ts`) and all imports rewritten. `find` confirms 0 un-prefixed `.ts` remain outside `(tabs)`. Reproduce mass renames with a resolver script that resolves each import (`@/` → root, relative → resolve) to an absolute path, rewrites only matching specifiers' last segment, then renames files — naive basename grep is unsafe (generic names like `types.ts`/`styles.ts` collide).

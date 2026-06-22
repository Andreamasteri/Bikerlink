---
name: Expo (tabs) route pollution
description: Why any non-route helper file inside app/(tabs)/ becomes a broken, tappable tab icon in BikerLink
---

# Non-route files inside `app/(tabs)/` become visible broken tabs

Any `.ts`/`.tsx` file placed directly in `app/(tabs)/` is auto-registered as a route by Expo Router. The custom tab bar (`renderCustomTabBar` in `app/(tabs)/_layout.tsx`) maps over **every** `state.routes` entry (filtering only on `tabBarButton`), so an unregistered file shows up as a tab icon. If the file has no default React component (e.g. a StyleSheet helper exporting `{ styles }`), tapping it errors.

**Why:** Expo Router treats the whole `app/` dir as the route tree; the custom tab bar does not restrict itself to the explicitly declared `<Tabs.Screen>` entries.

**How to apply:** Never co-locate helper files (`*.styles.ts`, `*.types.ts`, `*.helpers.ts`) in `app/` (stack or tabs folders). Put them in `components/`, `lib/`, etc. and import via `@/`.

**IMPORTANT — what `_` prefix actually does:** Empirically (expo-router `getRoutes`, SDK 56), an `_`-prefixed NON-layout file is STILL registered as a route — both `edit.styles.ts` and `_edit.styles.ts` produce route nodes. Only `_layout` is special. So `_` prefix does NOT remove the ghost route. What actually keeps `app/(tabs)/` safe is the custom tab bar filter in `_layout.tsx` (it drops routes with no `tabBarIcon`), NOT the `_` prefix. The only thing that fully removes a ghost route is moving the file OUT of `app/` (into `components/`/`lib/`).

**DEFINITIVE FIX (2026-06-22):** All 38 helper `.ts`/`.tsx` files that had been renamed with `_` prefix in stack folders were moved out of `app/` entirely into `components/` (dropping the `_` prefix). Migration used a Python script that: (1) copies files with new names, (2) resolves all relative and `@/app/` imports to new `@/components/` paths, (3) deletes originals. 64 files had imports updated. Internal cross-references within moved files needed a second pass to fix (the copy had relative imports resolving to old absolute paths, not the new location).

**Automated gates (`scripts/post-merge.sh`):**
1. "Gate rotte fantasma app/(tabs)/" — scans `app/(tabs)/*.ts`, fails on any `.ts` without `_` prefix (keeps (tabs) helpers protected by the tab bar filter convention).
2. "Gate rotte fantasma stack app/**" — `find app -type f -name '*.ts' ! -path 'app/(tabs)/*'` with NO `_*` exception: fails on ANY `.ts` in stack app/ dirs (strengthened after the move — neither `_`-prefixed nor un-prefixed helpers are allowed there anymore).

---
name: Nested standalone Expo app expo-doctor duplicate-deps false positive
description: bowie-terminal (and any other standalone Expo app nested inside this repo's root workspace) will always fail expo-doctor's "no duplicate dependencies" check once its own node_modules exists, because the parent root is itself a full separate Expo app with its own react/react-native/expo-font.
---

Node's module resolution walks up the directory tree (`Module._nodeModulePaths`), so
running `npx expo-doctor` (or any tool using `expo-modules-autolinking`'s
`scanNativeModuleResolutions`) from `bowie-terminal/` will also discover the parent
repo root's `node_modules/react`, `react-native`, etc., and report them as
"duplicates" even though `bowie-terminal`'s own dependency graph is internally
consistent and Metro/Node will always resolve to the closer (bowie-terminal) copy
first at runtime.

**Why:** bowie-terminal is intentionally a fully separate standalone Expo app
living as a subdirectory of the main BikerLink repo (own package.json, own
node_modules, own bundle ID), but the main repo root is *also* a full Expo app
with its own react-native version. There's no npm/yarn workspace boundary
between them, so directory-tree-walking checks see both.

**How to apply:** When running `expo-doctor` inside `bowie-terminal/` (or any
future nested standalone app under this repo), a "Check that no duplicate
dependencies are installed" failure naming packages that also exist at repo
root (react, react-native, etc.) is expected environmental noise, not a real
bug. EAS builds run in isolation (EAS_PROJECT_ROOT), so the parent node_modules
are never present at build time.

**The fix (already applied in bowie-terminal/package.json):**
- `expo.install.exclude` — suppresses the version-check false-positive for
  react, react-native, react-native-safe-area-context, react-native-screens
  (parent's node_modules have newer minor versions than expo SDK 56 expects).
  Confirmed to work via `validateDependenciesVersions.js` in @expo/cli.
- `expo.autolinking.exclude` — suppresses the duplicate-detection false-positive
  for react and react-native. These two are NOT expo modules (no
  expo-module.config.js), so excluding them from expo-modules-autolinking is
  safe and has no effect on EAS builds. Confirmed via `autolinkingOptions.js` in
  expo-modules-autolinking — the `exclude` list builds the `excludeNames` set
  that filters packages before the duplicate check.
- `app.json` has an `expo.doctor._comment` entry documenting the rationale
  (app.json has NO actual per-check disable API for the duplicate check).

Don't try to "fix" it by touching the parent repo's react/react-native versions.

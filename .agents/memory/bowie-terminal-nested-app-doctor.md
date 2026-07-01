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
root (react, react-native, expo-font, etc.) is expected environmental noise,
not a real bug — verify by checking `Module._nodeModulePaths()` includes the
parent root, and confirm Metro's `getDefaultConfig` for the nested app has
empty `watchFolders`/`nodeModulesPaths` (i.e., it isn't merging module
resolution with the parent). Don't try to "fix" it by touching the parent
repo's react/react-native versions.

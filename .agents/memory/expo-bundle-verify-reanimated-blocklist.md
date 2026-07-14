---
name: Verifying "app bundles" after Expo dep changes
description: Why raw Metro dev=true bundle 500s on reanimated but expo export succeeds; use export as the authoritative bundle test.
---

# Verifying the app actually bundles after Expo dependency changes

When validating that the app still compiles after an Expo SDK/patch alignment, do NOT
rely on a raw Metro dev-bundle request like
`curl 'http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true'`.
It runs the full graph (~80s) and then fails with HTTP 500:
`Unable to resolve module react-native-reanimated/scripts/validate-worklets-version`.

**Why:** `metro.config.js` `config.resolver.blockList` contains `/\/scripts\//`, which
also matches `node_modules/react-native-reanimated/scripts/validate-worklets-version.js`.
reanimated's `src/platform-specific/workletsVersion.ts` statically imports that script, so
the dev-server resolver refuses it. This is a pre-existing repo quirk, orthogonal to expo
versions (reanimated + metro.config are both untouched by patch alignments; reanimated is
in `expo.install.exclude`).

**How to apply:** Use `npx expo export --platform android --output-dir /tmp/...` as the
authoritative "does it bundle for a build" test — it is the EAS build path and resolves
reanimated fine (EXIT=0, ~16MB Hermes bundle). If `expo export` passes and
`npx expo-doctor` reports 0 failures, the dependency change is bundle-clean even if the
raw dev-server bundle 500s. The 500 is NOT a regression introduced by the change.

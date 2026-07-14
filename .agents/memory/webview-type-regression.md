---
name: react-native-webview TypeScript regression (13.17.0 and 14.x)
description: index.d.ts declares WebView<P = undefined>; with TypeScript 6.x strict mode, WebViewProps & undefined = never, breaking all JSX <WebView> usages. Still shipped in 14.0.1.
---

# react-native-webview TypeScript regression (13.17.0 → still in 14.x)

## The rule
After every update to `react-native-webview`, verify that `node_modules/react-native-webview/index.d.ts` has `declare class WebView<P = {}>` (NOT `P = undefined`).

**Persists in 14.0.1** (verified 2026-07-14): the published `index.d.ts` still ships `WebView<P = undefined>`, so the baked patch remains necessary after the 13→14 major. The only 14.0.0 breaking change is Android minSdk→24 (Expo SDK 56 / RN 0.86 already require 24), and no JS props were removed (`originWhitelist` etc. unchanged).

**Why:** TypeScript 6.x strict mode + Expo's `customConditions: ["react-native"]` + `moduleResolution: bundler` resolves to `index.d.ts`. The class `WebView<P = undefined>` causes `WebViewProps & undefined = never` → all JSX `<WebView>` produce "No overload matches this call, props: never".

**How to apply:**
- Patch command: `sed -i 's/declare class WebView<P = undefined>/declare class WebView<P = {}>/' node_modules/react-native-webview/index.d.ts`
- This patch is baked into `scripts/post-merge.sh` (after npm install section) for persistence.
- Verify typecheck passes with `npx tsc --noEmit -p tsconfig.client.json`.

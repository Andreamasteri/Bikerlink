---
name: react-native-webview 13.17.0 TypeScript regression
description: In 13.17.0, index.d.ts declares WebView<P = undefined>; with TypeScript 6.x strict mode, WebViewProps & undefined = never, breaking all JSX <WebView> usages.
---

# react-native-webview 13.17.0 TypeScript regression

## The rule
After every update to `react-native-webview`, verify that `node_modules/react-native-webview/index.d.ts` has `declare class WebView<P = {}>` (NOT `P = undefined`).

**Why:** TypeScript 6.x strict mode + Expo's `customConditions: ["react-native"]` + `moduleResolution: bundler` resolves to `index.d.ts`. The class `WebView<P = undefined>` causes `WebViewProps & undefined = never` → all JSX `<WebView>` produce "No overload matches this call, props: never".

**How to apply:**
- Patch command: `sed -i 's/declare class WebView<P = undefined>/declare class WebView<P = {}>/' node_modules/react-native-webview/index.d.ts`
- This patch is baked into `scripts/post-merge.sh` (after npm install section) for persistence.
- Verify typecheck passes with `npx tsc --noEmit -p tsconfig.client.json`.

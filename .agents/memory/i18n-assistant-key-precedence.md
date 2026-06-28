---
name: i18n assistant key precedence trap
description: Italian aiAssistant.* strings are duplicated across two files; which wins depends on spread order in it.ts
---

Dopo il merge dei file i18n, NON esistono più i `*.part*.ts`: ogni lingua è un singolo file (`lib/i18n/<lang>.ts`). In `lib/i18n/it.ts` resta solo `import aiAssistantIt from "./ai-assistant-it"` spreddato PER PRIMO (`{...aiAssistantIt, ...<chiavi inline>}`); tutte le ex-chiavi dei part (incluse le ex-`it.part4.ts`) sono ora chiavi inline DENTRO `it.ts`, e vengono dopo lo spread → vincono su `ai-assistant-it.ts`.

Per qualsiasi chiave `aiAssistant.*` italiana presente in ENTRAMBI: la copia inline in `it.ts` vince, quella in `ai-assistant-it.ts` è dead. Chiavi duplicate storiche (ora inline in `it.ts`): `aiAssistant.title`, `aiAssistant.emptyHint`, `aiAssistant.inputPlaceholder`, `aiAssistant.prefs.*`, `aiAssistant.confirm.*`, `aiAssistant.tip.*`, `aiAssistant.trigger.ask`.

Chiavi SOLO in `ai-assistant-it.ts` (attive lì): `aiAssistant.tour.*`, `aiAssistant.admin.*`, `aiAssistant.subtitle`, `aiAssistant.trigger.home/map/profile`, `common.assistant*`.

English: nessuna duplicazione; `aiAssistant.*` vive solo in `en.ts` (non esiste `ai-assistant-en.ts`).

**Why:** rinominare l'assistente editando solo `ai-assistant-it.ts` non aveva effetto su title/prefs/emptyHint perché i duplicati (un tempo in `it.part4.ts`, oggi inline in `it.ts`) li sovrascrivono.
**How to apply:** prima di cambiare una stringa italiana `aiAssistant.*`, grep in ENTRAMBI i file; se la chiave esiste in `it.ts` (blocco inline), editala lì, non in `ai-assistant-it.ts`.

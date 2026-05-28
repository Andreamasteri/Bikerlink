// Task #2698 — Hook che valuta le regole proattive in base allo stato app +
// config admin + prefs utente. Throttling: cooldown 24h per tip, max 2/giorno
// totali, never durante schermate critiche (passare canShow=false in quei contesti).
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAssistantEnabled } from "./useAssistantEnabled";
import { logAssistantClientEvent } from "@/lib/ai-assistant/telemetry-client";
import type { AssistantTip } from "@/components/user/ai-assistant/AssistantTipBanner";

const TIP_STATE_PREFIX = "@bikerlink/assistant-tip:";
const DAILY_COUNT_KEY = "@bikerlink/assistant-tip-daily";
const COOLDOWN_MS = 24 * 3600 * 1000;
const DAILY_MAX = 2;
const STARTUP_GUARD_MS = 10_000;

interface TipState {
  lastShownAt?: number;
  dismissedForever?: boolean;
}

async function readTipState(key: string): Promise<TipState> {
  const raw = await AsyncStorage.getItem(TIP_STATE_PREFIX + key);
  if (!raw) return {};
  try { return JSON.parse(raw) as TipState; } catch { return {}; }
}

async function writeTipState(key: string, state: TipState): Promise<void> {
  await AsyncStorage.setItem(TIP_STATE_PREFIX + key, JSON.stringify(state));
}

async function readDailyCount(): Promise<{ day: string; count: number }> {
  const raw = await AsyncStorage.getItem(DAILY_COUNT_KEY);
  const day = new Date().toISOString().slice(0, 10);
  if (!raw) return { day, count: 0 };
  try {
    const parsed = JSON.parse(raw) as { day: string; count: number };
    if (parsed.day !== day) return { day, count: 0 };
    return parsed;
  } catch { return { day, count: 0 }; }
}

async function bumpDailyCount(): Promise<void> {
  const cur = await readDailyCount();
  await AsyncStorage.setItem(DAILY_COUNT_KEY, JSON.stringify({ day: cur.day, count: cur.count + 1 }));
}

const APP_START_AT = Date.now();

export interface ProactiveContext {
  canShow: boolean; // false in mappa fullscreen, tracking attivo, modali aperti
  fakePositionEnabledSinceMs?: number; // timestamp attivazione fake position
  ghostModeEnabledSinceMs?: number;
  isTrackingActive?: boolean;
  isGpsOn?: boolean;
  firstMapAccess?: boolean;
}

const PROACTIVE_TIPS: Array<{
  rule: string;
  messageKey: string;
  fallback: string;
  evaluate: (ctx: ProactiveContext) => boolean;
}> = [
  {
    rule: "fake-position-long-active",
    messageKey: "aiAssistant.tip.fakePositionLong",
    fallback: "La tua fake position è attiva da più di 7 giorni. Vuoi disattivarla?",
    evaluate: (c) => !!c.fakePositionEnabledSinceMs && (Date.now() - c.fakePositionEnabledSinceMs) > 7 * 24 * 3600 * 1000,
  },
  {
    rule: "first-map-access",
    messageKey: "aiAssistant.tip.firstMapAccess",
    fallback: "Benvenuto sulla mappa! Tocca un biker per vedere il profilo e proporre un match.",
    evaluate: (c) => !!c.firstMapAccess,
  },
  {
    rule: "gps-off-during-tracking",
    messageKey: "aiAssistant.tip.gpsOffTracking",
    fallback: "GPS spento durante il tracking — il percorso non verrà registrato. Riattivalo.",
    evaluate: (c) => !!c.isTrackingActive && c.isGpsOn === false,
  },
  {
    rule: "ghost-mode-long-active",
    messageKey: "aiAssistant.tip.ghostModeLong",
    fallback: "Sei in ghost mode da molto tempo. Vuoi tornare visibile agli altri biker?",
    evaluate: (c) => !!c.ghostModeEnabledSinceMs && (Date.now() - c.ghostModeEnabledSinceMs) > 7 * 24 * 3600 * 1000,
  },
];

export function useAssistantProactiveTips(ctx: ProactiveContext): {
  tip: AssistantTip | null;
  dismiss: () => void;
  disableForever: () => void;
} {
  const { proactiveEnabled, proactiveRules } = useAssistantEnabled();
  const [tip, setTip] = useState<AssistantTip | null>(null);

  const evaluate = useCallback(async () => {
    if (!proactiveEnabled || !ctx.canShow) { setTip(null); return; }
    if (Date.now() - APP_START_AT < STARTUP_GUARD_MS) { setTip(null); return; }

    const daily = await readDailyCount();
    if (daily.count >= DAILY_MAX) { setTip(null); return; }

    for (const def of PROACTIVE_TIPS) {
      if (!proactiveRules[def.rule]) continue;
      if (!def.evaluate(ctx)) continue;
      const st = await readTipState(def.rule);
      if (st.dismissedForever) continue;
      if (st.lastShownAt && (Date.now() - st.lastShownAt) < COOLDOWN_MS) continue;
      // candidato
      setTip({
        key: def.rule,
        messageKey: def.messageKey,
        message: def.fallback,
      });
      await writeTipState(def.rule, { ...st, lastShownAt: Date.now() });
      await bumpDailyCount();
      await logAssistantClientEvent("tip_shown", { rule: def.rule });
      return;
    }
    setTip(null);
  }, [proactiveEnabled, proactiveRules, ctx]);

  useEffect(() => { void evaluate(); }, [evaluate]);

  const dismiss = useCallback(() => {
    if (tip) void logAssistantClientEvent("tip_dismissed", { rule: tip.key });
    setTip(null);
  }, [tip]);

  const disableForever = useCallback(() => {
    if (!tip) return;
    void (async () => {
      const st = await readTipState(tip.key);
      await writeTipState(tip.key, { ...st, dismissedForever: true });
      await logAssistantClientEvent("tip_disabled_permanent", { rule: tip.key });
    })();
    setTip(null);
  }, [tip]);

  return { tip, dismiss, disableForever };
}

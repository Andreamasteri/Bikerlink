// Task #2698 — Registry client per eseguire azioni whitelisted dopo conferma.
// L'esecuzione fisica delle azioni "client" avviene qui (navigation, toggle,
// ecc.). Lato server l'endpoint /action/:id valida + logga.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { useRouter } from "expo-router";

const TIPS_DISABLED_KEY = "@bikerlink/assistant-tips-disabled";
const ONBOARDING_FLAG_KEY = "@bikerlink/assistant-onboarding-shown";

type AppRouter = ReturnType<typeof useRouter>;

export interface ClientActionContext {
  router: AppRouter;
  setLanguage?: (lang: string) => void;
  // Callback opzionali iniettati dai consumer (toggle fake position, ecc.)
  toggleFakePosition?: (enabled: boolean) => Promise<void> | void;
  toggleGhostMode?: (enabled: boolean) => Promise<void> | void;
}

export async function executeClientAction(
  actionId: string,
  params: Record<string, unknown>,
  ctx: ClientActionContext,
): Promise<{ ok: boolean; message?: string }> {
  switch (actionId) {
    case "open-screen": {
      const route = String(params.route ?? "");
      if (!route) return { ok: false, message: "route mancante" };
      try { ctx.router.push(route as never); return { ok: true }; }
      catch { return { ok: false, message: "navigazione fallita" }; }
    }
    case "open-notifications-settings":
      try { ctx.router.push("/profile/edit"); return { ok: true }; }
      catch { return { ok: false }; }
    case "open-profile-edit":
      try { ctx.router.push("/profile/edit"); return { ok: true }; }
      catch { return { ok: false }; }
    case "start-tracking":
      try { ctx.router.push("/(tabs)/tracking" as never); return { ok: true }; }
      catch { return { ok: false }; }
    case "change-language": {
      const lang = String(params.lang ?? "");
      if (!lang || !ctx.setLanguage) return { ok: false };
      ctx.setLanguage(lang);
      return { ok: true };
    }
    case "toggle-fake-position": {
      if (!ctx.toggleFakePosition) return { ok: false, message: "Apri Profilo › Privacy per gestire la fake position." };
      await ctx.toggleFakePosition(!!params.enabled);
      return { ok: true };
    }
    case "toggle-ghost-mode": {
      if (!ctx.toggleGhostMode) return { ok: false, message: "Apri Profilo › Privacy per gestire la modalità invisibile." };
      await ctx.toggleGhostMode(!!params.enabled);
      return { ok: true };
    }
    case "dismiss-all-tips":
      await AsyncStorage.setItem(TIPS_DISABLED_KEY, "1");
      return { ok: true };
    case "start-onboarding-tour":
      await AsyncStorage.removeItem(ONBOARDING_FLAG_KEY);
      return { ok: true };
    default:
      return { ok: false, message: "azione non supportata sul client" };
  }
}

export async function areAllTipsDismissed(): Promise<boolean> {
  return (await AsyncStorage.getItem(TIPS_DISABLED_KEY)) === "1";
}

export async function markOnboardingShown(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_FLAG_KEY, "1");
}

export async function wasOnboardingShown(): Promise<boolean> {
  return (await AsyncStorage.getItem(ONBOARDING_FLAG_KEY)) === "1";
}

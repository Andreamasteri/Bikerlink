// Task #940 — Collector segnale push token admin.
// Conta i push token validi degli admin (push_tokens + legacy users.expoPushToken).
// Se 0, emette severity "warn" così il watchdog lo mostra nella dashboard e avvisa
// che gli alert critici non vengono recapitati via push.
import { getAdminPushTokenCount } from "../../../push-notifications-internal";
import type { Signal } from "../types";

export async function collectPushTokens(): Promise<Signal[]> {
  try {
    const count = await getAdminPushTokenCount();
    if (count < 0) return []; // errore DB — skip senza emettere segnali spuri
    return [
      {
        source: "admin",
        metric: "push_tokens_count",
        value: count,
        unit: "token",
        severity: count === 0 ? "warn" : "info",
        details: {
          message:
            count === 0
              ? "Nessun admin ha token push registrati — gli alert critici non verranno recapitati"
              : `${count} token push admin attivi`,
        },
      },
    ];
  } catch {
    return [];
  }
}

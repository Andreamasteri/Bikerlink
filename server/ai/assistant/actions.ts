// Task #2698 — Whitelist azioni AI Assistant utente.
// L'agente può SOLO proporre actionId + params strutturati. Il server valida
// l'id contro un Set literal hardcoded (nessun eval/dynamic exec) e ritorna
// l'azione al client che la esegue dopo conferma esplicita dell'utente.
// La maggior parte delle azioni sono "client-side" (toggle pref locali,
// navigazione, dismiss tip): il server le validato e logga in telemetria,
// l'esecuzione effettiva avviene nel client.
import { z } from "zod";

export type ActionKind = "client" | "server";

export interface AssistantActionDef {
  id: string;
  kind: ActionKind;
  // Chiave i18n per il testo statico di conferma (NON generato dal LLM).
  confirmKey: string;
  // Descrizione esposta all'LLM nel system prompt (italiano, conciso).
  description: string;
  paramsSchema: z.ZodTypeAny;
}

export const ASSISTANT_ACTIONS = {
  "open-screen": {
    id: "open-screen",
    kind: "client" as const,
    confirmKey: "aiAssistant.action.openScreen.confirm",
    description: "Apre una schermata dell'app (route Expo). Param: route (stringa, es. '/profile', '/(tabs)', '/profile/edit').",
    paramsSchema: z.object({ route: z.string().min(1).max(120) }),
  },
  "toggle-fake-position": {
    id: "toggle-fake-position",
    kind: "client" as const,
    confirmKey: "aiAssistant.action.toggleFakePosition.confirm",
    description: "Attiva o disattiva la fake position dell'utente. Param: enabled (boolean).",
    paramsSchema: z.object({ enabled: z.boolean() }),
  },
  "toggle-ghost-mode": {
    id: "toggle-ghost-mode",
    kind: "client" as const,
    confirmKey: "aiAssistant.action.toggleGhostMode.confirm",
    description: "Attiva o disattiva la modalità invisibile (ghost mode). Param: enabled (boolean).",
    paramsSchema: z.object({ enabled: z.boolean() }),
  },
  "open-notifications-settings": {
    id: "open-notifications-settings",
    kind: "client" as const,
    confirmKey: "aiAssistant.action.openNotificationsSettings.confirm",
    description: "Apre le impostazioni notifiche dell'utente.",
    paramsSchema: z.object({}).optional().default({}),
  },
  "change-language": {
    id: "change-language",
    kind: "client" as const,
    confirmKey: "aiAssistant.action.changeLanguage.confirm",
    description: "Cambia lingua app. Param: lang (it|en|es|fr|de|el|tr).",
    paramsSchema: z.object({ lang: z.enum(["it", "en", "es", "fr", "de", "el", "tr"]) }),
  },
  "start-tracking": {
    id: "start-tracking",
    kind: "client" as const,
    confirmKey: "aiAssistant.action.startTracking.confirm",
    description: "Avvia il tracking di un nuovo giro.",
    paramsSchema: z.object({}).optional().default({}),
  },
  "dismiss-all-tips": {
    id: "dismiss-all-tips",
    kind: "client" as const,
    confirmKey: "aiAssistant.action.dismissAllTips.confirm",
    description: "Disattiva permanentemente tutti i suggerimenti proattivi dell'assistente.",
    paramsSchema: z.object({}).optional().default({}),
  },
  "start-onboarding-tour": {
    id: "start-onboarding-tour",
    kind: "client" as const,
    confirmKey: "aiAssistant.action.startOnboardingTour.confirm",
    description: "Avvia il tour guidato dell'app.",
    paramsSchema: z.object({}).optional().default({}),
  },
  "open-profile-edit": {
    id: "open-profile-edit",
    kind: "client" as const,
    confirmKey: "aiAssistant.action.openProfileEdit.confirm",
    description: "Apre la modifica del profilo utente.",
    paramsSchema: z.object({}).optional().default({}),
  },
  // Task #3097 — Aggiunta sosta a percorso pianificato dal chat AI.
  "add-waypoint-to-route": {
    id: "add-waypoint-to-route",
    kind: "server" as const,
    confirmKey: "aiAssistant.action.addWaypointToRoute.confirm",
    description: "Aggiunge una sosta/tappa a un percorso moto pianificato esistente dell'utente. Params: routeId (stringa, ID del percorso), waypointName (stringa, nome del luogo es. 'Bologna'), lat (numero, latitudine opzionale), lng (numero, longitudine opzionale). Usa lo strumento getUserPlannedRoutes per trovare il routeId corretto.",
    paramsSchema: z.object({
      routeId: z.string().min(1, "routeId obbligatorio"),
      waypointName: z.string().min(1, "waypointName obbligatorio").max(200),
      lat: z.number().finite().optional(),
      lng: z.number().finite().optional(),
    }),
  },
  // Task #5322 — Rinomina di un percorso pianificato dell'utente (ownership-checked
  // server-side). Params: routeId + newTitle. Usa getUserPlannedRoutes per il routeId.
  "rename-planned-route": {
    id: "rename-planned-route",
    kind: "server" as const,
    confirmKey: "aiAssistant.action.renamePlannedRoute.confirm",
    description: "Rinomina un percorso moto pianificato dell'utente. Params: routeId (stringa, ID del percorso), newTitle (stringa, nuovo titolo). Usa lo strumento getUserPlannedRoutes per trovare il routeId corretto.",
    paramsSchema: z.object({
      routeId: z.string().min(1, "routeId obbligatorio"),
      newTitle: z.string().min(1, "newTitle obbligatorio").max(120),
    }),
  },
  // Task #5322 — Eliminazione di un percorso pianificato dell'utente (ownership-checked).
  // Distruttiva: il client DEVE chiedere conferma esplicita prima di chiamare l'endpoint.
  "delete-planned-route": {
    id: "delete-planned-route",
    kind: "server" as const,
    confirmKey: "aiAssistant.action.deletePlannedRoute.confirm",
    description: "Elimina definitivamente un percorso moto pianificato dell'utente. Param: routeId (stringa, ID del percorso). Azione irreversibile: proponila solo se l'utente lo chiede esplicitamente. Usa getUserPlannedRoutes per trovare il routeId.",
    paramsSchema: z.object({
      routeId: z.string().min(1, "routeId obbligatorio"),
    }),
  },
} as const satisfies Record<string, AssistantActionDef>;

export type AssistantActionId = keyof typeof ASSISTANT_ACTIONS;

// Set literal hardcoded — usato per validare l'id ricevuto dal client.
const ACTION_IDS = new Set<string>(Object.keys(ASSISTANT_ACTIONS));

export function isWhitelistedAction(id: string): id is AssistantActionId {
  return ACTION_IDS.has(id);
}

export function validateActionParams(id: AssistantActionId, raw: unknown):
  | { ok: true; params: unknown }
  | { ok: false; error: string } {
  const def = ASSISTANT_ACTIONS[id];
  const parsed = def.paramsSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Parametri non validi" };
  }
  return { ok: true, params: parsed.data };
}

export function listActionsForPrompt(): string {
  return Object.values(ASSISTANT_ACTIONS)
    .map((a) => `- ${a.id}: ${a.description}`)
    .join("\n");
}

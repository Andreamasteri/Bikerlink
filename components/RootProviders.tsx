import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/lib/theme-context";
import { LanguageProvider } from "@/lib/language-context";
import { AuthProvider } from "@/lib/auth-context";
import { ChatSseProvider } from "@/lib/chat-sse-provider";
import { LocationProvider } from "@/lib/location-context";
import { MapSettingsProvider } from "@/lib/map-context";
import { TaskbarStyleProvider } from "@/lib/taskbar-style-context";
import { UnitsProvider } from "@/lib/units-context";
import { PlayerProvider } from "@/lib/player-context";
import { FloatingWidgetProvider } from "@/lib/floating-widget-context";
import { UptimeWidgetProvider } from "@/lib/uptime-widget-context";
import { AutoTelemetryProvider } from "@/lib/auto-telemetry-context";
import { queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

// ── Catena provider (outer → inner) ──────────────────────────────────────────
// Ordine corrente definito in PROVIDER_LAYERS sotto. REGOLA: qualsiasi nuovo
// provider DEVE esporre un context value memoizzato con useMemo (e callback con
// useCallback). Un value oggetto literal cambia referenza ad ogni render →
// re-render a cascata sui consumer → alimenta il loop setOptions di React
// Navigation ("Maximum update depth exceeded"). Gate: check-rnav-inline-props.sh.
// ─────────────────────────────────────────────────────────────────────────────

function ChatSseGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <ChatSseProvider enabled={!!user}>
      {children}
    </ChatSseProvider>
  );
}

function QueryLayer({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

function GestureLayer({ children }: { children: React.ReactNode }) {
  return <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>;
}

interface ProviderLayer {
  /** id stabile, combacia con gli step `kind: "provider"` in lib/boot-gate-steps.ts. */
  id: string;
  Component: React.ComponentType<{ children: React.ReactNode }>;
}

/**
 * Singola fonte di verità dell'ORDINE dei context provider (outer → inner).
 *
 * Consumata da:
 *  - RootProviders (percorso normale): monta TUTTI i layer → albero identico a prima.
 *  - components/boot-gate/BootGateProviderChain (Task #4979): monta i primi N layer
 *    incrementalmente per bisezionare quale provider crasha al boot.
 *
 * ⚠️  L'ordine qui DEVE restare allineato a PROVIDER_STEP_IDS in lib/boot-gate-steps.ts.
 */
export const PROVIDER_LAYERS: ProviderLayer[] = [
  { id: "theme", Component: ThemeProvider },
  { id: "language", Component: LanguageProvider },
  { id: "query", Component: QueryLayer },
  { id: "auth", Component: AuthProvider },
  { id: "chat_sse", Component: ChatSseGate },
  { id: "map_settings", Component: MapSettingsProvider },
  { id: "taskbar_style", Component: TaskbarStyleProvider },
  { id: "units", Component: UnitsProvider },
  { id: "location", Component: LocationProvider },
  { id: "player", Component: PlayerProvider },
  { id: "floating_widget", Component: FloatingWidgetProvider },
  { id: "uptime_widget", Component: UptimeWidgetProvider },
  { id: "auto_telemetry", Component: AutoTelemetryProvider },
  { id: "gesture_handler", Component: GestureLayer },
];

/**
 * Compone una catena di provider attorno a `children` rispettando l'ordine
 * outer→inner di `layers`. reduceRight parte dall'innermost così l'elemento di
 * `layers[0]` resta il più esterno (e con identità stabile quando si aggiungono
 * solo layer più interni — vedi BootGateProviderChain).
 */
export function composeProviders(
  layers: ProviderLayer[],
  children: React.ReactNode,
): React.ReactNode {
  return layers.reduceRight<React.ReactNode>(
    (acc, layer) => <layer.Component>{acc}</layer.Component>,
    children,
  );
}

interface RootProvidersProps {
  children: React.ReactNode;
  reportClientError: (error: Error, componentStack: string) => void;
}

export function RootProviders({
  children,
  reportClientError,
}: RootProvidersProps) {
  return (
    <ErrorBoundary onError={reportClientError}>
      {composeProviders(PROVIDER_LAYERS, children)}
    </ErrorBoundary>
  );
}

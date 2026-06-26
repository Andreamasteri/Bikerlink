import React from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
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
import { AutoTelemetryProvider } from "@/lib/auto-telemetry-context";
import { UptimeWidgetProvider } from "@/lib/uptime-widget-context";
import { queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

const _persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "@bikerlink/rq-cache-v1",
  throttleTime: 3000,
});

function ChatSseGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return (
    <ChatSseProvider enabled={!!user}>
      {children}
    </ChatSseProvider>
  );
}

/**
 * Wrapper del PersistQueryClientProvider, estratto in un componente named così da
 * poter comparire come singolo "layer" in PROVIDER_LAYERS. Il contenuto (client,
 * persistOptions, dehydrate) è identico alla versione inline storica.
 */
function QueryPersistLayer({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: _persister,
        maxAge: 24 * 60 * 60 * 1000,
        buster: "v2",
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0];
            if (typeof key !== "string") return false;
            return (
              key.startsWith("/api/settings/") ||
              key.startsWith("/api/ads/") ||
              key === "/api/settings/ads-enabled" ||
              key === "/api/settings/home-message" ||
              key === "/api/workshops"
            );
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
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
  { id: "query", Component: QueryPersistLayer },
  { id: "auth", Component: AuthProvider },
  { id: "chat_sse", Component: ChatSseGate },
  { id: "map_settings", Component: MapSettingsProvider },
  { id: "taskbar_style", Component: TaskbarStyleProvider },
  { id: "units", Component: UnitsProvider },
  { id: "location", Component: LocationProvider },
  { id: "player", Component: PlayerProvider },
  { id: "floating_widget", Component: FloatingWidgetProvider },
  { id: "uptime_widget", Component: UptimeWidgetProvider },
  { id: "gesture_handler", Component: GestureLayer },
  { id: "keyboard", Component: KeyboardProvider },
  { id: "auto_telemetry", Component: AutoTelemetryProvider },
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

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
      <ThemeProvider>
        <LanguageProvider>
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
            <AuthProvider>
              <ChatSseGate>
                <MapSettingsProvider>
                  <TaskbarStyleProvider>
                    <UnitsProvider>
                      <LocationProvider>
                        <PlayerProvider>
                          <UptimeWidgetProvider>
                            <GestureHandlerRootView style={{ flex: 1 }}>
                              <KeyboardProvider>
                                <AutoTelemetryProvider>
                                  {children}
                                </AutoTelemetryProvider>
                              </KeyboardProvider>
                            </GestureHandlerRootView>
                          </UptimeWidgetProvider>
                        </PlayerProvider>
                      </LocationProvider>
                    </UnitsProvider>
                  </TaskbarStyleProvider>
                </MapSettingsProvider>
              </ChatSseGate>
            </AuthProvider>
          </PersistQueryClientProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

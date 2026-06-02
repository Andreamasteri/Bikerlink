import React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
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
import { queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

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
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ChatSseGate>
                <MapSettingsProvider>
                  <TaskbarStyleProvider>
                    <UnitsProvider>
                      <LocationProvider>
                        <PlayerProvider>
                          <FloatingWidgetProvider>
                            <GestureHandlerRootView style={{ flex: 1 }}>
                              <KeyboardProvider>
                                {children}
                              </KeyboardProvider>
                            </GestureHandlerRootView>
                          </FloatingWidgetProvider>
                        </PlayerProvider>
                      </LocationProvider>
                    </UnitsProvider>
                  </TaskbarStyleProvider>
                </MapSettingsProvider>
              </ChatSseGate>
            </AuthProvider>
          </QueryClientProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

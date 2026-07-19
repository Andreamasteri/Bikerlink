import React, { Component } from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

type BoundaryState = { crashed: boolean };
type BoundaryProps = { children: React.ReactNode; label?: string };

/**
 * Lightweight ErrorBoundary for admin dashboard cards.
 * Shows a minimal fallback banner instead of crashing the whole admin screen.
 */
export class AdminCardErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // Best-effort: report to Sentry without blocking the boundary
    import("@/lib/sentry")
      .then((s) => s.captureException(error, { componentStack: info.componentStack }))
      .catch(() => {});
  }

  render() {
    if (this.state.crashed) {
      const label = this.props.label ?? "Dati non disponibili";
      return (
        <View style={styles.fallback} testID="admin-card-error-boundary-fallback">
          <Text style={styles.fallbackText}>{label}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  fallbackText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    fontStyle: "italic",
  },
});

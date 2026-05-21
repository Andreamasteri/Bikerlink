import React, { Component } from "react";
import { View, Text, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

type BoundaryState = { crashed: boolean; errorMessage: string };
type BoundaryProps = { children: React.ReactNode; onCrash: (msg: string) => void };

export class SensorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { crashed: false, errorMessage: "" };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { crashed: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error) {
    this.props.onCrash(error.message);
  }

  render() {
    if (this.state.crashed) {
      return (
        <View style={bs.container}>
          <Text style={bs.icon}>💥</Text>
          <Text style={bs.title}>Crash catturato dall'ErrorBoundary</Text>
          <Text style={bs.msg}>{this.state.errorMessage}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const bs = StyleSheet.create({
  container: { padding: 16, alignItems: "center", gap: 8 },
  icon: { fontSize: 28 },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.error,
    textAlign: "center",
  },
  msg: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 18,
  },
});

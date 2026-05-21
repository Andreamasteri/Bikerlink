import React from "react";
import { View, StyleSheet } from "react-native";
import Colors from "@/constants/colors";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  currentStep,
  totalSteps,
}) => {
  return (
    <View style={styles.stepIndicator}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <View
          key={i}
          style={[
            styles.stepDot,
            i + 1 <= currentStep ? styles.stepDotActive : null,
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  stepIndicator: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: 24,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.border,
  },
  stepDotActive: {
    backgroundColor: Colors.accent,
    width: 28,
  },
});

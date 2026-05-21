import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface NavigationButtonsProps {
  step: number;
  totalSteps: number;
  isPending: boolean;
  onNext: () => void;
}

export const NavigationButtons: React.FC<NavigationButtonsProps> = ({
  step,
  totalSteps,
  isPending,
  onNext,
}) => {
  return (
    <TouchableOpacity
      style={[styles.nextButton, isPending && styles.nextButtonDisabled]}
      onPress={onNext}
      disabled={isPending}
      testID="register-next"
    >
      {isPending ? (
        <ActivityIndicator color={Colors.background} />
      ) : (
        <Text style={styles.nextButtonText}>
          {step === totalSteps ? t("register.complete") : t("register.next")}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  nextButton: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButtonDisabled: {
    opacity: 0.7,
  },
  nextButtonText: {
    color: Colors.background,
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.5,
  },
});

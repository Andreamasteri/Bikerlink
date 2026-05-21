import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface StepUserTypeProps {
  userType: "biker" | "zavorrina" | "coppia" | "";
  setUserType: (type: "biker" | "zavorrina" | "coppia") => void;
}

export const StepUserType: React.FC<StepUserTypeProps> = ({ userType, setUserType }) => {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("register.step1.title")}</Text>
      <Text style={styles.stepSubtitle}>Seleziona il tuo profilo</Text>

      <View style={styles.typeGrid}>
        <TouchableOpacity
          style={[styles.typeCard, userType === "biker" && styles.typeCardSelected]}
          onPress={() => setUserType("biker")}
          testID="type-biker"
        >
          <Ionicons
            name="bicycle"
            size={48}
            color={userType === "biker" ? Colors.maleIcon : Colors.textSecondary}
          />
          <Text style={[styles.typeLabel, userType === "biker" && { color: Colors.maleIcon }]}>
            {t("register.step1.biker")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeCard, userType === "zavorrina" && styles.typeCardSelected]}
          onPress={() => setUserType("zavorrina")}
          testID="type-zavorrina"
        >
          <Ionicons
            name="person"
            size={48}
            color={userType === "zavorrina" ? Colors.femaleIcon : Colors.textSecondary}
          />
          <Text style={[styles.typeLabel, userType === "zavorrina" && { color: Colors.femaleIcon }]}>
            {t("register.step1.zavorrina")}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeCard, userType === "coppia" && styles.typeCardSelected]}
          onPress={() => setUserType("coppia")}
          testID="type-coppia"
        >
          <Ionicons
            name="people"
            size={48}
            color={userType === "coppia" ? Colors.accent : Colors.textSecondary}
          />
          <Text style={[styles.typeLabel, userType === "coppia" && { color: Colors.accent }]}>
            {t("register.step1.coppia")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  stepContent: {
    gap: 16,
    marginBottom: 24,
  },
  stepTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  stepSubtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  typeGrid: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 12,
  },
  typeCard: {
    width: 100,
    height: 120,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.border,
    gap: 8,
  },
  typeCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceLight,
  },
  typeLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
});

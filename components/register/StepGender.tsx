import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";

interface StepGenderProps {
  userType: "biker" | "zavorrina" | "coppia" | "";
  sex: "M" | "F" | "";
  setSex: (sex: "M" | "F") => void;
  coupleSexConfig: "M+M" | "M+F" | "F+F" | "";
  setCoupleSexConfig: (config: "M+M" | "M+F" | "F+F") => void;
}

export const StepGender: React.FC<StepGenderProps> = ({
  userType,
  sex,
  setSex,
  coupleSexConfig,
  setCoupleSexConfig,
}) => {
  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("register.step2.title")}</Text>

      {userType === "coppia" ? (
        <>
          <Text style={styles.stepSubtitle}>{t("register.step2.coupleConfig")}</Text>
          <View style={styles.sexGrid}>
            {(["M+M", "M+F", "F+F"] as const).map((config) => (
              <TouchableOpacity
                key={config}
                style={[styles.sexCard, coupleSexConfig === config && styles.sexCardSelected]}
                onPress={() => setCoupleSexConfig(config)}
                testID={`couple-${config}`}
              >
                <View style={styles.coupleIcons}>
                  <Ionicons
                    name={config.startsWith("M") ? "male" : "female"}
                    size={32}
                    color={coupleSexConfig === config ? Colors.accent : Colors.textSecondary}
                  />
                  <Text style={styles.plusSign}>+</Text>
                  <Ionicons
                    name={config.endsWith("M") ? "male" : "female"}
                    size={32}
                    color={coupleSexConfig === config ? Colors.accent : Colors.textSecondary}
                  />
                </View>
                <Text style={[styles.sexLabel, coupleSexConfig === config && styles.sexLabelSelected]}>
                  {config}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={styles.stepSubtitle}>{t("register.step2.gender")}</Text>
          <View style={styles.sexGrid}>
            <TouchableOpacity
              style={[styles.sexCard, styles.sexCardLarge, sex === "M" && styles.sexCardSelected]}
              onPress={() => setSex("M")}
              testID="gender-m"
            >
              <Ionicons
                name="male"
                size={56}
                color={sex === "M" ? Colors.maleIcon : Colors.textSecondary}
              />
              <Text style={[styles.sexLabel, sex === "M" && styles.sexLabelSelected]}>
                {t("register.step2.male")}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.sexCard, styles.sexCardLarge, sex === "F" && styles.sexCardSelected]}
              onPress={() => setSex("F")}
              testID="gender-f"
            >
              <Ionicons
                name="female"
                size={56}
                color={sex === "F" ? Colors.femaleIcon : Colors.textSecondary}
              />
              <Text style={[styles.sexLabel, sex === "F" && styles.sexLabelSelected]}>
                {t("register.step2.female")}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
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
  sexGrid: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 14,
    marginTop: 12,
  },
  sexCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.border,
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 8,
  },
  sexCardLarge: {
    width: 130,
    height: 130,
  },
  sexCardSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceLight,
  },
  sexLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  sexLabelSelected: {
    color: Colors.accent,
  },
  coupleIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  plusSign: {
    color: Colors.textSecondary,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
});

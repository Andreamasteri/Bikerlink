import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { t, getAppLanguage } from "@/lib/i18n";
import type { AppLanguage } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { getApiUrl } from "@/lib/query-client";

interface StepLegalProps {
  eulaAccepted: boolean;
  setEulaAccepted: (v: boolean) => void;
  privacyAccepted: boolean;
  setPrivacyAccepted: (v: boolean) => void;
  marketingAccepted: boolean;
  setMarketingAccepted: (v: boolean) => void;
  eulaTexts: Record<AppLanguage, string>;
}

export const StepLegal: React.FC<StepLegalProps> = ({
  eulaAccepted,
  setEulaAccepted,
  privacyAccepted,
  setPrivacyAccepted,
  marketingAccepted,
  setMarketingAccepted,
  eulaTexts,
}) => {
  const router = useRouter();

  return (
    <View style={styles.stepContent}>
      <Text style={styles.stepTitle}>{t("register.step4.title")}</Text>

      <View style={styles.eulaContainer}>
        <ScrollView style={styles.eulaScroll} nestedScrollEnabled>
          <Text style={styles.eulaText}>{eulaTexts[getAppLanguage()] ?? eulaTexts.it}</Text>
        </ScrollView>
        <TouchableOpacity
          onPress={() => Linking.openURL(new URL("/terms", getApiUrl()).toString())}
          style={styles.termsLinkRow}
        >
          <Text style={styles.termsLinkText}>{t("register.step4.tosLink")}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setEulaAccepted(!eulaAccepted)}
        testID="eula-checkbox"
      >
        <View style={[styles.checkbox, eulaAccepted && styles.checkboxChecked]}>
          {eulaAccepted && <Ionicons name="checkmark" size={16} color={Colors.background} />}
        </View>
        <Text style={styles.checkboxLabel}>{t("register.step4.accept")}</Text>
      </TouchableOpacity>

      <View style={styles.checkboxRow}>
        <TouchableOpacity
          onPress={() => setPrivacyAccepted(!privacyAccepted)}
          testID="privacy-checkbox"
        >
          <View style={[styles.checkbox, privacyAccepted && styles.checkboxChecked]}>
            {privacyAccepted && <Ionicons name="checkmark" size={16} color={Colors.background} />}
          </View>
        </TouchableOpacity>
        <View style={styles.privacyCheckboxLabel}>
          <TouchableOpacity onPress={() => setPrivacyAccepted(!privacyAccepted)}>
            <Text style={styles.checkboxLabel}>{t("register.step4.acceptPrivacy")} </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/privacy-policy")}>
            <Text style={styles.privacyLinkInline}>{t("register.step4.privacyLinkLabel")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setMarketingAccepted(!marketingAccepted)}
        testID="marketing-checkbox"
      >
        <View style={[styles.checkbox, marketingAccepted && styles.checkboxChecked]}>
          {marketingAccepted && <Ionicons name="checkmark" size={16} color={Colors.background} />}
        </View>
        <Text style={styles.checkboxLabel}>{t("register.step4.acceptMarketing")}</Text>
      </TouchableOpacity>
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
  eulaContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    height: 280,
    overflow: "hidden",
  },
  eulaScroll: {
    padding: 16,
  },
  eulaText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  termsLinkRow: {
    paddingVertical: 8,
    alignItems: "flex-end",
    paddingRight: 4,
  },
  termsLinkText: {
    fontSize: 12,
    color: Colors.accent,
    textDecorationLine: "underline",
    fontFamily: "Inter_500Medium",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  checkboxLabel: {
    color: Colors.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  privacyCheckboxLabel: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  privacyLinkInline: {
    fontSize: 14,
    color: Colors.accent,
    textDecorationLine: "underline",
    fontFamily: "Inter_500Medium",
  },
});

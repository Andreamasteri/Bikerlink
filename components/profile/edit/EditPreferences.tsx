import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from "react-native";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { type AppLanguage } from "@/lib/i18n";

interface EditPreferencesProps {
  language: string;
  setLanguage: (lang: AppLanguage) => void;
  showLanguageDropdown: boolean;
  setShowLanguageDropdown: (show: boolean) => void;
  widgetEnabled: boolean;
  onToggleWidget: (val: boolean) => void;
  adminWidgetEnabled: boolean;
  isUpdatingWidget?: boolean;
  handleDeleteAccount: () => void;
  setShowRevokeConsentModal: (show: boolean) => void;
}

const LANGUAGES: Array<{ label: string; value: AppLanguage; flag: string }> = [
  { label: "Italiano", value: "it", flag: "🇮🇹" },
  { label: "English", value: "en", flag: "🇬🇧" },
  { label: "Deutsch", value: "de", flag: "🇩🇪" },
  { label: "Español", value: "es", flag: "🇪🇸" },
  { label: "Français", value: "fr", flag: "🇫🇷" },
  { label: "Ελληνικά", value: "el", flag: "🇬🇷" },
  { label: "Türkçe", value: "tr", flag: "🇹🇷" },
];

export function EditPreferences({
  language,
  setLanguage,
  showLanguageDropdown,
  setShowLanguageDropdown,
  widgetEnabled,
  onToggleWidget,
  adminWidgetEnabled,
  isUpdatingWidget,
  handleDeleteAccount,
  setShowRevokeConsentModal,
}: EditPreferencesProps) {
  const t = useT();

  return (
    <>
      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>Lingua applicazione</Text>
        <View style={styles.langSection}>
          <TouchableOpacity
            style={styles.langDropdownTrigger}
            onPress={() => setShowLanguageDropdown(!showLanguageDropdown)}
          >
            <Text style={styles.langDropdownFlag}>
              {LANGUAGES.find((l) => l.value === language)?.flag}
            </Text>
            <Text style={styles.langDropdownLabel}>
              {LANGUAGES.find((l) => l.value === language)?.label}
            </Text>
            <Feather
              name={showLanguageDropdown ? "chevron-up" : "chevron-down"}
              size={20}
              color={Colors.textSecondary}
            />
          </TouchableOpacity>

          {showLanguageDropdown && (
            <View style={styles.langDropdownList}>
              {LANGUAGES.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  style={[
                    styles.langDropdownItem,
                    language === item.value && styles.langDropdownItemActive,
                  ]}
                  onPress={() => {
                    setLanguage(item.value);
                    setShowLanguageDropdown(false);
                  }}
                >
                  <Text style={styles.langDropdownItemFlag}>{item.flag}</Text>
                  <Text
                    style={[
                      styles.langDropdownItemLabel,
                      language === item.value &&
                        styles.langDropdownItemLabelActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {language === item.value && (
                    <Ionicons name="checkmark" size={20} color={Colors.accent} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>Impostazioni</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.toggleLabel, !adminWidgetEnabled && styles.toggleLabelDisabled]}>
              Widget di navigazione
            </Text>
            <Text style={styles.toggleSub}>
              {adminWidgetEnabled
                ? "Pallino flottante con bussola e accesso rapido durante la navigazione"
                : "Disabilitato dall'amministratore"}
            </Text>
          </View>
          <Switch
            value={adminWidgetEnabled ? widgetEnabled : false}
            onValueChange={onToggleWidget}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor="#fff"
            disabled={!adminWidgetEnabled || isUpdatingWidget}
          />
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.groupTitle}>Privacy e Sicurezza</Text>
        <TouchableOpacity
          style={styles.dangerMenuItem}
          onPress={() => setShowRevokeConsentModal(true)}
        >
          <MaterialCommunityIcons
            name="shield-off-outline"
            size={22}
            color={Colors.accentRed}
          />
          <Text style={styles.dangerMenuLabel}>Revoca consensi privacy</Text>
        </TouchableOpacity>

        <View style={{ height: 12 }} />

        <TouchableOpacity
          style={styles.dangerMenuItem}
          onPress={handleDeleteAccount}
        >
          <Ionicons name="trash-outline" size={22} color={Colors.accentRed} />
          <Text style={styles.dangerMenuLabel}>{t("profile.deleteAccount")}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  fieldGroup: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "600" as const,
    color: Colors.text,
    marginBottom: 16,
  },
  langSection: {
    marginBottom: 4,
  },
  langDropdownTrigger: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langDropdownFlag: {
    fontSize: 22,
  },
  langDropdownLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500" as const,
    color: Colors.text,
  },
  langDropdownList: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginTop: 4,
    overflow: "hidden" as const,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  langDropdownItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + "44",
  },
  langDropdownItemActive: {
    backgroundColor: Colors.accent + "12",
  },
  langDropdownItemFlag: {
    fontSize: 20,
  },
  langDropdownItemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500" as const,
    color: Colors.text,
  },
  langDropdownItemLabelActive: {
    color: Colors.accent,
    fontWeight: "600" as const,
  },
  toggleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: "500" as const,
    color: Colors.text,
  },
  toggleLabelDisabled: {
    color: Colors.textSecondary,
  },
  toggleSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  dangerMenuItem: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dangerMenuLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500" as const,
    color: Colors.accentRed,
  },
});

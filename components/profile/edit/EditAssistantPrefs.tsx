// Sezione unificata "Assistente & Widget" in Profilo › Modifica:
// raggruppa il toggle del FloatingWidget (pallino di navigazione) e le
// preferenze opt-out dell'assistente AI, dato che controllano lo stesso pallino.
import React from "react";
import { View, Text, Switch, StyleSheet, ActivityIndicator } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useT } from "@/lib/language-context";
import { useAssistantPrefs, useUpdateAssistantPrefs } from "@/hooks/useAssistantPrefs";
import { useAssistantEnabled } from "@/hooks/useAssistantEnabled";

interface EditAssistantPrefsProps {
  widgetEnabled: boolean;
  onToggleWidget: (val: boolean) => void;
  adminWidgetEnabled: boolean;
  isUpdatingWidget?: boolean;
}

export function EditAssistantPrefs({
  widgetEnabled,
  onToggleWidget,
  adminWidgetEnabled,
  isUpdatingWidget,
}: EditAssistantPrefsProps) {
  const colors = useColors();
  const t = useT();
  const prefsQ = useAssistantPrefs();
  const update = useUpdateAssistantPrefs();
  const { adminDisabledForPlatform } = useAssistantEnabled();
  const prefs = prefsQ.data?.prefs ?? {};

  const row = (
    label: string,
    hint: string | undefined,
    value: boolean,
    onChange: (v: boolean) => void,
    testID: string,
  ) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: colors.textSecondary }]}>{hint}</Text> : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onChange}
        disabled={update.isPending || adminDisabledForPlatform}
      />
    </View>
  );

  return (
    <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>Assistente & Widget</Text>
      <Text style={[styles.desc, { color: colors.textSecondary }]}>
        Il pallino flottante di navigazione include l'assistente AI: gestisci qui
        sia il widget che le preferenze dell'assistente.
      </Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text
            style={[
              styles.label,
              { color: adminWidgetEnabled ? colors.text : colors.textSecondary },
            ]}
          >
            Widget di navigazione
          </Text>
          <Text style={[styles.hint, { color: colors.textSecondary }]}>
            {adminWidgetEnabled
              ? "Pallino flottante con bussola e accesso rapido durante la navigazione"
              : "Disabilitato dall'amministratore"}
          </Text>
        </View>
        <Switch
          testID="widget-toggle"
          value={adminWidgetEnabled ? widgetEnabled : false}
          onValueChange={onToggleWidget}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor="#fff"
          disabled={!adminWidgetEnabled || isUpdatingWidget}
        />
      </View>

      <Text style={[styles.subheading, { color: colors.text }]}>
        {t("aiAssistant.prefs.title")}
      </Text>
      <Text style={[styles.desc, { color: colors.textSecondary }]}>
        {t("aiAssistant.prefs.description")}
      </Text>
      {adminDisabledForPlatform && (
        <Text style={[styles.warning, { color: colors.warning }]}>
          {t("aiAssistant.prefs.adminDisabled")}
        </Text>
      )}
      {prefsQ.isLoading ? (
        <ActivityIndicator />
      ) : (
        <>
          {row(
            t("aiAssistant.prefs.disable"),
            t("aiAssistant.prefs.disableHint"),
            !!prefs.disabled,
            (v) => update.mutate({ disabled: v }),
            "assistant-pref-disable",
          )}
          {row(
            t("aiAssistant.prefs.disableProactive"),
            t("aiAssistant.prefs.disableProactiveHint"),
            !!prefs.proactiveDisabled,
            (v) => update.mutate({ proactiveDisabled: v }),
            "assistant-pref-proactive",
          )}
          {row(
            t("aiAssistant.prefs.disableOnboarding"),
            undefined,
            !!prefs.onboardingDisabled,
            (v) => update.mutate({ onboardingDisabled: v }),
            "assistant-pref-onboarding",
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, gap: 10, marginTop: 16 },
  title: { fontSize: 17, fontWeight: "700" },
  subheading: { fontSize: 15, fontWeight: "700", marginTop: 8 },
  desc: { fontSize: 13, marginBottom: 4 },
  warning: { fontSize: 13, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  label: { fontSize: 15, fontWeight: "500" },
  hint: { fontSize: 12, marginTop: 2 },
});

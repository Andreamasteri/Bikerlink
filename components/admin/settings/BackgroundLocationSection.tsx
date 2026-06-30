import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Switch, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";

const styles = StyleSheet.create({
  accordionPanel: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accordionPanelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  accordionPanelTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  accordionPanelContent: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  paidCard: {
    backgroundColor: "rgba(0,0,0,0.02)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  synecoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  synecoInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  synecoLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  synecoDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  saveBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  saveBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: "#fff",
  },
});

const bgLocationStyles = StyleSheet.create({
  triggerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: 8,
    backgroundColor: Colors.surface,
  },
  triggerOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + "08",
  },
  triggerLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: Colors.text,
    marginBottom: 2,
  },
  triggerLabelActive: {
    color: Colors.accent,
  },
});

interface BackgroundLocationSectionProps {
  expanded: boolean;
  onToggle: () => void;
  standalone?: boolean;
  settings: {
    enabled: boolean;
    trigger: string;
    intervalSeconds: number;
    notificationText: string;
    ghostModeContinue: boolean;
  } | undefined;
  bgIntervalInput: string;
  setBgIntervalInput: (val: string) => void;
  bgNotificationTextInput: string;
  setBgNotificationTextInput: (val: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mutation body shape varies
  onMutation: (body: any) => void;
  isPending: boolean;
}

export function BackgroundLocationSection({
  expanded,
  onToggle,
  standalone,
  settings,
  bgIntervalInput,
  setBgIntervalInput,
  bgNotificationTextInput,
  setBgNotificationTextInput,
  onMutation,
  isPending,
}: BackgroundLocationSectionProps) {
  const t = useT();

  const content = (
    <>
      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="power" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Attivo Globalmente</Text>
          </View>
          <Switch
            value={settings?.enabled !== false}
            onValueChange={(val) => onMutation({ enabled: val })}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={settings?.enabled !== false ? Colors.text : Colors.textSecondary}
            disabled={isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {settings?.enabled !== false
            ? t("admin.bgTrackingActive")
            : t("admin.bgTrackingInactive")}
        </Text>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="git-branch" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>{t("admin.triggerMode")}</Text>
          </View>
        </View>
        <Text style={styles.synecoDesc}>Quando inviare la posizione in background:</Text>
        {[
          { value: "always", label: t("admin.alwaysSend"), desc: t("admin.alwaysSendDesc") },
          { value: "tracking", label: "Solo tracking attivo", desc: "Solo durante la registrazione di un percorso" },
          { value: "sos", label: "Solo SOS attivo", desc: "Solo durante un'emergenza SOS" },
          { value: "tracking_or_sos", label: "Tracking O SOS", desc: t("admin.trackingOrSosDesc") },
        ].map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => onMutation({ trigger: opt.value })}
            style={[
              bgLocationStyles.triggerOption,
              settings?.trigger === opt.value && bgLocationStyles.triggerOptionActive,
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[bgLocationStyles.triggerLabel, settings?.trigger === opt.value && bgLocationStyles.triggerLabelActive]}>
                {opt.label}
              </Text>
              <Text style={styles.synecoDesc}>{opt.desc}</Text>
            </View>
            {settings?.trigger === opt.value && (
              <Ionicons name="checkmark-circle" size={20} color={Colors.accent} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="timer" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Intervallo (secondi)</Text>
          </View>
        </View>
        <Text style={styles.synecoDesc}>Frequenza di invio posizione (min 10s, max 300s):</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
          <TextInput
            style={{ flex: 1, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text, fontSize: 14, backgroundColor: Colors.surface }}
            value={bgIntervalInput}
            onChangeText={setBgIntervalInput}
            keyboardType="number-pad"
            placeholder="30"
            placeholderTextColor={Colors.textSecondary}
          />
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => {
              const val = parseInt(bgIntervalInput, 10);
              if (isNaN(val) || val < 10 || val > 300) {
                Alert.alert(t("common.error"), t("admin.valueBetween10and300"));
                return;
              }
              onMutation({ intervalSeconds: val });
            }}
            disabled={isPending}
          >
            <Text style={styles.saveBtnText}>Salva</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="notifications" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Testo Notifica Persistente</Text>
          </View>
        </View>
        <Text style={styles.synecoDesc}>
          Usa {"{motivo}"} come placeholder dinamico (es. "tracking percorso", "SOS attivo", "monitoraggio generale"):
        </Text>
        <TextInput
          style={{ borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: Colors.text, fontSize: 14, backgroundColor: Colors.surface, marginTop: 10, height: 70, textAlignVertical: "top" }}
          value={bgNotificationTextInput}
          onChangeText={setBgNotificationTextInput}
          multiline
          placeholder="BikerLink: {motivo} — posizione attiva in background"
          placeholderTextColor={Colors.textSecondary}
        />
        <TouchableOpacity
          style={[styles.saveBtn, { alignSelf: "flex-end", marginTop: 8 }]}
          onPress={() => onMutation({ notificationText: bgNotificationTextInput })}
          disabled={isPending}
        >
          <Text style={styles.saveBtnText}>Salva Testo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.paidCard}>
        <View style={styles.synecoHeader}>
          <View style={styles.synecoInfo}>
            <Ionicons name="eye-off" size={20} color={Colors.accent} />
            <Text style={styles.synecoLabel}>Continua con Ghost Mode</Text>
          </View>
          <Switch
            value={settings?.ghostModeContinue === true}
            onValueChange={(val) => onMutation({ ghostModeContinue: val })}
            trackColor={{ false: Colors.border, true: Colors.accent }}
            thumbColor={settings?.ghostModeContinue ? Colors.text : Colors.textSecondary}
            disabled={isPending}
          />
        </View>
        <Text style={styles.synecoDesc}>
          {settings?.ghostModeContinue
            ? t("admin.ghostBgTracking")
            : "Il background location si interrompe quando l'utente attiva Ghost Mode"}
        </Text>
      </View>
    </>
  );

  if (standalone) {
    return <View>{content}</View>;
  }

  return (
    <View style={styles.accordionPanel}>
      <TouchableOpacity style={styles.accordionPanelHeader} onPress={onToggle}>
        <View style={styles.synecoInfo}>
          <Ionicons name="location" size={20} color={Colors.accent} />
          <Text style={styles.accordionPanelTitle}>Background Location</Text>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={Colors.textSecondary} />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.accordionPanelContent}>
          {content}
        </View>
      )}
    </View>
  );
}

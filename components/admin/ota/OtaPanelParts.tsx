/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { View, Text, TextInput, Switch, TouchableOpacity } from "react-native";
import { styles } from "./OtaPanel.styles";
import { OtaRelease, bootSuccessRate, formatDate } from "./OtaPanel.helpers";

interface AutoRollbackFieldProps {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  min: number;
  max: number;
  suffix?: string;
  colors: { text: string; textSecondary: string; surface: string; border: string };
}

export function AutoRollbackField({ label, value, onCommit, min, max, suffix, colors }: AutoRollbackFieldProps) {
  const [draft, setDraft] = useState(String(value));
  return (
    <View style={styles.autoFieldRow}>
      <Text style={[styles.autoFieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.autoFieldInputWrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TextInput
          style={[styles.autoFieldInput, { color: colors.text }]}
          value={draft}
          onChangeText={setDraft}
          onBlur={() => {
            const n = parseInt(draft, 10);
            if (Number.isFinite(n) && n >= min && n <= max && n !== value) {
              onCommit(n);
            } else {
              setDraft(String(value));
            }
          }}
          keyboardType="number-pad"
          returnKeyType="done"
        />
        {suffix ? <Text style={[styles.autoFieldSuffix, { color: colors.textSecondary }]}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

interface ReleaseCountersProps {
  release: OtaRelease;
  colors: any;
}

export function ReleaseCounters({ release, colors }: ReleaseCountersProps) {
  const rate = bootSuccessRate(release);
  return (
    <View style={styles.countersRow}>
      <View style={[styles.counterChip, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
        <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Download</Text>
        <Text style={[styles.counterValue, { color: colors.text }]}>{release.downloadCount}</Text>
      </View>
      <View style={[styles.counterChip, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
        <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Boot OK</Text>
        <Text style={[styles.counterValue, { color: colors.success }]}>{release.bootSuccessCount}</Text>
      </View>
      <View style={[styles.counterChip, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
        <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Boot FAIL</Text>
        <Text style={[styles.counterValue, { color: release.bootFailureCount > 0 ? colors.error : colors.text }]}>{release.bootFailureCount}</Text>
      </View>
      <View style={[styles.counterChip, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
        <Text style={[styles.counterLabel, { color: colors.textSecondary }]}>Success rate</Text>
        <Text style={[styles.counterValue, { color: rate == null ? colors.textSecondary : rate >= 70 ? colors.success : colors.error }]}>
          {rate == null ? "—" : `${rate}%`}
        </Text>
      </View>
    </View>
  );
}

interface AutoRollbackSectionProps {
  release: OtaRelease;
  expandedAutoId: string | null;
  setExpandedAutoId: (id: string | null) => void;
  onUpdate: (params: { id: string; patch: Record<string, unknown> }) => void;
  isUpdating: boolean;
  colors: any;
}

export function AutoRollbackSection({
  release,
  expandedAutoId,
  setExpandedAutoId,
  onUpdate,
  isUpdating,
  colors,
}: AutoRollbackSectionProps) {
  const expanded = expandedAutoId === release.id;
  return (
    <View style={[styles.autoRollbackBox, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}>
      <View style={styles.autoRollbackHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.autoRollbackTitle, { color: colors.text }]}>Auto-rollback</Text>
          <Text style={[styles.autoRollbackHint, { color: colors.textSecondary }]}>
            {release.autoRollbackEnabled
              ? `ATTIVO — se boot success <${release.autoRollbackThreshold}% con ≥${release.autoRollbackMinDownloads} download dopo ${release.autoRollbackWindowMinutes}min → auto-reject`
              : "OFF — rollback solo manuale da questo pannello"}
          </Text>
          {release.autoRolledBackAt && (
            <Text style={[styles.autoRollbackHint, { color: colors.error }]}>
              ⚠ Auto-rollback eseguito il {formatDate(release.autoRolledBackAt)}
            </Text>
          )}
        </View>
        <Switch
          value={release.autoRollbackEnabled}
          onValueChange={(val) => onUpdate({ id: release.id, patch: { enabled: val } })}
          disabled={isUpdating}
          trackColor={{ false: colors.border, true: colors.success }}
          thumbColor={release.autoRollbackEnabled ? "#fff" : colors.textSecondary}
        />
      </View>
      {release.autoRollbackEnabled && (
        <>
          <TouchableOpacity onPress={() => setExpandedAutoId(expanded ? null : release.id)} style={styles.expandToggle}>
            <Text style={[styles.expandToggleText, { color: colors.accent }]}>{expanded ? "▲ Nascondi parametri" : "▼ Modifica parametri"}</Text>
          </TouchableOpacity>
          {expanded && (
            <View style={styles.autoRollbackFields}>
              <AutoRollbackField
                label="Soglia % boot success"
                value={release.autoRollbackThreshold}
                onCommit={(n) => onUpdate({ id: release.id, patch: { threshold: n } })}
                min={1}
                max={100}
                suffix="%"
                colors={colors}
              />
              <AutoRollbackField
                label="Min downloads"
                value={release.autoRollbackMinDownloads}
                onCommit={(n) => onUpdate({ id: release.id, patch: { minDownloads: n } })}
                min={1}
                max={1000}
                colors={colors}
              />
              <AutoRollbackField
                label="Finestra (min)"
                value={release.autoRollbackWindowMinutes}
                onCommit={(n) => onUpdate({ id: release.id, patch: { windowMinutes: n } })}
                min={1}
                max={1440}
                colors={colors}
              />
            </View>
          )}
        </>
      )}
    </View>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { styles } from "./OtaPanel.styles";
import { OtaRelease, getStatusColor, getStatusLabel, formatDate } from "./OtaPanel.helpers";
import { ReleaseCounters, AutoRollbackSection } from "./OtaPanelParts";
import OtaFailureDevices from "./OtaFailureDevices";

interface PendingReleaseCardProps {
  release: OtaRelease;
  otaNum: string;
  colors: any;
  tryingId: string | null;
  approvingId: string | null;
  rejectingId: string | null;
  handleTryOta: (r: OtaRelease) => void;
  handleApprove: (r: OtaRelease) => void;
  handleReject: (r: OtaRelease) => void;
  handleSetVersion: (r: OtaRelease) => void;
  expandedAutoId: string | null;
  setExpandedAutoId: (id: string | null) => void;
  autoRollbackMutation: any;
  republishingId: string | null;
  handleRepublish: (r: OtaRelease) => void;
}

export function PendingReleaseCard({
  release, otaNum, colors, tryingId, approvingId, rejectingId,
  handleTryOta, handleApprove, handleReject, handleSetVersion,
  expandedAutoId, setExpandedAutoId, autoRollbackMutation,
  republishingId, handleRepublish
}: PendingReleaseCardProps) {
  const hasGroupId = !!release.easGroupId;
  return (
    <View key={release.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: hasGroupId ? colors.accent + "44" : colors.error + "55" }]}>
      <View style={styles.cardHeader}>
        <View style={styles.badgeRow}>
          <View style={[styles.numBadge, { backgroundColor: colors.accent }]}>
            <Text style={styles.numBadgeText}>OTA {otaNum}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: colors.accent + "22" }]}>
            <Text style={[styles.badgeText, { color: colors.accent }]}>IN ATTESA</Text>
          </View>
          {hasGroupId
            ? (
              <View style={[styles.badge, { backgroundColor: colors.success + "22", marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: colors.success }]}>● GroupID OK</Text>
              </View>
            )
            : (
              <View style={[styles.badge, { backgroundColor: colors.error + "22", marginLeft: 6 }]}>
                <Text style={[styles.badgeText, { color: colors.error }]}>⚠ RISINCRONIZZA</Text>
              </View>
            )}
        </View>
        <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(release.publishedAt)}</Text>
      </View>

      {release.otaVersion
        ? <Text style={[styles.versionText, { color: colors.text }]}>{release.otaVersion}</Text>
        : (
          <TouchableOpacity onPress={() => handleSetVersion(release)} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.versionText, { color: colors.textSecondary, fontStyle: "italic" }]}>— versione non impostata</Text>
            <Text style={[styles.badgeText, { color: colors.accent }]}>Imposta ›</Text>
          </TouchableOpacity>
        )}

      {release.message
        ? <Text style={[styles.messageText, { color: colors.text }]}>{release.message}</Text>
        : <Text style={[styles.messageText, { color: colors.textSecondary, fontStyle: "italic" }]}>Nessun messaggio</Text>}

      <Text selectable style={[styles.metaText, { color: colors.textSecondary }]}>
        ID: {release.easUpdateId}
      </Text>
      {release.runtimeVersion && (
        <Text style={[styles.metaText, { color: colors.textSecondary }]}>Runtime: {release.runtimeVersion}</Text>
      )}

      <ReleaseCounters release={release} colors={colors} />
      {release.bootFailureCount > 0 && <OtaFailureDevices releaseId={release.id} />}
      <AutoRollbackSection
        release={release}
        expandedAutoId={expandedAutoId}
        setExpandedAutoId={setExpandedAutoId}
        onUpdate={(patch) => autoRollbackMutation.mutate({ id: release.id, patch })}
        isUpdating={autoRollbackMutation.isPending}
        colors={colors}
      />
      {!hasGroupId && (
        <View style={[styles.warningBox, { backgroundColor: colors.error + "11", borderColor: colors.error + "44" }]}>
          <Text style={[styles.warningText, { color: colors.error }]}>
            Questa release non ha un GroupID EAS valido. Premi "☁ Sync EAS" in alto per risincronizzare, poi riprova ad approvare.
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.surfaceLight, borderColor: colors.border }]}
          onPress={() => handleTryOta(release)}
          disabled={tryingId === release.id}
        >
          {tryingId === release.id
            ? <ActivityIndicator size="small" color={colors.text} />
            : <Text style={[styles.actionBtnText, { color: colors.text }]}>🔬 Prova OTA</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, {
            backgroundColor: hasGroupId ? colors.success : colors.textSecondary + "33",
            borderColor: hasGroupId ? colors.success : colors.textSecondary + "55",
            opacity: hasGroupId ? 1 : 0.5,
          }]}
          onPress={() => handleApprove(release)}
          disabled={!hasGroupId || approvingId === release.id}
          accessibilityState={{ disabled: !hasGroupId || approvingId === release.id }}
        >
          {approvingId === release.id
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={[styles.actionBtnText, { color: hasGroupId ? "#fff" : colors.textSecondary }]}>
                {hasGroupId ? "✓ Approva e Distribuisci" : "✗ Approva (GroupID mancante)"}
              </Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: "transparent", borderColor: colors.error }]}
          onPress={() => handleReject(release)}
          disabled={rejectingId === release.id}
        >
          {rejectingId === release.id
            ? <ActivityIndicator size="small" color={colors.error} />
            : <Text style={[styles.actionBtnText, { color: colors.error }]}>✗ Rifiuta</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, {
            backgroundColor: "transparent",
            borderColor: release.easGroupId ? colors.success : colors.textSecondary + "55",
            opacity: release.easGroupId ? 1 : 0.5,
          }]}
          onPress={() => handleRepublish(release)}
          disabled={republishingId === release.id || !release.easGroupId}
        >
          {republishingId === release.id
            ? <ActivityIndicator size="small" color={colors.success} />
            : <Text style={[styles.actionBtnText, { color: release.easGroupId ? colors.success : colors.textSecondary }]}>📡 Republica per test</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface HistoryReleaseCardProps {
  release: OtaRelease;
  otaNum: string;
  colors: any;
  rollingBackId: string | null;
  handleRollback: (r: OtaRelease) => void;
  expandedHistoryId: string | null;
  setExpandedHistoryId: (id: string | null) => void;
  expandedAutoId: string | null;
  setExpandedAutoId: (id: string | null) => void;
  autoRollbackMutation: any;
  republishingId: string | null;
  handleRepublish: (r: OtaRelease) => void;
}

export function HistoryReleaseCard({
  release, otaNum, colors, rollingBackId, handleRollback,
  expandedHistoryId, setExpandedHistoryId, expandedAutoId, setExpandedAutoId, autoRollbackMutation,
  republishingId, handleRepublish
}: HistoryReleaseCardProps) {
  const isObsolete = release.status === "rejected" && release.rejectedBy === null;
  const sc = getStatusColor(release.status, colors);

  if (isObsolete) {
    const isExpObs = expandedHistoryId === release.id;
    return (
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <TouchableOpacity
          style={styles.cardHeader}
          onPress={() => setExpandedHistoryId(isExpObs ? null : release.id)}
          activeOpacity={0.7}
        >
          <View style={styles.badgeRow}>
            <View style={[styles.numBadge, { backgroundColor: colors.textSecondary + "99" }]}>
              <Text style={styles.numBadgeText}>OTA {otaNum}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: colors.textSecondary + "22" }]}>
              <Text style={[styles.badgeText, { color: colors.textSecondary }]}>OBSOLETA</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(release.publishedAt)}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{isExpObs ? "▲" : "▼"}</Text>
          </View>
        </TouchableOpacity>
        {isExpObs && (
          <>
            {release.otaVersion && (
              <Text style={[styles.versionText, { color: colors.text }]}>{release.otaVersion}</Text>
            )}
            {release.message && (
              <Text style={[styles.messageText, { color: colors.text }]}>{release.message}</Text>
            )}
            <Text selectable style={[styles.metaText, { color: colors.textSecondary }]}>
              ID: {release.easUpdateId}
            </Text>
            {release.easGroupId ? (
              <TouchableOpacity
                style={[styles.rollbackBtn, { borderColor: colors.success }]}
                onPress={() => handleRepublish(release)}
                disabled={republishingId === release.id}
              >
                {republishingId === release.id
                  ? <ActivityIndicator size="small" color={colors.success} />
                  : <Text style={[styles.rollbackBtnText, { color: colors.success }]}>📡 Republica per test (→ pending)</Text>}
              </TouchableOpacity>
            ) : (
              <Text style={[styles.metaText, { color: colors.error }]}>⚠ GroupID mancante — esegui ☁ Sync EAS</Text>
            )}
          </>
        )}
      </View>
    );
  }

  const isExpanded = expandedHistoryId === release.id;
  return (
    <View key={release.id} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpandedHistoryId(isExpanded ? null : release.id)}
        activeOpacity={0.7}
      >
        <View style={styles.badgeRow}>
          <View style={[styles.numBadge, { backgroundColor: colors.accent }]}>
            <Text style={styles.numBadgeText}>OTA {otaNum}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sc + "22" }]}>
            <Text style={[styles.badgeText, { color: sc }]}>
              {getStatusLabel(release.status).toUpperCase()}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={[styles.dateText, { color: colors.textSecondary }]}>{formatDate(release.publishedAt)}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</Text>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <>
          <Text style={[styles.versionText, { color: colors.text }]}>{release.otaVersion ?? "—"}</Text>
          {release.message && (
            <Text style={[styles.messageText, { color: colors.text }]}>{release.message}</Text>
          )}
          {release.approvedAt && <Text style={[styles.metaText, { color: colors.textSecondary }]}>Approvata: {formatDate(release.approvedAt)}</Text>}
          {release.rejectedAt && <Text style={[styles.metaText, { color: colors.textSecondary }]}>Rifiutata: {formatDate(release.rejectedAt)}</Text>}
          <ReleaseCounters release={release} colors={colors} />
          {release.bootFailureCount > 0 && <OtaFailureDevices releaseId={release.id} />}
          {release.status === "approved" && (
            <AutoRollbackSection
              release={release}
              expandedAutoId={expandedAutoId}
              setExpandedAutoId={setExpandedAutoId}
              onUpdate={(patch) => autoRollbackMutation.mutate({ id: release.id, patch })}
              isUpdating={autoRollbackMutation.isPending}
              colors={colors}
            />
          )}
          {release.status === "approved" && (
            <TouchableOpacity
              style={[styles.rollbackBtn, { borderColor: colors.accent }]}
              onPress={() => handleRollback(release)}
              disabled={rollingBackId === release.id}
            >
              {rollingBackId === release.id
                ? <ActivityIndicator size="small" color={colors.accent} />
                : <Text style={[styles.rollbackBtnText, { color: colors.accent }]}>↩ Rollback (eas update --republish)</Text>}
            </TouchableOpacity>
          )}
          {release.easGroupId && (
            <TouchableOpacity
              style={[styles.rollbackBtn, { borderColor: colors.success }]}
              onPress={() => handleRepublish(release)}
              disabled={republishingId === release.id}
            >
              {republishingId === release.id
                ? <ActivityIndicator size="small" color={colors.success} />
                : <Text style={[styles.rollbackBtnText, { color: colors.success }]}>📡 Republica per test (→ pending)</Text>}
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}

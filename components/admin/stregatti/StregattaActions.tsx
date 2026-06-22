import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface MotionStatus {
  enabled: boolean;
  totalFakeUsers: number;
  movingNow: number;
  restingNow: number;
  lastCycleAt: string | null;
  totalCycles: number;
  lastCycleDurationMs?: number;
  speedDistribution?: { city: number; highway: number; mountain: number };
  averageSpeedKph?: number;
  convoiRiders?: number;
}

interface BboxData {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
  enabled: boolean;
}

interface StregattaActionsProps {
  chatbotEnabled: boolean;
  onToggleChatbot: (val: boolean) => void;
  allEnabled: boolean;
  onToggleAll: (val: boolean) => void;
  motionStatus: MotionStatus | null;
  onToggleMotion: (val: boolean) => void;
  isTogglingMotion: boolean;
  bboxData: BboxData | null;
  onToggleBbox: (val: boolean) => void;
  isTogglingBbox: boolean;
  onMassSeed: () => void;
  onWakeAll: () => void;
  onDistribute: () => void;
  onForceMatching: () => void;
  onResetMatches: () => void;
  onDeleteAll: () => void;
  onCreateNew: () => void;
  isMassSeedRunning: boolean;
  massSeedCreated: number;
  massSeedTotal: number;
  massSeedError: string | null;
  isWakingAll: boolean;
  isDistributing: boolean;
  isForcingMatching: boolean;
  isResettingMatches: boolean;
  totalCount: number;
  t: (key: string) => string;
}

export function StregattaActions({
  chatbotEnabled,
  onToggleChatbot,
  allEnabled,
  onToggleAll,
  motionStatus,
  onToggleMotion,
  isTogglingMotion,
  bboxData,
  onToggleBbox,
  isTogglingBbox,
  onMassSeed,
  onWakeAll,
  onDistribute,
  onForceMatching,
  onResetMatches,
  onDeleteAll,
  onCreateNew,
  isMassSeedRunning,
  massSeedCreated,
  massSeedTotal,
  massSeedError,
  isWakingAll,
  isDistributing,
  isForcingMatching,
  isResettingMatches,
  totalCount,
}: StregattaActionsProps) {
  // Cascade: sub-options are forced OFF and locked while global visibility is OFF.
  const motionEnabled = allEnabled && (motionStatus?.enabled ?? false);
  const subOptionsLocked = !allEnabled;
  const bboxEnabled = bboxData?.enabled ?? true;

  const formatLastCycle = (iso: string | null): string => {
    if (!iso) return "Mai";
    const d = new Date(iso);
    return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  return (
    <View style={styles.container}>
      <View style={styles.controlsCard}>
        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Ionicons name="people" size={24} color={Colors.accent} />
            <Text style={styles.controlLabel}>Visibilità Globale</Text>
          </View>
          <Switch
            value={allEnabled}
            onValueChange={onToggleAll}
            trackColor={{ false: "#767577", true: Colors.accent }}
            thumbColor={Platform.OS === "ios" ? "#fff" : allEnabled ? "#fff" : "#f4f3f4"}
          />
        </View>
        <Text style={styles.controlDesc}>
          Nascondi o mostra tutti gli stregatti contemporaneamente.
        </Text>

        <View style={styles.controlDivider} />

        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Ionicons name="chatbubble-ellipses" size={24} color={Colors.accent} />
            <Text style={styles.controlLabel}>Stregatti Chatbot</Text>
          </View>
          <Switch
            value={chatbotEnabled}
            onValueChange={onToggleChatbot}
            disabled={subOptionsLocked}
            trackColor={{ false: "#767577", true: Colors.accent }}
            thumbColor={Platform.OS === "ios" ? "#fff" : chatbotEnabled ? "#fff" : "#f4f3f4"}
          />
        </View>
        <Text style={styles.controlDesc}>
          Se attivo, gli stregatti risponderanno automaticamente usando l'IA.
        </Text>

        <View style={styles.controlDivider} />

        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Ionicons name="navigate" size={24} color={Colors.accent} />
            <Text style={styles.controlLabel}>Attività stregatti</Text>
          </View>
          {isTogglingMotion ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Switch
              value={motionEnabled}
              onValueChange={onToggleMotion}
              disabled={subOptionsLocked}
              trackColor={{ false: "#767577", true: Colors.accent }}
              thumbColor={Platform.OS === "ios" ? "#fff" : motionEnabled ? "#fff" : "#f4f3f4"}
            />
          )}
        </View>
        <Text style={styles.controlDesc}>
          Un solo interruttore per movimento + rotazione disponibilità: simula spostamenti GPS
          realistici (giri brevi, trasferimenti lunghi, comitive) e ruota chi è disponibile.
        </Text>
        {subOptionsLocked && (
          <Text style={styles.lockedHint}>
            Attiva la Visibilità Globale per abilitare l'attività.
          </Text>
        )}

        {motionStatus && (
          <View style={styles.motionStats}>
            <View style={styles.motionStatRow}>
              <Ionicons name="radio-button-on" size={12} color={motionEnabled ? "#4CAF50" : Colors.textSecondary} />
              <Text style={[styles.motionStatText, motionEnabled && { color: "#4CAF50" }]}>
                {motionStatus.movingNow} / {motionStatus.totalFakeUsers} in moto
              </Text>
            </View>
            {motionEnabled && (motionStatus.convoiRiders ?? 0) > 0 && (
              <View style={styles.motionStatRow}>
                <Ionicons name="people" size={12} color="#FF6B35" />
                <Text style={[styles.motionStatText, { color: "#FF6B35" }]}>
                  {motionStatus.convoiRiders} in comitiva
                </Text>
              </View>
            )}
            {motionEnabled && motionStatus.averageSpeedKph != null && motionStatus.averageSpeedKph > 0 && (
              <View style={styles.motionStatRow}>
                <Ionicons name="speedometer-outline" size={12} color={Colors.textSecondary} />
                <Text style={styles.motionStatText}>
                  Velocità media: {motionStatus.averageSpeedKph} km/h
                </Text>
              </View>
            )}
            {motionEnabled && motionStatus.speedDistribution && motionStatus.movingNow > 0 && (
              <View style={styles.speedDistRow}>
                <View style={[styles.speedChip, { backgroundColor: "#4A90D9" }]}>
                  <Text style={styles.speedChipText}>🏙 {motionStatus.speedDistribution.city}</Text>
                </View>
                <View style={[styles.speedChip, { backgroundColor: "#E53935" }]}>
                  <Text style={styles.speedChipText}>🛣 {motionStatus.speedDistribution.highway}</Text>
                </View>
                <View style={[styles.speedChip, { backgroundColor: "#43A047" }]}>
                  <Text style={styles.speedChipText}>⛰ {motionStatus.speedDistribution.mountain}</Text>
                </View>
              </View>
            )}
            <View style={styles.motionStatRow}>
              <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.motionStatText}>
                Ultimo ciclo: {formatLastCycle(motionStatus.lastCycleAt)}
              </Text>
            </View>
            <View style={styles.motionStatRow}>
              <Ionicons name="refresh-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.motionStatText}>
                Cicli totali: {motionStatus.totalCycles}
              </Text>
            </View>
            {motionStatus.totalCycles > 0 && (
              <View style={styles.motionStatRow}>
                <Ionicons
                  name="timer-outline"
                  size={12}
                  color={(motionStatus.lastCycleDurationMs ?? 0) > 20000 ? Colors.error : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.motionStatText,
                    (motionStatus.lastCycleDurationMs ?? 0) > 20000 && { color: Colors.error },
                  ]}
                >
                  Durata ciclo: {motionStatus.lastCycleDurationMs ?? 0} ms
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.controlDivider} />

        <View style={styles.controlRow}>
          <View style={styles.controlInfo}>
            <Ionicons name="map" size={24} color={Colors.accent} />
            <Text style={styles.controlLabel}>Zona Europa</Text>
          </View>
          {isTogglingBbox ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <Switch
              value={bboxEnabled}
              onValueChange={onToggleBbox}
              trackColor={{ false: "#767577", true: Colors.accent }}
              thumbColor={Platform.OS === "ios" ? "#fff" : bboxEnabled ? "#fff" : "#f4f3f4"}
            />
          )}
        </View>
        <Text style={styles.controlDesc}>
          Confina i rider nel territorio europeo. Se escono dal confine, invertono la direzione.
        </Text>
        {bboxData && (
          <View style={styles.bboxInfo}>
            <Text style={styles.bboxInfoText}>
              Lat {bboxData.latMin}°–{bboxData.latMax}°  ·  Lng {bboxData.lngMin}°–{bboxData.lngMax}°
            </Text>
          </View>
        )}
      </View>

      <View style={styles.gridContainer}>
        <TouchableOpacity style={styles.actionBtn} onPress={onCreateNew}>
          <Ionicons name="person-add" size={22} color={Colors.accent} />
          <Text style={styles.actionBtnText}>Nuovo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onWakeAll} disabled={isWakingAll}>
          {isWakingAll ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              <MaterialIcons name="bolt" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Sveglia</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onDistribute} disabled={isDistributing}>
          {isDistributing ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              <MaterialIcons name="account-balance" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Club</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onMassSeed} disabled={isMassSeedRunning}>
          {isMassSeedRunning ? (
            <View style={{ alignItems: "center" }}>
              <ActivityIndicator size="small" color={Colors.accent} />
              <Text style={{ fontSize: 9, color: Colors.accent }}>{massSeedCreated}</Text>
            </View>
          ) : (
            <>
              <MaterialIcons name="group-add" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Massive</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.gridContainer, { marginTop: 12 }]}>
        <TouchableOpacity style={styles.actionBtn} onPress={onForceMatching} disabled={isForcingMatching}>
          {isForcingMatching ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              <Ionicons name="heart" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Match</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onResetMatches} disabled={isResettingMatches}>
          {isResettingMatches ? (
            <ActivityIndicator size="small" color={Colors.accent} />
          ) : (
            <>
              <Ionicons name="heart-dislike" size={22} color={Colors.accent} />
              <Text style={styles.actionBtnText}>Reset Match</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {isMassSeedRunning && (
        <View style={styles.seedStatus}>
          <Text style={styles.seedStatusText}>
            Creazione in corso: {massSeedCreated} / {massSeedTotal}
          </Text>
        </View>
      )}

      {!!massSeedError && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{massSeedError}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.deleteAllBtn} onPress={onDeleteAll}>
        <Ionicons name="trash" size={20} color="#fff" />
        <Text style={styles.deleteAllBtnText}>Elimina tutti ({totalCount})</Text>
      </TouchableOpacity>
    </View>
  );
}

import { styles } from "./StregattaActions.styles";

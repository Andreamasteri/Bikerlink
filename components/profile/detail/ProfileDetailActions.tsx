import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface ProfileAction {
  latitude?: number | null;
  longitude?: number | null;
  coordinatesUpdatedAt?: string | null;
}

interface FriendStatus {
  status: "self" | "friends" | "pending_sent" | "pending_received" | "none";
}

interface ProfileDetailActionsProps {
  id: string;
  isSelf: boolean;
  isBlocked: boolean;
  publicRoutesCount: number;
  profile: ProfileAction;
  friendStatus: FriendStatus | null | undefined;
  onViewRoutes: () => void;
  onGeoLocate: () => void;
  onStartChat: () => void;
  onCancelMatchRequest: () => void;
  onSendMatchRequest: () => void;
  onUnblockUser: () => void;
  onBlockUser: () => void;
  isSendMatchPending: boolean;
  isCancelMatchPending: boolean;
  isUnblockPending: boolean;
  isBlockPending: boolean;
}

export const ProfileDetailActions: React.FC<ProfileDetailActionsProps> = ({
  isSelf,
  isBlocked,
  publicRoutesCount,
  profile,
  friendStatus,
  onViewRoutes,
  onGeoLocate,
  onStartChat,
  onCancelMatchRequest,
  onSendMatchRequest,
  onUnblockUser,
  onBlockUser,
  isSendMatchPending,
  isCancelMatchPending,
  isUnblockPending,
  isBlockPending,
}) => {
  if (isSelf) return null;

  let ageLabel: string | null = null;
  if (profile.latitude != null && profile.longitude != null && profile.coordinatesUpdatedAt) {
    const updatedAt = new Date(profile.coordinatesUpdatedAt).getTime();
    const diffMs = Date.now() - updatedAt;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin >= 30) {
      if (diffMin < 60) {
        ageLabel = `posizione di ${diffMin}min fa`;
      } else {
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) {
          ageLabel = `posizione di ${diffH}h fa`;
        } else {
          const diffD = Math.floor(diffH / 24);
          ageLabel = `posizione di ${diffD}g fa`;
        }
      }
    }
  }

  return (
    <View style={styles.container}>
      {publicRoutesCount > 0 && (
        <TouchableOpacity style={styles.routesButton} onPress={onViewRoutes} activeOpacity={0.8}>
          <MaterialCommunityIcons name="map-marker-path" size={20} color={Colors.accent} />
          <Text style={styles.routesButtonText}>Visualizza percorsi ({publicRoutesCount})</Text>
        </TouchableOpacity>
      )}

      {profile.latitude != null && profile.longitude != null && (
        <TouchableOpacity style={styles.geoButton} onPress={onGeoLocate} activeOpacity={0.8}>
          <Ionicons name="navigate" size={20} color="#4CAF50" />
          <View style={{ alignItems: "center" }}>
            <Text style={styles.geoButtonText}>Geolocalizza sulla mappa</Text>
            {ageLabel && <Text style={styles.geoButtonSubtext}>{ageLabel}</Text>}
          </View>
        </TouchableOpacity>
      )}

      {!isBlocked && (
        <TouchableOpacity style={styles.chatButton} onPress={onStartChat} activeOpacity={0.8}>
          <Ionicons name="chatbubbles" size={22} color={Colors.background} />
          <Text style={styles.chatButtonText}>Scrivi un messaggio</Text>
        </TouchableOpacity>
      )}

      {!isBlocked && friendStatus && friendStatus.status !== "self" && (
        <>
          {friendStatus.status === "friends" && (
            <View style={styles.matchStatusButton}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <Text style={[styles.matchStatusText, { color: Colors.success }]}>Siete Match ✓</Text>
            </View>
          )}
          {friendStatus.status === "pending_sent" && (
            <TouchableOpacity
              style={[styles.matchStatusButton, { borderColor: Colors.textSecondary }]}
              onPress={onCancelMatchRequest}
              disabled={isCancelMatchPending}
            >
              <Ionicons name="time-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.matchStatusText, { color: Colors.textSecondary }]}>Richiesta inviata</Text>
            </TouchableOpacity>
          )}
          {friendStatus.status === "pending_received" && (
            <View style={[styles.matchStatusButton, { borderColor: Colors.accent }]}>
              <Ionicons name="person-add-outline" size={20} color={Colors.accent} />
              <Text style={[styles.matchStatusText, { color: Colors.accent }]}>Richiesta ricevuta</Text>
            </View>
          )}
          {friendStatus.status === "none" && (
            <TouchableOpacity
              style={[styles.matchRequestButton, isSendMatchPending && { opacity: 0.5 }]}
              onPress={onSendMatchRequest}
              disabled={isSendMatchPending}
              activeOpacity={0.8}
            >
              {isSendMatchPending ? (
                <ActivityIndicator size="small" color={Colors.background} />
              ) : (
                <>
                  <Ionicons name="person-add" size={20} color={Colors.background} />
                  <Text style={styles.matchRequestText}>Richiedi Match</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </>
      )}

      {isBlocked ? (
        <TouchableOpacity
          style={[styles.blockButton, styles.unblockButton, isUnblockPending && styles.blockButtonDisabled]}
          onPress={onUnblockUser}
          activeOpacity={0.8}
          disabled={isUnblockPending}
        >
          {isUnblockPending ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color={Colors.textSecondary} />
              <Text style={[styles.blockButtonText, { color: Colors.textSecondary }]}>Sblocca utente</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.blockButton, isBlockPending && styles.blockButtonDisabled]}
          onPress={onBlockUser}
          activeOpacity={0.8}
          disabled={isBlockPending}
        >
          {isBlockPending ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <>
              <Ionicons name="ban" size={20} color={Colors.error} />
              <Text style={styles.blockButtonText}>Blocca utente</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { marginTop: 16 },
  routesButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 0,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  routesButtonText: { fontSize: 15, fontWeight: "600" as const, color: Colors.accent },
  chatButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginTop: 16,
  },
  chatButtonText: { fontSize: 16, fontWeight: "700" as const, color: Colors.background },
  blockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.error,
  },
  unblockButton: { borderColor: Colors.textSecondary },
  blockButtonDisabled: { opacity: 0.5 },
  blockButtonText: { fontSize: 15, fontWeight: "600" as const, color: Colors.error },
  matchRequestButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 12,
  },
  matchRequestText: { fontSize: 15, fontWeight: "600" as const, color: Colors.background },
  matchStatusButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 12,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  matchStatusText: { fontSize: 15, fontWeight: "600" as const },
  geoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  geoButtonText: { fontSize: 15, fontWeight: "600" as const, color: "#4CAF50" },
  geoButtonSubtext: { fontSize: 12, fontWeight: "400" as const, color: Colors.textSecondary, marginTop: 2 },
});

import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal } from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useT } from "@/lib/language-context";
import { TypeBadge, StatusBadge } from "./AdminMotoClubCard";

export interface ClubRequest {
  id: string;
  name: string;
  clubType: string;
  brandName: string | null;
  modelName: string | null;
  status: string;
  reviewNote: string | null;
  createdAt: string;
  requestedBy?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  inviteRadiusKm?: number | null;
  inviteUserIds?: string | null;
  parentClubId?: string | null;
}

export interface PendingLocation {
  id: string;
  name: string;
  clubType: string;
  logoUrl: string | null;
  region: string | null;
  proposedLatitude: number | null;
  proposedLongitude: number | null;
  proposedAddress: string | null;
  proposedBy: string | null;
  proposedAt: string | null;
  proposerNickname: string | null;
}

export interface AdminMotoClubApprovalProps {
  onApprove: (req: ClubRequest) => void;
  onReject: (req: ClubRequest) => void;
  onApproveLocation: (loc: PendingLocation) => void;
  onRejectLocation: (loc: PendingLocation) => void;
  isApproving: boolean;
  isApprovingLocation: boolean;
  isRejectingLocation: boolean;
  rejectModal: { id: string; name: string } | null;
  onCloseRejectModal: () => void;
  rejectNote: string;
  onRejectNoteChange: (text: string) => void;
  onConfirmReject: () => void;
  isRejecting: boolean;
  insetsBottom: number;
}

export function AdminMotoClubRequestCard({ item, onApprove, onReject, isApproving }: { 
  item: ClubRequest; 
  onApprove: (req: ClubRequest) => void;
  onReject: (req: ClubRequest) => void;
  isApproving: boolean;
}) {
  const isPending = item.status === "pending";
  return (
    <View style={styles.card}>
      <View style={styles.cardIconWrap}>
        <Ionicons name="shield-outline" size={22} color={Colors.accent} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={styles.cardName}>{item.name}</Text>
          <StatusBadge status={item.status} />
        </View>
        <View style={styles.cardRow}>
          <TypeBadge type={item.clubType} />
          {(item.brandName || item.modelName) && (
            <Text style={styles.cardSub}>
              {[item.brandName, item.modelName].filter(Boolean).join(" ")}
            </Text>
          )}
        </View>
        <Text style={styles.cardDate}>
          {new Date(item.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
        {item.reviewNote && (
          <Text style={[styles.cardSub, { color: Colors.error, marginTop: 4 }]}>
            Nota: {item.reviewNote}
          </Text>
        )}
        {isPending && (
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={[styles.actionPill, { backgroundColor: Colors.success }]}
              onPress={() => onApprove(item)}
              disabled={isApproving}
            >
              <MaterialIcons name="check" size={14} color="#fff" />
              <Text style={styles.actionPillText}>Approva</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionPill, { backgroundColor: Colors.error }]}
              onPress={() => onReject(item)}
            >
              <MaterialIcons name="close" size={14} color="#fff" />
              <Text style={styles.actionPillText}>Rifiuta</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

export function AdminMotoClubUserCreationCard({ item, onApprove, onReject, isApproving }: {
  item: ClubRequest;
  onApprove: (req: ClubRequest) => void;
  onReject: (req: ClubRequest) => void;
  isApproving: boolean;
}) {
  const Colors_warning = "#F59E0B"; // Matches typical warning color used in original
  const isPending = item.status === "pending";
  let inviteCount = 0;
  try { inviteCount = item.inviteUserIds ? JSON.parse(item.inviteUserIds).length : 0; } catch {
    // no-op: fallback to 0 if JSON is malformed
  }
  
  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: Colors_warning }]}>
      <View style={styles.cardIconWrap}>
        <Ionicons name="people-circle-outline" size={22} color={Colors_warning} />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={styles.cardName}>{item.name}</Text>
          <StatusBadge status={item.status} />
        </View>
        {item.parentClubId && (
          <Text style={styles.cardSub}>Sub-club di: {item.parentClubId.slice(0, 8)}...</Text>
        )}
        <View style={styles.cardRow}>
          {item.latitude && item.longitude && (
            <View style={styles.statChip}>
              <Ionicons name="location" size={12} color={Colors.textSecondary} />
              <Text style={styles.statChipText}>{item.latitude.toFixed(3)}, {item.longitude.toFixed(3)}</Text>
            </View>
          )}
          {item.inviteRadiusKm && (
            <View style={styles.statChip}>
              <Ionicons name="radio-button-on" size={12} color={Colors.textSecondary} />
              <Text style={styles.statChipText}>{item.inviteRadiusKm} km</Text>
            </View>
          )}
          {inviteCount > 0 && (
            <View style={styles.statChip}>
              <Ionicons name="people" size={12} color={Colors.textSecondary} />
              <Text style={styles.statChipText}>{inviteCount} utenti</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardDate}>
          {new Date(item.createdAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
        </Text>
        {item.reviewNote && (
          <Text style={[styles.cardSub, { color: Colors.error, marginTop: 4 }]}>
            Nota: {item.reviewNote}
          </Text>
        )}
        {isPending && (
          <View style={styles.requestActions}>
            <TouchableOpacity
              style={[styles.actionPill, { backgroundColor: Colors.success }]}
              onPress={() => onApprove(item)}
              disabled={isApproving}
            >
              <MaterialIcons name="check" size={14} color="#fff" />
              <Text style={styles.actionPillText}>Approva</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionPill, { backgroundColor: Colors.error }]}
              onPress={() => onReject(item)}
            >
              <MaterialIcons name="close" size={14} color="#fff" />
              <Text style={styles.actionPillText}>Rifiuta</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

export function AdminMotoClubLocationCard({ item, onApprove, onReject, isApproving, isRejecting }: {
  item: PendingLocation;
  onApprove: (loc: PendingLocation) => void;
  onReject: (loc: PendingLocation) => void;
  isApproving: boolean;
  isRejecting: boolean;
}) {
  return (
    <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: "#2979FF" }]}>
      <View style={styles.cardIconWrap}>
        <Ionicons name="location-outline" size={22} color="#2979FF" />
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardRow}>
          <Text style={[styles.cardName, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
          <View style={[styles.typeBadge, { backgroundColor: "#2979FF22" }]}>
            <Text style={[styles.typeBadgeText, { color: "#2979FF" }]}>{item.clubType}</Text>
          </View>
        </View>
        {item.proposerNickname && (
          <Text style={styles.cardSub}>Da: {item.proposerNickname}</Text>
        )}
        {item.proposedAddress && (
          <Text style={styles.cardSub}>{item.proposedAddress}</Text>
        )}
        {item.proposedLatitude != null && item.proposedLongitude != null && (
          <View style={styles.statChip}>
            <Ionicons name="navigate" size={12} color={Colors.textSecondary} />
            <Text style={styles.statChipText}>
              {item.proposedLatitude.toFixed(4)}, {item.proposedLongitude.toFixed(4)}
            </Text>
          </View>
        )}
        {item.proposedAt && (
          <Text style={styles.cardDate}>
            {new Date(item.proposedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
          </Text>
        )}
        <View style={styles.requestActions}>
          <TouchableOpacity
            style={[styles.actionPill, { backgroundColor: Colors.success }]}
            onPress={() => onApprove(item)}
            disabled={isApproving}
          >
            <MaterialIcons name="check" size={14} color="#fff" />
            <Text style={styles.actionPillText}>Approva</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionPill, { backgroundColor: Colors.error }]}
            onPress={() => onReject(item)}
            disabled={isRejecting}
          >
            <MaterialIcons name="close" size={14} color="#fff" />
            <Text style={styles.actionPillText}>Rifiuta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export function AdminMotoClubRejectModal({
  rejectModal,
  onClose,
  rejectNote,
  onRejectNoteChange,
  onConfirm,
  isRejecting,
  insetsBottom,
}: {
  rejectModal: { id: string; name: string } | null;
  onClose: () => void;
  rejectNote: string;
  onRejectNoteChange: (text: string) => void;
  onConfirm: () => void;
  isRejecting: boolean;
  insetsBottom: number;
}) {
  const t = useT();
  if (!rejectModal) return null;

  return (
    <Modal visible animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { paddingBottom: insetsBottom + 20 }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>Rifiuta "{rejectModal.name}"</Text>
            <TouchableOpacity onPress={onClose}>
              <MaterialIcons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalSub}>{t("admin.optionalReasonHint")}</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="Motivazione (opzionale)"
            placeholderTextColor={Colors.textSecondary}
            value={rejectNote}
            onChangeText={onRejectNoteChange}
            multiline
            numberOfLines={3}
          />
          <TouchableOpacity
            style={[styles.rejectConfirmBtn, isRejecting && { opacity: 0.6 }]}
            onPress={onConfirm}
            disabled={isRejecting}
          >
            <Text style={styles.rejectConfirmBtnText}>
              {isRejecting ? t("admin.rejectingInProgress") : t("admin.confirmRejection")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.accent + "18",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0,
  },
  cardBody: { flex: 1, gap: 4 },
  cardRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.textSecondary },
  cardDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.textSecondary },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  typeBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  requestActions: { flexDirection: "row", gap: 8, marginTop: 6 },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  actionPillText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginTop: 4,
  },
  statChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: Colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, flex: 1, marginRight: 8 },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.textSecondary, marginBottom: 14 },
  modalInput: {
    backgroundColor: Colors.background,
    borderRadius: 12,
    padding: 14,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 80,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  rejectConfirmBtn: { backgroundColor: Colors.error, borderRadius: 12, padding: 16, alignItems: "center" },
  rejectConfirmBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
});

import React from "react";
import { View, Text, StyleSheet, Image, Switch, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";

export type InvitationCode = {
  id: string;
  code: string;
  label: string | null;
  giftMessage: string | null;
  maxUses: number;
  currentUses: number;
  isActive: boolean;
  expiresAt: string | null;
  imageUrl: string | null;
  createdAt: string;
};

interface InviteCodeCardProps {
  code: InvitationCode;
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: (code: InvitationCode) => void;
  onDelete: (id: string) => void;
}

export function InviteCodeCard({ code, onToggle, onEdit, onDelete }: InviteCodeCardProps) {
  const imageUrl = code.imageUrl 
    ? `${getApiUrl().replace(/\/$/, "")}${code.imageUrl}` 
    : null;

  return (
    <View style={[styles.codeCard, !code.isActive && styles.codeCardInactive]}>
      <View style={styles.codeCardHeader}>
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.cardThumbnail}
            resizeMode="cover"
          />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.codeText}>{code.code}</Text>
          {code.label && <Text style={styles.codeLabelText}>{code.label}</Text>}
        </View>
        <Switch
          value={code.isActive}
          onValueChange={(v) => onToggle(code.id, v)}
          trackColor={{ false: Colors.border, true: Colors.accent }}
          thumbColor={Colors.background}
        />
      </View>

      {code.giftMessage && (
        <View style={styles.giftRow}>
          <Ionicons name="gift-outline" size={14} color={Colors.accent} />
          <Text style={styles.giftText} numberOfLines={2}>{code.giftMessage}</Text>
        </View>
      )}

      <View style={styles.codeCardFooter}>
        <View style={styles.usesBar}>
          <View
            style={[
              styles.usesBarFill,
              { width: `${Math.min(100, (code.currentUses / code.maxUses) * 100)}%` },
            ]}
          />
        </View>
        <Text style={styles.usesText}>{code.currentUses}/{code.maxUses} usi</Text>
        {code.expiresAt && (
          <Text style={styles.expiresText}>
            Scade: {new Date(code.expiresAt).toLocaleDateString("it-IT")}
          </Text>
        )}
      </View>

      <View style={styles.codeActions}>
        <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(code)}>
          <Ionicons name="pencil" size={16} color={Colors.accent} />
          <Text style={styles.editBtnText}>Modifica</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(code.id)}>
          <Ionicons name="trash-outline" size={16} color={Colors.error} />
          <Text style={styles.deleteBtnText}>Elimina</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  codeCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  codeCardInactive: {
    opacity: 0.55,
  },
  codeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 6,
    marginRight: 8,
    backgroundColor: Colors.border,
  },
  codeText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.accent,
    letterSpacing: 2,
  },
  codeLabelText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  giftRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
  },
  giftText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
    lineHeight: 18,
  },
  codeCardFooter: {
    gap: 4,
  },
  usesBar: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  usesBarFill: {
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: 2,
  },
  usesText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  expiresText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  codeActions: {
    flexDirection: "row",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  editBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,152,0,0.1)",
    borderRadius: 8,
    paddingVertical: 8,
  },
  editBtnText: {
    color: Colors.accent,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  deleteBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(229,57,53,0.1)",
    borderRadius: 8,
    paddingVertical: 8,
  },
  deleteBtnText: {
    color: Colors.error,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});

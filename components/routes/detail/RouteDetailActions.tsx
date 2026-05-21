import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type Visibility = "public" | "friends" | "private";

interface RouteDetailActionsProps {
  isMine: boolean;
  visibility: Visibility;
  isPublic: boolean;
  isTogglingVisibility: boolean;
  onCycleVisibility: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

export default function RouteDetailActions({
  isMine,
  visibility,
  isPublic,
  isTogglingVisibility,
  onCycleVisibility,
  onEdit,
  onDelete,
  isDeleting,
}: RouteDetailActionsProps) {
  if (!isMine) return null;

  const vis: Visibility = visibility ?? (isPublic ? "public" : "private");
  const btnStyle = vis === "public"
    ? styles.visibilityPublicButton
    : vis === "friends"
    ? styles.visibilityFriendsButton
    : styles.visibilityPrivateButton;
    
  const iconName = (
    vis === "public" ? "earth" : vis === "friends" ? "account-group" : "lock"
  ) as React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  
  const iconColor = vis === "public" ? Colors.success : vis === "friends" ? "#7C83FD" : Colors.textSecondary;
  
  const textStyle = vis === "public"
    ? styles.visibilityPublicText
    : vis === "friends"
    ? styles.visibilityFriendsText
    : styles.visibilityPrivateText;
    
  const label = vis === "public" ? "Pubblico" : vis === "friends" ? "Amici" : "Privato";

  return (
    <View style={styles.ownerActions}>
      <TouchableOpacity
        style={[styles.visibilityButton, btnStyle]}
        onPress={onCycleVisibility}
        disabled={isTogglingVisibility}
        activeOpacity={0.7}
      >
        {isTogglingVisibility ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <>
            <MaterialCommunityIcons name={iconName} size={18} color={iconColor} />
            <Text style={[styles.visibilityButtonText, textStyle]}>{label}</Text>
          </>
        )}
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.editButton}
        onPress={onEdit}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons name="pencil" size={20} color={Colors.accent} />
        <Text style={styles.editButtonText}>Modifica</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={styles.deleteButton}
        onPress={onDelete}
        disabled={isDeleting}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="trash-can-outline"
          size={20}
          color={Colors.accentRed}
        />
        <Text style={styles.deleteButtonText}>Elimina</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  ownerActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  visibilityButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 100,
    justifyContent: "center",
  },
  visibilityPublicButton: {
    borderColor: Colors.success,
    backgroundColor: "rgba(76, 175, 80, 0.08)",
  },
  visibilityFriendsButton: {
    borderColor: "#7C83FD",
    backgroundColor: "rgba(124, 131, 253, 0.08)",
  },
  visibilityPrivateButton: {
    borderColor: Colors.border,
  },
  visibilityButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  visibilityPublicText: {
    color: Colors.success,
  },
  visibilityFriendsText: {
    color: "#7C83FD",
  },
  visibilityPrivateText: {
    color: Colors.textSecondary,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  editButtonText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accentRed,
  },
  deleteButtonText: {
    color: Colors.accentRed,
    fontSize: 14,
    fontWeight: "600",
  },
});

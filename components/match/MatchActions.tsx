import React from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Props {
  onAccept: () => void;
  onReject: () => void;
  onBlock?: () => void;
  isPending: boolean;
  t: (key: string) => string;
}

export const MatchActions = ({ onAccept, onReject, onBlock, isPending, t }: Props) => {
  return (
    <View style={styles.matchActions}>
      <TouchableOpacity
        style={[styles.actionBtn, styles.rejectBtn]}
        onPress={onReject}
        disabled={isPending}
      >
        <Ionicons name="close" size={20} color={Colors.accentRed} />
        <Text style={[styles.actionBtnText, { color: Colors.accentRed }]}>{t("match.reject")}</Text>
      </TouchableOpacity>
      
      {onBlock && (
        <TouchableOpacity
          style={[styles.actionBtn, styles.blockBtn]}
          onPress={onBlock}
          disabled={isPending}
        >
          <Ionicons name="ban" size={16} color={Colors.accentRed} />
          <Text style={[styles.actionBtnText, { color: Colors.accentRed, fontSize: 16 }]}>{t("match.blockUser")}</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={[styles.actionBtn, styles.acceptBtn]}
        onPress={onAccept}
        disabled={isPending}
      >
        {isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark" size={20} color="#fff" />
            <Text style={styles.actionBtnText}>{t("match.accept")}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  matchActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 10,
  },
  actionBtnText: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    color: "#fff",
  },
  acceptBtn: {
    backgroundColor: Colors.accent,
  },
  rejectBtn: {
    backgroundColor: Colors.accentRed + "20",
    borderWidth: 1,
    borderColor: Colors.accentRed + "40",
  },
  blockBtn: {
    backgroundColor: Colors.accentRed + "10",
    borderWidth: 1,
    borderColor: Colors.accentRed + "30",
  },
});

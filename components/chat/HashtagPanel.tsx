import React from "react";
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface HashtagPanelProps {
  hashtagInput: string;
  onHashtagInputChange: (text: string) => void;
  onClearHashtagInput: () => void;
  filteredCount: number;
  totalCount: number;
  autoHashtag: boolean;
  onAutoHashtagChange: (value: boolean) => void;
  activeHashtags: string[];
}

export function HashtagPanel({
  hashtagInput,
  onHashtagInputChange,
  onClearHashtagInput,
  filteredCount,
  totalCount,
  autoHashtag,
  onAutoHashtagChange,
  activeHashtags,
}: HashtagPanelProps) {
  return (
    <View style={styles.hashtagPanel}>
      <View style={styles.hashtagInputRow}>
        <Ionicons name="search" size={16} color={Colors.textSecondary} />
        <TextInput
          style={styles.hashtagTextInput}
          value={hashtagInput}
          onChangeText={onHashtagInputChange}
          placeholder="#veneto #liguria #lombardia..."
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        {hashtagInput.length > 0 && (
          <TouchableOpacity onPress={onClearHashtagInput} style={styles.hashtagClearBtn}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {activeHashtags.length > 0 && (
        <Text style={styles.hashtagCounter}>
          {filteredCount} di {totalCount} messaggi
        </Text>
      )}

      <View style={styles.autoHashtagRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.autoHashtagLabel}>Aggiungi automaticamente a fine frase</Text>
          {autoHashtag && activeHashtags.length > 0 && (
            <Text style={styles.autoHashtagSub}>{activeHashtags.join(" ")}</Text>
          )}
        </View>
        <Switch
          value={autoHashtag}
          onValueChange={onAutoHashtagChange}
          trackColor={{ false: Colors.border, true: Colors.accent + "88" }}
          thumbColor={autoHashtag ? Colors.accent : Colors.textSecondary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hashtagPanel: {
    padding: 12,
    backgroundColor: Colors.surface,
    borderBottomWidth: 0.5,
    borderBottomColor: Colors.border,
  },
  hashtagInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  hashtagTextInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
  },
  hashtagClearBtn: {
    padding: 4,
  },
  hashtagCounter: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontFamily: "Inter_400Regular",
    marginTop: 8,
    textAlign: "center",
  },
  autoHashtagRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: Colors.border,
  },
  autoHashtagLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  autoHashtagSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.accent,
    marginTop: 2,
  },
});

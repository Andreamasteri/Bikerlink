import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface SystemEvent {
  timestamp: string;
  message: string;
  type: string;
}

interface LogsSectionProps {
  event: SystemEvent;
  formatTimestamp: (iso: string) => string;
  eventIcon: (type: string) => { name: keyof typeof Ionicons.glyphMap; color: string };
  eventLabel: (type: string, t: (key: string) => string) => string;
  t: (key: string) => string;
}

export const LogItem: React.FC<LogsSectionProps> = ({
  event,
  formatTimestamp,
  eventIcon,
  eventLabel,
  t,
}) => {
  const icon = eventIcon(event.type);
  return (
    <View style={styles.eventRow}>
      <View style={styles.eventIconWrap}>
        <Ionicons name={icon.name} size={18} color={icon.color} />
      </View>
      <View style={styles.eventContent}>
        <Text style={styles.eventLabel}>{eventLabel(event.type, t)}</Text>
        <Text style={styles.eventMessage} numberOfLines={2}>
          {event.message}
        </Text>
        <Text style={styles.eventTime}>{formatTimestamp(event.timestamp)}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
    gap: 12,
  },
  eventIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  eventContent: {
    flex: 1,
  },
  eventLabel: {
    color: Colors.text,
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  eventMessage: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  eventTime: {
    color: Colors.textMuted ?? "#888",
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 4,
  },
});

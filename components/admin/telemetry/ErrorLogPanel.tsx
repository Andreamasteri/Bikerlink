import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

export interface ErrorLogEntry {
  ts: string;
  type: "ERROR" | "WARN" | "INFO";
  context: string;
  message: string;
  userId?: number;
  sessionId?: string;
  detail?: string;
}

interface Props {
  data: { entries: ErrorLogEntry[]; count: number } | undefined;
  onRefresh: () => void;
}

export function ErrorLogPanel({ data, onRefresh }: Props) {
  return (
    <View style={styles.container}>
      {!data && (
        <ActivityIndicator size="small" color="#ef4444" style={{ marginVertical: 12 }} />
      )}
      {data && data.entries.length === 0 && (
        <View style={styles.empty}>
          <Ionicons name="checkmark-circle-outline" size={24} color="#22c55e" />
          <Text style={styles.emptyText}>Nessun errore registrato</Text>
        </View>
      )}
      {data && data.entries.map((entry, i) => (
        <View key={i} style={styles.entry}>
          <View style={styles.entryHeader}>
            <View style={[
              styles.typePill,
              { backgroundColor: entry.type === "ERROR" ? "#ef444422" : entry.type === "WARN" ? "#f59e0b22" : "#3b82f622" }
            ]}>
              <Text style={[
                styles.typeText,
                { color: entry.type === "ERROR" ? "#ef4444" : entry.type === "WARN" ? "#f59e0b" : "#3b82f6" }
              ]}>{entry.type}</Text>
            </View>
            <Text style={styles.context}>[{entry.context}]</Text>
            {entry.userId && (
              <Text style={styles.meta}>uid={entry.userId}</Text>
            )}
            <Text style={styles.ts}>
              {new Date(entry.ts).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </Text>
          </View>
          <Text style={styles.message}>{entry.message}</Text>
        </View>
      ))}
      {data && data.entries.length > 0 && (
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh} activeOpacity={0.7}>
          <Ionicons name="refresh" size={13} color={Colors.textSecondary} />
          <Text style={styles.refreshText}>Aggiorna log</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ef444430",
    marginTop: 6,
    padding: 12,
    gap: 6,
  },
  empty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    justifyContent: "center",
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#22c55e",
  },
  entry: {
    borderRadius: 8,
    backgroundColor: Colors.background,
    padding: 8,
    gap: 3,
  },
  entryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  typePill: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    textTransform: "uppercase",
  },
  context: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.textSecondary,
  },
  meta: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
  },
  ts: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginLeft: "auto" as unknown as number,
  },
  message: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text,
    lineHeight: 17,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    justifyContent: "center",
    paddingTop: 6,
  },
  refreshText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

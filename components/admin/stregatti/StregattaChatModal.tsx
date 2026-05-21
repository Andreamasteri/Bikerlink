import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

interface Conversation {
  id: number;
  otherParticipantNickname: string;
  lastMessage: string;
  messageCount: number;
}

interface ChatMessage {
  id: number;
  senderName: string;
  content: string;
  createdAt: string;
}

interface StregattaChatModalProps {
  conversations: Conversation[];
  chatMessages: ChatMessage[];
  selectedConvId: number | null;
  setSelectedConvId: (id: number | null) => void;
  loadingChat: boolean;
  deletingChats: boolean;
  onDeleteChats: () => void;
}

export function StregattaChatModal({
  conversations,
  chatMessages,
  selectedConvId,
  setSelectedConvId,
  loadingChat,
  deletingChats,
  onDeleteChats,
}: StregattaChatModalProps) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          {selectedConvId ? (
            <TouchableOpacity onPress={() => setSelectedConvId(null)} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color={Colors.text} />
            </TouchableOpacity>
          ) : null}
          <Text style={styles.title}>
            {selectedConvId ? "Messaggi" : "Conversazioni"}
          </Text>
        </View>
        {!selectedConvId && (
          <TouchableOpacity
            onPress={onDeleteChats}
            disabled={deletingChats}
            style={styles.deleteBtn}
          >
            {deletingChats ? (
              <ActivityIndicator size="small" color={Colors.error} />
            ) : (
              <Ionicons name="trash-outline" size={24} color={Colors.error} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {loadingChat && <ActivityIndicator style={{ marginTop: 20 }} color={Colors.accent} />}

        {!loadingChat && !selectedConvId && conversations.map((conv) => (
          <TouchableOpacity
            key={conv.id}
            style={styles.convItem}
            onPress={() => setSelectedConvId(conv.id)}
          >
            <View style={styles.convInfo}>
              <Text style={styles.convName}>{conv.otherParticipantNickname}</Text>
              <Text style={styles.convPreview} numberOfLines={1}>{conv.lastMessage}</Text>
            </View>
            <View style={styles.convBadge}>
              <Text style={styles.convBadgeText}>{conv.messageCount}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {!loadingChat && !selectedConvId && conversations.length === 0 && (
          <Text style={styles.emptyText}>Nessuna conversazione</Text>
        )}

        {!loadingChat && !!selectedConvId && chatMessages.map((msg) => (
          <View key={msg.id} style={styles.msgBubble}>
            <Text style={styles.msgSender}>{msg.senderName}</Text>
            <Text style={styles.msgContent}>{msg.content}</Text>
            <Text style={styles.msgTime}>
              {new Date(msg.createdAt).toLocaleString("it-IT")}
            </Text>
          </View>
        ))}

        {!loadingChat && !!selectedConvId && chatMessages.length === 0 && (
          <Text style={styles.emptyText}>Nessun messaggio</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  deleteBtn: {
    padding: 4,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  convItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  convInfo: {
    flex: 1,
  },
  convName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  convPreview: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  convBadge: {
    backgroundColor: Colors.accent,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    marginLeft: 10,
  },
  convBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#fff",
  },
  msgBubble: {
    backgroundColor: Colors.surface,
    padding: 12,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  msgSender: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: Colors.accent,
    marginBottom: 4,
  },
  msgContent: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  msgTime: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.textSecondary,
    marginTop: 6,
    textAlign: "right",
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 40,
  },
});

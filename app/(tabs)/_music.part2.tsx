import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { styles } from "@/components/music/styles";
import { ChatConversation } from "@/components/music/types";

interface MusicPart2Props {
  sendModalVisible: boolean;
  setSendModalVisible: (v: boolean) => void;
  sendingToConv: string | null;
  conversationsQuery: { data?: ChatConversation[]; isLoading: boolean };
  currentUser: { id: string } | null;
  handleSendPlaylist: (conv: ChatConversation) => void;
}

export function MusicPart2({
  sendModalVisible,
  setSendModalVisible,
  sendingToConv,
  conversationsQuery,
  currentUser,
  handleSendPlaylist,
}: MusicPart2Props) {
  if (!sendModalVisible) return null;

  return (
    <Modal
      visible={sendModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => !sendingToConv && setSendModalVisible(false)}
    >
      <View style={styles.sendModalOverlay}>
        <View style={styles.sendModalCard}>
          <View style={styles.sendModalHeader}>
            <Ionicons name="share-social" size={22} color={Colors.accent} />
            <Text style={styles.sendModalTitle}>Invia la mia musica</Text>
            <TouchableOpacity
              onPress={() => setSendModalVisible(false)}
              disabled={!!sendingToConv}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <Text style={styles.sendModalSub}>Scegli una chat a cui inviare la tua Playlist</Text>
          {conversationsQuery.isLoading ? (
            <ActivityIndicator color={Colors.accent} style={{ marginVertical: 24 }} />
          ) : (conversationsQuery.data ?? []).length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
              <Ionicons name="chatbubbles-outline" size={36} color={Colors.textSecondary} />
              <Text style={styles.sendModalEmpty}>Nessuna chat attiva. Inizia una conversazione prima.</Text>
            </View>
          ) : (
            <FlatList
              data={conversationsQuery.data ?? []}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 340 }}
              renderItem={({ item: conv }) => {
                const otherUser = conv.participants.find((p) => p.id !== currentUser?.id);
                if (!otherUser) return null;
                const isSending = sendingToConv === conv.id;
                return (
                  <TouchableOpacity
                    style={styles.sendConvRow}
                    onPress={() => handleSendPlaylist(conv)}
                    disabled={!!sendingToConv}
                    activeOpacity={0.7}
                  >
                    {otherUser.avatarUrl ? (
                      <Image source={{ uri: otherUser.avatarUrl }} style={styles.sendConvAvatar} />
                    ) : (
                      <View style={[styles.sendConvAvatar, styles.sendConvAvatarPlaceholder]}>
                        <Ionicons name="person" size={16} color={Colors.textSecondary} />
                      </View>
                    )}
                    <Text style={styles.sendConvName} numberOfLines={1}>{otherUser.nickname}</Text>
                    {isSending ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

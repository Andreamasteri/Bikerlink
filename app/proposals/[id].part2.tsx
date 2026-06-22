/* eslint-disable @typescript-eslint/no-explicit-any */
import React from "react";
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { styles } from "./[id].styles";

export function ProposalActions({
  isCreator,
  isParticipant,
  canJoin,
  joinMutation,
  id,
  title,
  participantUserIds,
  router,
  t,
}: {
  isCreator: boolean;
  isParticipant: boolean;
  canJoin: boolean;
  joinMutation: any;
  id: string;
  title: string;
  participantUserIds: string[];
  router: any;
  t: (k: string) => string;
}) {
  return (
    <>
      {canJoin && (
        <TouchableOpacity
          style={[styles.joinButton, joinMutation.isPending && styles.joinButtonDisabled]}
          onPress={() => joinMutation.mutate()}
          disabled={joinMutation.isPending}
          activeOpacity={0.8}
        >
          {joinMutation.isPending ? (
            <ActivityIndicator color="#000" />
          ) : (
            <>
              <Ionicons name="add-circle" size={22} color="#000" />
              <Text style={styles.joinText}>{t("proposals.join")}</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      {isParticipant && !isCreator && (
        <View style={styles.joinedBanner}>
          <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
          <Text style={styles.joinedText}>{t("proposals.detail.joined")}</Text>
        </View>
      )}

      {isCreator && (
        <View style={styles.joinedBanner}>
          <MaterialCommunityIcons name="crown" size={20} color={Colors.accent} />
          <Text style={styles.joinedText}>{t("proposals.detail.creator")}</Text>
        </View>
      )}

      {isCreator && (
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={async () => {
            const doDelete = async () => {
              try {
                await apiRequest("DELETE", `/api/proposals/${id}`);
                queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
                router.back();
              } catch (e: unknown) {
                Alert.alert(t("common.error"), (e as Error).message || t("proposals.detail.cannotDelete"));
              }
            };
            Alert.alert(t("proposals.detail.deleteProposal"), t("proposals.detail.deleteConfirm"), [
              { text: t("common.cancel"), style: "cancel" },
              { text: t("common.delete"), style: "destructive", onPress: doDelete },
            ]);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="trash" size={20} color="#fff" />
          <Text style={styles.deleteButtonText}>{t("proposals.detail.deleteProposal")}</Text>
        </TouchableOpacity>
      )}

      {(isParticipant || isCreator) && (
        <TouchableOpacity
          style={styles.groupChatButton}
          onPress={async () => {
            try {
              const res = await apiRequest("POST", "/api/chat/conversations", {
                conversationType: "group",
                title: title,
                proposalId: id,
                participantIds: participantUserIds,
              });
              const conv = await res.json();
              router.push(`/chat/${conv.id}` as never);
            } catch (e: unknown) {
              Alert.alert(t("common.error"), (e as Error).message || t("proposals.detail.cannotOpenChat"));
            }
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubbles" size={22} color={Colors.background} />
          <Text style={styles.groupChatText}>{t("proposals.detail.groupChat")}</Text>
        </TouchableOpacity>
      )}
    </>
  );
}

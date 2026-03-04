import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { t } from "@/lib/i18n";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";

interface Participant {
  id: string;
  proposalId: string;
  userId: string;
  joinedAt: string;
  nickname: string;
  userType: string;
  avatarUrl: string | null;
}

interface ProposalDetail {
  id: string;
  userId: string;
  proposalType: string;
  title: string;
  description: string | null;
  departureAddress: string | null;
  departureLatitude: number | null;
  departureLongitude: number | null;
  scheduledAt: string | null;
  maxParticipants: number | null;
  status: string;
  createdAt: string;
  creatorNickname: string;
  creatorUserType: string;
  creatorAvatarUrl: string | null;
  participants: Participant[];
}

function getTypeIcon(type: string): { name: string; color: string } {
  switch (type) {
    case "giro":
      return { name: "motorbike", color: Colors.maleIcon };
    case "raduno":
      return { name: "account-group", color: Colors.accent };
    case "con_zavorrina":
      return { name: "seat-passenger", color: Colors.femaleIcon };
    case "richiesta":
      return { name: "hand-wave", color: Colors.femaleIcon };
    default:
      return { name: "clipboard-text", color: Colors.textSecondary };
  }
}

function getTypeLabel(type: string): string {
  switch (type) {
    case "giro": return t("proposals.ride");
    case "raduno": return t("proposals.rally");
    case "con_zavorrina": return t("proposals.withPassenger");
    case "richiesta": return t("proposals.request");
    default: return type;
  }
}

function getUserColor(userType: string): string {
  switch (userType) {
    case "biker": return Colors.maleIcon;
    case "zavorrina": return Colors.femaleIcon;
    case "coppia": return Colors.accent;
    default: return Colors.textSecondary;
  }
}

export default function ProposalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const { data: proposal, isLoading } = useQuery<ProposalDetail>({
    queryKey: ["/api/proposals", id],
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/proposals/${id}/join`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/proposals", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/proposals"] });
    },
    onError: (error: Error) => {
      Alert.alert(t("common.error"), error.message);
    },
  });

  const isParticipant = proposal?.participants.some(
    (p) => p.userId === user?.id
  );
  const isCreator = proposal?.userId === user?.id;
  const canJoin =
    proposal?.status === "active" && !isParticipant && !isCreator;

  const scheduledDate = proposal?.scheduledAt
    ? new Date(proposal.scheduledAt).toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const createdDate = proposal?.createdAt
    ? new Date(proposal.createdAt).toLocaleDateString("it-IT", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  if (isLoading) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "",
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.text,
          }}
        />
        <View style={[styles.centered, { paddingTop: webTopInset }]}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </>
    );
  }

  if (!proposal) {
    return (
      <>
        <Stack.Screen
          options={{
            headerShown: true,
            title: "",
            headerStyle: { backgroundColor: Colors.surface },
            headerTintColor: Colors.text,
          }}
        />
        <View style={[styles.centered, { paddingTop: webTopInset }]}>
          <Text style={styles.errorText}>Proposta non trovata</Text>
        </View>
      </>
    );
  }

  const typeInfo = getTypeIcon(proposal.proposalType);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: getTypeLabel(proposal.proposalType),
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
        }}
      />
      <ScrollView
        style={[styles.container, { paddingTop: webTopInset }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Platform.OS === "web" ? 34 : 40 },
        ]}
      >
        <View style={[styles.typeBanner, { backgroundColor: typeInfo.color + "15" }]}>
          <MaterialCommunityIcons
            name={typeInfo.name as any}
            size={28}
            color={typeInfo.color}
          />
          <Text style={[styles.typeBannerLabel, { color: typeInfo.color }]}>
            {getTypeLabel(proposal.proposalType)}
          </Text>
          {proposal.status !== "active" && (
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{proposal.status}</Text>
            </View>
          )}
        </View>

        <Text style={styles.title}>{proposal.title}</Text>

        <View style={styles.creatorRow}>
          <View
            style={[
              styles.creatorAvatar,
              { backgroundColor: getUserColor(proposal.creatorUserType) + "33" },
            ]}
          >
            <Ionicons
              name="person"
              size={16}
              color={getUserColor(proposal.creatorUserType)}
            />
          </View>
          <View>
            <Text style={[styles.creatorName, { color: getUserColor(proposal.creatorUserType) }]}>
              {proposal.creatorNickname}
            </Text>
            <Text style={styles.createdDate}>{createdDate}</Text>
          </View>
        </View>

        {proposal.description && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Descrizione</Text>
            <Text style={styles.descriptionText}>{proposal.description}</Text>
          </View>
        )}

        {(scheduledDate || proposal.departureAddress) && (
          <View style={styles.infoCard}>
            {scheduledDate && (
              <View style={styles.infoRow}>
                <Ionicons name="calendar" size={18} color={Colors.accent} />
                <Text style={styles.infoText}>{scheduledDate}</Text>
              </View>
            )}
            {proposal.departureAddress && (
              <View style={styles.infoRow}>
                <Ionicons name="location" size={18} color={Colors.accent} />
                <Text style={styles.infoText}>{proposal.departureAddress}</Text>
              </View>
            )}
            {proposal.maxParticipants && (
              <View style={styles.infoRow}>
                <Ionicons name="people" size={18} color={Colors.accent} />
                <Text style={styles.infoText}>
                  Max {proposal.maxParticipants} partecipanti
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            Partecipanti ({proposal.participants.length}
            {proposal.maxParticipants ? `/${proposal.maxParticipants}` : ""})
          </Text>
          {proposal.participants.map((p) => (
            <View key={p.id} style={styles.participantRow}>
              <View
                style={[
                  styles.participantAvatar,
                  { backgroundColor: getUserColor(p.userType) + "33" },
                ]}
              >
                <Ionicons
                  name="person"
                  size={14}
                  color={getUserColor(p.userType)}
                />
              </View>
              <Text style={styles.participantName}>{p.nickname}</Text>
              {p.userId === proposal.userId && (
                <View style={styles.creatorBadge}>
                  <MaterialCommunityIcons name="crown" size={12} color={Colors.accent} />
                </View>
              )}
            </View>
          ))}
        </View>

        {canJoin && (
          <TouchableOpacity
            style={[
              styles.joinButton,
              joinMutation.isPending && styles.joinButtonDisabled,
            ]}
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
            <Text style={styles.joinedText}>Sei iscritto a questa proposta</Text>
          </View>
        )}

        {isCreator && (
          <View style={styles.joinedBanner}>
            <MaterialCommunityIcons name="crown" size={20} color={Colors.accent} />
            <Text style={styles.joinedText}>Sei il creatore di questa proposta</Text>
          </View>
        )}

        {(isParticipant || isCreator) && (
          <TouchableOpacity
            style={styles.groupChatButton}
            onPress={async () => {
              try {
                const participantUserIds = proposal.participants.map((p) => p.userId);
                const res = await apiRequest("POST", "/api/chat/conversations", {
                  conversationType: "group",
                  title: proposal.title,
                  proposalId: proposal.id,
                  participantIds: participantUserIds,
                });
                const conv = await res.json();
                router.push(`/chat/${conv.id}` as any);
              } catch (e: any) {
                Alert.alert("Errore", e.message || "Impossibile aprire la chat");
              }
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubbles" size={22} color={Colors.background} />
            <Text style={styles.groupChatText}>Chat del Gruppo</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
  typeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  typeBannerLabel: {
    fontSize: 16,
    fontWeight: "700" as const,
    flex: 1,
  },
  statusBadge: {
    backgroundColor: Colors.warning + "33",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusText: {
    color: Colors.warning,
    fontSize: 12,
    fontWeight: "600" as const,
  },
  title: {
    color: Colors.text,
    fontSize: 24,
    fontWeight: "800" as const,
    marginBottom: 16,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  creatorAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  creatorName: {
    fontSize: 15,
    fontWeight: "600" as const,
  },
  createdDate: {
    color: Colors.textSecondary,
    fontSize: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  descriptionText: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoText: {
    color: Colors.text,
    fontSize: 14,
    flex: 1,
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  participantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  participantName: {
    color: Colors.text,
    fontSize: 15,
    flex: 1,
  },
  creatorBadge: {
    padding: 4,
  },
  joinButton: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  joinButtonDisabled: {
    opacity: 0.5,
  },
  joinText: {
    color: "#000",
    fontSize: 16,
    fontWeight: "700" as const,
  },
  joinedBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  joinedText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  groupChatButton: {
    backgroundColor: Colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    gap: 8,
    marginTop: 12,
  },
  groupChatText: {
    color: Colors.background,
    fontSize: 16,
    fontWeight: "700" as const,
  },
});

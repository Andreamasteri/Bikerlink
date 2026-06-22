import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,

  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth-context";
import { useT, useLocale } from "@/lib/language-context";
import { ProposalActions } from "./[id].part2";
import { styles } from "./[id].styles";

export interface Participant {
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
    case "find_a_friend":
      return { name: "account-group", color: Colors.maleIcon };
    case "raduno":
      return { name: "account-group", color: Colors.accent };
    case "con_zavorrina":
    case "find_a_guest":
      return { name: "seat-passenger", color: Colors.femaleIcon };
    case "passaggio_al_volo":
    case "hitcher":
      return { name: "car-side", color: Colors.success };
    case "richiesta":
    case "hitchhiker":
      return { name: "hand-wave", color: Colors.success };
    case "find_a_biker":
      return { name: "motorbike", color: Colors.maleIcon };
    default:
      return { name: "bullhorn", color: Colors.textSecondary };
  }
}

function getTypeLabelKey(type: string): string {
  switch (type) {
    case "giro": return "proposals.ride";
    case "raduno": return "proposals.rally";
    case "con_zavorrina": return "proposals.withPassenger";
    case "passaggio_al_volo": return "proposals.detail.quickride";
    case "richiesta": return "proposals.request";
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
  const { user } = useAuth();
  const t = useT();
  const locale = useLocale();

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
      Alert.alert(t("common.error"), (error as Error).message);
    },
  });

  const isParticipant = proposal?.participants.some(
    (p) => p.userId === user?.id
  );
  const isCreator = proposal?.userId === user?.id;
  const canJoin =
    proposal?.status === "active" && !isParticipant && !isCreator;

  const scheduledDate = proposal?.scheduledAt
    ? new Date(proposal.scheduledAt).toLocaleDateString(locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const createdDate = proposal?.createdAt
    ? new Date(proposal.createdAt).toLocaleDateString(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const webTopInset = 0;

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
          <Text style={styles.errorText}>{t("proposals.detail.notFound")}</Text>
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
          title: t(getTypeLabelKey(proposal.proposalType)),
          headerStyle: { backgroundColor: Colors.surface },
          headerTintColor: Colors.text,
        }}
      />
      <ScrollView
        style={[styles.container, { paddingTop: webTopInset }]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: 40 },
        ]}
      >
        <View style={[styles.typeBanner, { backgroundColor: typeInfo.color + "15" }]}>
          <MaterialCommunityIcons
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- icon name from typeInfo
            name={typeInfo.name as any}
            size={28}
            color={typeInfo.color}
          />
          <Text style={[styles.typeBannerLabel, { color: typeInfo.color }]}>
            {t(getTypeLabelKey(proposal.proposalType))}
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
            <Text style={styles.sectionLabel}>{t("proposals.detail.description")}</Text>
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
                  Max {proposal.maxParticipants} {t("proposals.detail.participants").toLowerCase()}
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {t("proposals.detail.participants")} ({proposal.participants.length}
            {proposal.maxParticipants ? `/${proposal.maxParticipants}` : ""})
          </Text>
          {proposal.participants.map((p) => (
            <TouchableOpacity key={p.id} style={styles.participantRow} onPress={() => router.push(`/profile/${p.userId}`)} activeOpacity={0.7}>
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
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} style={{ marginLeft: "auto" }} />
            </TouchableOpacity>
          ))}
        </View>

        <ProposalActions
          isCreator={isCreator}
          isParticipant={isParticipant ?? false}
          canJoin={canJoin}
          joinMutation={joinMutation}
          id={id}
          title={proposal.title}
          participantUserIds={proposal.participants.map(p => p.userId)}
          router={router}
          t={t}
        />
      </ScrollView>
    </>
  );
}

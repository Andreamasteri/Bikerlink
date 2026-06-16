import React, { useCallback } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { GarageMatchCard, BikerBikerMatchCard, MatchCardFull, ProposalProfileMatchCard } from "@/components/match/MatchCard";
import { RouteAffinityMatchCard } from "@/components/match/RouteAffinityMatchCard";
import { TelemetryAffinityMatchCard } from "@/components/match/TelemetryAffinityMatchCard";
import { BlacklistCard } from "@/components/match/tabs/BlacklistCard";
import { MusicMatchCard } from "@/components/match/tabs/MusicMatchCard";
import type { TabKey } from "@/components/match/TabBar";

interface MutateFn {
  mutate: (id: string) => void;
}

interface UseRenderItemParams {
  activeTab: TabKey;
  userId: string | undefined;
  pendingMatchId: string | null;
  setPendingMatchId: (id: string | null) => void;
  propProfilePendingId: string | null;
  setPropProfilePendingId: (id: string | null) => void;
  freshIds: Set<string>;
  acceptMutation: MutateFn;
  rejectMutation: MutateFn;
  acceptMusicMutation: MutateFn;
  rejectMusicMutation: MutateFn;
  acceptGarageMutation: MutateFn;
  rejectGarageMutation: MutateFn;
  acceptBikerMutation: MutateFn;
  rejectBikerMutation: MutateFn;
  blockFromMatchMutation: MutateFn;
  acceptPropProfileMutation: MutateFn;
  rejectPropProfileMutation: MutateFn;
  acceptRouteAffinityMutation: MutateFn;
  rejectRouteAffinityMutation: MutateFn;
  removeRouteAffinityMutation: MutateFn;
  acceptTelemetryAffinityMutation: MutateFn;
  rejectTelemetryAffinityMutation: MutateFn;
  removeTelemetryAffinityMutation: MutateFn;
  startChatMutation: MutateFn;
  confirmRemoveGarageMatch: (id: string) => void;
  confirmRemoveBikerMatch: (id: string) => void;
  confirmRemoveProposalMatch: (id: string) => void;
  handleUnblock: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- translation function
  t: (key: string, ...args: any[]) => string;
  locale: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- item shape varies by tab
export function useRenderItem(p: UseRenderItemParams): ({ item }: { item: any }) => React.ReactElement {
  const router = useRouter();

  return useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- item shape varies by tab
    ({ item }: { item: any }): React.ReactElement => {
      if (p.activeTab === "blacklist") {
        return <BlacklistCard item={item} onUnblock={p.handleUnblock} />;
      }

      if (p.activeTab === "music") {
        return (
          <MusicMatchCard
            item={item}
            onAccept={(userId) => p.acceptMusicMutation.mutate(userId)}
            onReject={(userId) => p.rejectMusicMutation.mutate(userId)}
          />
        );
      }

      if (p.activeTab === "propProfile") {
        const isBiker = item.bikerId === p.userId;
        const otherUserId = isBiker ? item.zavorrinaId : item.bikerId;
        return (
          <ProposalProfileMatchCard
            match={{ ...item, isFresh: p.freshIds.has(item.id) }}
            currentUserId={p.userId || ""}
            onAccept={() => {
              p.setPropProfilePendingId(item.id);
              p.acceptPropProfileMutation.mutate(item.id);
            }}
            onReject={() => p.rejectPropProfileMutation.mutate(item.id)}
            onChatPress={item.status === "accepted" ? () => p.startChatMutation.mutate(otherUserId) : undefined}
            isPending={p.propProfilePendingId === item.id}
            t={p.t}
            locale={p.locale}
          />
        );
      }

      if (p.activeTab === "telemetry") {
        const otherId: string = item.otherUserId ?? (item.userAId === p.userId ? item.userBId : item.userAId);
        return (
          <TelemetryAffinityMatchCard
            match={item}
            currentUserId={p.userId || ""}
            onAccept={() => {
              p.setPendingMatchId(item.id);
              p.acceptTelemetryAffinityMutation.mutate(item.id);
            }}
            onReject={() => p.rejectTelemetryAffinityMutation.mutate(item.id)}
            onChatPress={item.status === "accepted" ? () => p.startChatMutation.mutate(otherId) : undefined}
            onRemove={item.status === "accepted" ? () => p.removeTelemetryAffinityMutation.mutate(item.id) : undefined}
            isPending={p.pendingMatchId === item.id}
            t={p.t}
            locale={p.locale}
          />
        );
      }

      if (p.activeTab === "accepted") {
        if (item._matchType === "biker") {
          const isBiker1 = item.biker1Id === p.userId;
          const otherUserId = isBiker1 ? item.biker2Id : item.biker1Id;
          return (
            <BikerBikerMatchCard
              match={{ ...item, isFresh: p.freshIds.has(item.id) }}
              currentUserId={p.userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onBlock={() => {}}
              onChatPress={() => p.startChatMutation.mutate(otherUserId)}
              onRemove={() => p.confirmRemoveBikerMatch(item.id)}
              isPending={false}
              t={p.t}
              locale={p.locale}
            />
          );
        }
        if (item._matchType === "garage") {
          const isBiker = item.bikerId === p.userId;
          const otherUserId = isBiker ? item.zavorrinaId : item.bikerId;
          return (
            <GarageMatchCard
              match={{ ...item, isFresh: p.freshIds.has(item.id) }}
              currentUserId={p.userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onChatPress={() => p.startChatMutation.mutate(otherUserId)}
              onRemove={() => p.confirmRemoveGarageMatch(item.id)}
              isPending={false}
              t={p.t}
              locale={p.locale}
            />
          );
        }
        if (item._matchType === "propProfile") {
          const otherUserId = item.bikerId === p.userId ? item.zavorrinaId : item.bikerId;
          return (
            <ProposalProfileMatchCard
              match={{ ...item, isFresh: p.freshIds.has(item.id) }}
              currentUserId={p.userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onChatPress={() => p.startChatMutation.mutate(otherUserId)}
              isPending={false}
              t={p.t}
              locale={p.locale}
            />
          );
        }
        if (item._matchType === "routeAffinity") {
          const otherId: string = item.otherUserId ?? (item.userAId === p.userId ? item.userBId : item.userAId);
          return (
            <RouteAffinityMatchCard
              match={item}
              currentUserId={p.userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onChatPress={() => p.startChatMutation.mutate(otherId)}
              onRemove={() => p.removeRouteAffinityMutation.mutate(item.id)}
              isPending={false}
              t={p.t}
              locale={p.locale}
            />
          );
        }
        if (item._matchType === "telemetryAffinity") {
          const otherId: string = item.otherUserId ?? (item.userAId === p.userId ? item.userBId : item.userAId);
          return (
            <TelemetryAffinityMatchCard
              match={item}
              currentUserId={p.userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onChatPress={() => p.startChatMutation.mutate(otherId)}
              onRemove={() => p.removeTelemetryAffinityMutation.mutate(item.id)}
              isPending={false}
              t={p.t}
              locale={p.locale}
            />
          );
        }
        return (
          <MatchCardFull
            match={{ ...item, isFresh: p.freshIds.has(item.id) }}
            currentUserId={p.userId || ""}
            onAccept={() => {}}
            onReject={() => {}}
            onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as never) : undefined}
            onRemove={() => p.confirmRemoveProposalMatch(item.id)}
            isPending={false}
            t={p.t}
            locale={p.locale}
          />
        );
      }

      if (p.activeTab === "route") {
        const otherId: string = item.otherUserId ?? (item.userAId === p.userId ? item.userBId : item.userAId);
        return (
          <RouteAffinityMatchCard
            match={item}
            currentUserId={p.userId || ""}
            onAccept={() => {
              p.setPendingMatchId(item.id);
              p.acceptRouteAffinityMutation.mutate(item.id);
            }}
            onReject={() => p.rejectRouteAffinityMutation.mutate(item.id)}
            onChatPress={item.status === "accepted" ? () => p.startChatMutation.mutate(otherId) : undefined}
            onRemove={item.status === "accepted" ? () => p.removeRouteAffinityMutation.mutate(item.id) : undefined}
            isPending={p.pendingMatchId === item.id}
            t={p.t}
            locale={p.locale}
          />
        );
      }

      if (p.activeTab === "biker") {
        const isBiker1 = item.biker1Id === p.userId;
        const otherUserId = isBiker1 ? item.biker2Id : item.biker1Id;
        return (
          <BikerBikerMatchCard
            match={{ ...item, isFresh: p.freshIds.has(item.id) }}
            currentUserId={p.userId || ""}
            onAccept={() => {
              p.setPendingMatchId(item.id);
              p.acceptBikerMutation.mutate(item.id);
            }}
            onReject={() => p.rejectBikerMutation.mutate(item.id)}
            onBlock={() => {
              const nickname = (item.biker1Id === p.userId ? item.biker2Nickname : item.biker1Nickname) || p.t("match.thisUser");
              const msg = p.t("match.blockUserConfirmMsg").replace("{nickname}", nickname);
              Alert.alert(p.t("match.blockUserConfirmTitle"), msg, [
                { text: p.t("common.cancel"), style: "cancel" },
                { text: p.t("match.blockUser"), style: "destructive", onPress: () => p.blockFromMatchMutation.mutate(otherUserId) },
              ]);
            }}
            onChatPress={item.status === "accepted" ? () => p.startChatMutation.mutate(otherUserId) : undefined}
            onRemove={item.status === "accepted" ? () => p.confirmRemoveBikerMatch(item.id) : undefined}
            isPending={p.pendingMatchId === item.id}
            t={p.t}
            locale={p.locale}
          />
        );
      }

      if (p.activeTab === "zavorrine") {
        const isBiker = item.bikerId === p.userId;
        const otherUserId = isBiker ? item.zavorrinaId : item.bikerId;
        return (
          <GarageMatchCard
            match={{ ...item, isFresh: p.freshIds.has(item.id) }}
            currentUserId={p.userId || ""}
            onAccept={() => {
              p.setPendingMatchId(item.id);
              p.acceptGarageMutation.mutate(item.id);
            }}
            onReject={() => p.rejectGarageMutation.mutate(item.id)}
            onChatPress={item.status === "accepted" ? () => p.startChatMutation.mutate(otherUserId) : undefined}
            onRemove={item.status === "accepted" ? () => p.confirmRemoveGarageMatch(item.id) : undefined}
            isPending={p.pendingMatchId === item.id}
            t={p.t}
            locale={p.locale}
          />
        );
      }

      return (
        <MatchCardFull
          match={{ ...item, isFresh: p.freshIds.has(item.id) }}
          currentUserId={p.userId || ""}
          onAccept={() => {
            p.setPendingMatchId(item.id);
            p.acceptMutation.mutate(item.id);
          }}
          onReject={() => p.rejectMutation.mutate(item.id)}
          onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as never) : undefined}
          onRemove={item.status === "accepted" ? () => p.confirmRemoveProposalMatch(item.id) : undefined}
          isPending={p.pendingMatchId === item.id}
          t={p.t}
          locale={p.locale}
        />
      );
    },
    [
      p, router,
    ],
  );
}

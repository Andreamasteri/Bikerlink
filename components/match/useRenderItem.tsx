import React, { useCallback, useRef } from "react";
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

  // Le mutation/handler/setter sono ref-stabili (mutate/dispatch invariati tra
  // i render): tenerli in un ref evita di rigenerare renderItem ad ogni tick di
  // refetch. renderItem si ricrea SOLO quando cambiano le slice che incidono sul
  // contenuto renderizzato (sotto, nei deps).
  const mRef = useRef(p);
  mRef.current = p;

  const { activeTab, userId, pendingMatchId, propProfilePendingId, freshIds, t, locale } = p;

  return useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- item shape varies by tab
    ({ item }: { item: any }): React.ReactElement => {
      const m = mRef.current;

      if (activeTab === "blacklist") {
        return <BlacklistCard item={item} onUnblock={m.handleUnblock} />;
      }

      if (activeTab === "music") {
        return (
          <MusicMatchCard
            item={item}
            onAccept={(uid) => m.acceptMusicMutation.mutate(uid)}
            onReject={(uid) => m.rejectMusicMutation.mutate(uid)}
          />
        );
      }

      if (activeTab === "propProfile") {
        const isBiker = item.bikerId === userId;
        const otherUserId = isBiker ? item.zavorrinaId : item.bikerId;
        return (
          <ProposalProfileMatchCard
            match={{ ...item, isFresh: freshIds.has(item.id) }}
            currentUserId={userId || ""}
            onAccept={() => {
              m.setPropProfilePendingId(item.id);
              m.acceptPropProfileMutation.mutate(item.id);
            }}
            onReject={() => m.rejectPropProfileMutation.mutate(item.id)}
            onChatPress={item.status === "accepted" ? () => m.startChatMutation.mutate(otherUserId) : undefined}
            isPending={propProfilePendingId === item.id}
            t={t}
            locale={locale}
          />
        );
      }

      if (activeTab === "telemetry") {
        const otherId: string = item.otherUserId ?? (item.userAId === userId ? item.userBId : item.userAId);
        return (
          <TelemetryAffinityMatchCard
            match={item}
            currentUserId={userId || ""}
            onAccept={() => {
              m.setPendingMatchId(item.id);
              m.acceptTelemetryAffinityMutation.mutate(item.id);
            }}
            onReject={() => m.rejectTelemetryAffinityMutation.mutate(item.id)}
            onChatPress={item.status === "accepted" ? () => m.startChatMutation.mutate(otherId) : undefined}
            onRemove={item.status === "accepted" ? () => m.removeTelemetryAffinityMutation.mutate(item.id) : undefined}
            isPending={pendingMatchId === item.id}
            t={t}
            locale={locale}
          />
        );
      }

      if (activeTab === "accepted") {
        if (item._matchType === "biker") {
          const isBiker1 = item.biker1Id === userId;
          const otherUserId = isBiker1 ? item.biker2Id : item.biker1Id;
          return (
            <BikerBikerMatchCard
              match={{ ...item, isFresh: freshIds.has(item.id) }}
              currentUserId={userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onBlock={() => {}}
              onChatPress={() => m.startChatMutation.mutate(otherUserId)}
              onRemove={() => m.confirmRemoveBikerMatch(item.id)}
              isPending={false}
              t={t}
              locale={locale}
            />
          );
        }
        if (item._matchType === "garage") {
          const isBiker = item.bikerId === userId;
          const otherUserId = isBiker ? item.zavorrinaId : item.bikerId;
          return (
            <GarageMatchCard
              match={{ ...item, isFresh: freshIds.has(item.id) }}
              currentUserId={userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onChatPress={() => m.startChatMutation.mutate(otherUserId)}
              onRemove={() => m.confirmRemoveGarageMatch(item.id)}
              isPending={false}
              t={t}
              locale={locale}
            />
          );
        }
        if (item._matchType === "propProfile") {
          const otherUserId = item.bikerId === userId ? item.zavorrinaId : item.bikerId;
          return (
            <ProposalProfileMatchCard
              match={{ ...item, isFresh: freshIds.has(item.id) }}
              currentUserId={userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onChatPress={() => m.startChatMutation.mutate(otherUserId)}
              isPending={false}
              t={t}
              locale={locale}
            />
          );
        }
        if (item._matchType === "routeAffinity") {
          const otherId: string = item.otherUserId ?? (item.userAId === userId ? item.userBId : item.userAId);
          return (
            <RouteAffinityMatchCard
              match={item}
              currentUserId={userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onChatPress={() => m.startChatMutation.mutate(otherId)}
              onRemove={() => m.removeRouteAffinityMutation.mutate(item.id)}
              isPending={false}
              t={t}
              locale={locale}
            />
          );
        }
        if (item._matchType === "telemetryAffinity") {
          const otherId: string = item.otherUserId ?? (item.userAId === userId ? item.userBId : item.userAId);
          return (
            <TelemetryAffinityMatchCard
              match={item}
              currentUserId={userId || ""}
              onAccept={() => {}}
              onReject={() => {}}
              onChatPress={() => m.startChatMutation.mutate(otherId)}
              onRemove={() => m.removeTelemetryAffinityMutation.mutate(item.id)}
              isPending={false}
              t={t}
              locale={locale}
            />
          );
        }
        return (
          <MatchCardFull
            match={{ ...item, isFresh: freshIds.has(item.id) }}
            currentUserId={userId || ""}
            onAccept={() => {}}
            onReject={() => {}}
            onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as never) : undefined}
            onRemove={() => m.confirmRemoveProposalMatch(item.id)}
            isPending={false}
            t={t}
            locale={locale}
          />
        );
      }

      if (activeTab === "route") {
        const otherId: string = item.otherUserId ?? (item.userAId === userId ? item.userBId : item.userAId);
        return (
          <RouteAffinityMatchCard
            match={item}
            currentUserId={userId || ""}
            onAccept={() => {
              m.setPendingMatchId(item.id);
              m.acceptRouteAffinityMutation.mutate(item.id);
            }}
            onReject={() => m.rejectRouteAffinityMutation.mutate(item.id)}
            onChatPress={item.status === "accepted" ? () => m.startChatMutation.mutate(otherId) : undefined}
            onRemove={item.status === "accepted" ? () => m.removeRouteAffinityMutation.mutate(item.id) : undefined}
            isPending={pendingMatchId === item.id}
            t={t}
            locale={locale}
          />
        );
      }

      if (activeTab === "biker") {
        const isBiker1 = item.biker1Id === userId;
        const otherUserId = isBiker1 ? item.biker2Id : item.biker1Id;
        return (
          <BikerBikerMatchCard
            match={{ ...item, isFresh: freshIds.has(item.id) }}
            currentUserId={userId || ""}
            onAccept={() => {
              m.setPendingMatchId(item.id);
              m.acceptBikerMutation.mutate(item.id);
            }}
            onReject={() => m.rejectBikerMutation.mutate(item.id)}
            onBlock={() => {
              const nickname = (item.biker1Id === userId ? item.biker2Nickname : item.biker1Nickname) || t("match.thisUser");
              const msg = t("match.blockUserConfirmMsg").replace("{nickname}", nickname);
              Alert.alert(t("match.blockUserConfirmTitle"), msg, [
                { text: t("common.cancel"), style: "cancel" },
                { text: t("match.blockUser"), style: "destructive", onPress: () => m.blockFromMatchMutation.mutate(otherUserId) },
              ]);
            }}
            onChatPress={item.status === "accepted" ? () => m.startChatMutation.mutate(otherUserId) : undefined}
            onRemove={item.status === "accepted" ? () => m.confirmRemoveBikerMatch(item.id) : undefined}
            isPending={pendingMatchId === item.id}
            t={t}
            locale={locale}
          />
        );
      }

      if (activeTab === "zavorrine") {
        const isBiker = item.bikerId === userId;
        const otherUserId = isBiker ? item.zavorrinaId : item.bikerId;
        return (
          <GarageMatchCard
            match={{ ...item, isFresh: freshIds.has(item.id) }}
            currentUserId={userId || ""}
            onAccept={() => {
              m.setPendingMatchId(item.id);
              m.acceptGarageMutation.mutate(item.id);
            }}
            onReject={() => m.rejectGarageMutation.mutate(item.id)}
            onChatPress={item.status === "accepted" ? () => m.startChatMutation.mutate(otherUserId) : undefined}
            onRemove={item.status === "accepted" ? () => m.confirmRemoveGarageMatch(item.id) : undefined}
            isPending={pendingMatchId === item.id}
            t={t}
            locale={locale}
          />
        );
      }

      return (
        <MatchCardFull
          match={{ ...item, isFresh: freshIds.has(item.id) }}
          currentUserId={userId || ""}
          onAccept={() => {
            m.setPendingMatchId(item.id);
            m.acceptMutation.mutate(item.id);
          }}
          onReject={() => m.rejectMutation.mutate(item.id)}
          onChatPress={item.conversationId ? () => router.push(`/chat/${item.conversationId}` as never) : undefined}
          onRemove={item.status === "accepted" ? () => m.confirmRemoveProposalMatch(item.id) : undefined}
          isPending={pendingMatchId === item.id}
          t={t}
          locale={locale}
        />
      );
    },
    [activeTab, userId, pendingMatchId, propProfilePendingId, freshIds, t, locale, router],
  );
}

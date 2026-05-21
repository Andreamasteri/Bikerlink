import { useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

export function useTabBadges() {
  const { user } = useAuth();
  const prevUnreadRef = useRef<number>(0);

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/chat/unread-total"],
    enabled: !!user,
    refetchInterval: 6000,
  });

  const unreadCount = unreadData?.count ?? 0;

  useEffect(() => {
    // Logic for notifications can be added here if needed
    // In original code it was an empty block:
    // if (unreadCount > prevUnreadRef.current && prevUnreadRef.current >= 0) { }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  const { data: proposalMatchesData } = useQuery<{ status: string }[]>({
    queryKey: ["/api/proposals/matches"],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const hasActiveMatches = (proposalMatchesData ?? []).some(
    (m) => m.status === "pending" || m.status === "accepted"
  );

  return {
    unreadCount,
    hasActiveMatches,
  };
}

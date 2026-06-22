/* eslint-disable @typescript-eslint/no-explicit-any */
import { useInfiniteQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/query-client";

export function useStregattiData() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingList,
  } = useInfiniteQuery<any>({
    queryKey: ["/api/admin/stregatti"],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await apiRequest("GET", `/api/admin/stregatti?offset=${pageParam}`);
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: any) => lastPage.hasMore ? lastPage.nextOffset : undefined,
  });

  const users = data?.pages.flatMap((page) => page.users) ?? [];
  const totalCount = data?.pages[0]?.total ?? 0;
  const pageStats = data?.pages[0]?.stats ?? { total: 0, biker: 0, zavorrina: 0, coppia: 0 };

  return {
    users,
    totalCount,
    pageStats,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoadingList,
  };
}

export function useStregattiMutations() {
  const chatbotMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("POST", "/api/settings/chatbot-enabled", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/chatbot-enabled"] }),
  });

  const toggleAllMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/stregatti/toggle-all", body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] }),
  });

  const toggleAvailableMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/stregatti/${id}/available`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] }),
  });

  const toggleOnlineMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/stregatti/${id}/online`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/stregatti/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/stregatti/all"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] }),
  });

  return {
    chatbotMutation,
    toggleAllMutation,
    toggleAvailableMutation,
    toggleOnlineMutation,
    deleteMutation,
    deleteAllMutation,
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef } from "react";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiRequest, queryClient } from "@/lib/query-client";
import { useT } from "@/lib/language-context";

export function useStregattiState() {
  const [activeTab, setActiveTab] = useState<string>("lista");
  const [filter, setFilter] = useState<string>("all");
  const [deleteAllConfirmVisible, setDeleteAllConfirmVisible] = useState(false);
  const [deleteSingleTarget, setDeleteSingleTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [deletingChats, setDeletingChats] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const flatListRef = useRef<any>(null);
  const insets = useSafeAreaInsets();
  const t = useT();

  const [formType, setFormType] = useState("biker");
  const [formSex, setFormSex] = useState("M");
  const [formNickname, setFormNickname] = useState("");
  const [formCountry, setFormCountry] = useState("IT");
  const [formRegion, setFormRegion] = useState("");
  const [formBirthYear, setFormBirthYear] = useState("1990");
  const [formBio, setFormBio] = useState("");
  const [formMotoBrand, setFormMotoBrand] = useState("");
  const [formMotoModel, setFormMotoModel] = useState("");
  const [formMotoType, setFormMotoType] = useState("naked");
  const [formRidingStyle, setFormRidingStyle] = useState("touring");
  const [formDisplacement, setFormDisplacement] = useState("600");
  const [formMotoYear, setFormMotoYear] = useState("2020");
  const [formWishlistDesc, setFormWishlistDesc] = useState("");
  const [formDesiredBrand, setFormDesiredBrand] = useState("");
  const [formDesiredModel, setFormDesiredModel] = useState("");
  const [formDesiredMotoType, setFormDesiredMotoType] = useState("naked");

  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [showMotoBrandPicker, setShowMotoBrandPicker] = useState(false);
  const [showDesiredBrandPicker, setShowDesiredBrandPicker] = useState(false);

  const resetForm = () => {
    setFormType("biker"); setFormSex("M"); setFormNickname(""); setFormCountry("IT");
    setFormRegion(""); setFormBirthYear("1990"); setFormBio(""); setFormMotoBrand("");
    setFormMotoModel(""); setFormMotoType("naked"); setFormRidingStyle("touring");
    setFormDisplacement("600"); setFormMotoYear("2020"); setFormWishlistDesc("");
    setFormDesiredBrand(""); setFormDesiredModel(""); setFormDesiredMotoType("naked");
  };

  const form = {
    formType, setFormType, formSex, setFormSex, formNickname, setFormNickname,
    formCountry, setFormCountry, formRegion, setFormRegion, formBirthYear, setFormBirthYear,
    formBio, setFormBio, formMotoBrand, setFormMotoBrand, formMotoModel, setFormMotoModel,
    formMotoType, setFormMotoType, formRidingStyle, setFormRidingStyle,
    formDisplacement, setFormDisplacement, formMotoYear, setFormMotoYear,
    formWishlistDesc, setFormWishlistDesc, formDesiredBrand, setFormDesiredBrand,
    formDesiredModel, setFormDesiredModel, formDesiredMotoType, setFormDesiredMotoType,
    resetForm,
  };
  const pickers = {
    showCountryPicker, setShowCountryPicker, showRegionPicker, setShowRegionPicker,
    showMotoBrandPicker, setShowMotoBrandPicker, showDesiredBrandPicker, setShowDesiredBrandPicker,
  };

  return {
    activeTab, setActiveTab, filter, setFilter,
    deleteAllConfirmVisible, setDeleteAllConfirmVisible,
    deleteSingleTarget, setDeleteSingleTarget,
    createModalVisible, setCreateModalVisible,
    chatModalVisible, setChatModalVisible,
    deletingChats, setDeletingChats,
    selectedUserId, setSelectedUserId,
    conversations, setConversations,
    chatMessages, setChatMessages,
    selectedConvId, setSelectedConvId,
    loadingChat, setLoadingChat,
    form, pickers, insets, t, flatListRef,
  };
}

export function useStregattiQueries(filter: string) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery<any>({
    queryKey: ["/api/admin/stregatti", filter],
    queryFn: async ({ pageParam = 0 }) => {
      const res = await apiRequest("GET", `/api/admin/stregatti?offset=${pageParam}&filter=${filter}`);
      return res.json();
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage: any) => lastPage.hasMore ? lastPage.nextOffset : undefined,
  });

  const users = data?.pages.flatMap((p: any) => p.users) ?? [];
  const totalCount = data?.pages[0]?.total ?? 0;
  const pageStats = data?.pages[0]?.stats ?? { total: 0, biker: 0, zavorrina: 0, coppia: 0 };

  const { data: chatbotData } = useQuery<any>({
    queryKey: ["/api/settings/chatbot-enabled"],
    queryFn: async () => (await apiRequest("GET", "/api/settings/chatbot-enabled")).json(),
  });
  const { data: allEnabledData } = useQuery<any>({
    queryKey: ["/api/admin/stregatti/all-enabled"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/stregatti/all-enabled")).json(),
  });
  const { data: motionStatus, refetch: refetchMotionStatus } = useQuery<any>({
    queryKey: ["/api/admin/stregatti/motion-status"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/stregatti/motion-status")).json(),
  });
  const { data: bboxData, refetch: refetchBbox } = useQuery<any>({
    queryKey: ["/api/admin/stregatti/bbox"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/stregatti/bbox")).json(),
  });

  return {
    chatbotEnabled: chatbotData?.enabled ?? false,
    allEnabled: allEnabledData?.enabled ?? false,
    users, totalCount, pageStats,
    isFetchingNextPage, hasNextPage: hasNextPage ?? false, fetchNextPage,
    motionStatus, bboxData, refetchMotionStatus, refetchBbox,
  };
}

export function useStregattiMutations(
  _qc: any,
  setCreateModalVisible: (v: boolean) => void,
  resetForm: () => void,
  refetchMotionStatus: () => void,
  refetchBbox: () => void,
  _t: any,
) {
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] });

  const chatbotMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("POST", "/api/settings/chatbot-enabled", { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/settings/chatbot-enabled"] }),
  });
  const toggleAllMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/stregatti/toggle-all", body),
    onSuccess: () => { invalidate(); queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti/all-enabled"] }); },
  });
  const toggleAvailableMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/stregatti/${id}/available`),
    onSuccess: invalidate,
  });
  const toggleOnlineMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/admin/stregatti/${id}/online`),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/stregatti/${id}`),
    onSuccess: invalidate,
  });
  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/stregatti/all"),
    onSuccess: invalidate,
  });
  const toggleMotionMutation = useMutation({
    mutationFn: (v: boolean) => apiRequest("POST", "/api/admin/stregatti/motion", { enabled: v }),
    onSuccess: () => refetchMotionStatus(),
  });
  const updateBboxMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/stregatti/bbox", body),
    onSuccess: () => refetchBbox(),
  });
  const wakeAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stregatti/wake-all"),
    onSuccess: invalidate,
  });
  const forceMatchingMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/run-matching"),
    onSuccess: invalidate,
  });
  const resetMatchesMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/stregatti/matches"),
    onSuccess: invalidate,
  });
  const distributeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/stregatti/distribute"),
    onSuccess: invalidate,
  });
  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/admin/stregatti", body),
    onSuccess: () => { invalidate(); setCreateModalVisible(false); resetForm(); },
  });

  return {
    chatbotMutation, toggleAllMutation, toggleAvailableMutation, toggleOnlineMutation,
    deleteMutation, deleteAllMutation, toggleMotionMutation, updateBboxMutation,
    wakeAllMutation, forceMatchingMutation, resetMatchesMutation, distributeMutation, createMutation,
  };
}

export function useMassSeed(_qc: any) {
  const [massSeedRunning, setMassSeedRunning] = useState(false);
  const [massSeedCreated, setMassSeedCreated] = useState(0);
  const [massSeedTotal, setMassSeedTotal] = useState(0);
  const [massSeedError, setMassSeedError] = useState<string | null>(null);
  const [massSeedConfirmVisible, setMassSeedConfirmVisible] = useState(false);

  const startMassSeed = async () => {
    setMassSeedRunning(true);
    setMassSeedCreated(0);
    setMassSeedError(null);
    try {
      const res = await apiRequest("POST", "/api/admin/stregatti/mass-seed");
      const data = await res.json();
      setMassSeedCreated(data.created ?? 0);
      setMassSeedTotal(data.total ?? 0);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stregatti"] });
    } catch (e: any) {
      setMassSeedError(e?.message ?? "Errore");
    } finally {
      setMassSeedRunning(false);
    }
  };

  return {
    massSeedRunning, massSeedCreated, massSeedTotal, massSeedError,
    massSeedConfirmVisible, setMassSeedConfirmVisible, startMassSeed,
  };
}

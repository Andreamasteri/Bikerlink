import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Switch,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";

const REGIONS = [
  "Abruzzo", "Basilicata", "Calabria", "Campania", "Emilia-Romagna",
  "Friuli Venezia Giulia", "Lazio", "Liguria", "Lombardia", "Marche",
  "Molise", "Piemonte", "Puglia", "Sardegna", "Sicilia", "Toscana",
  "Trentino-Alto Adige", "Umbria", "Valle d'Aosta", "Veneto",
];

const MOTORCYCLE_TYPES = ["Naked", "Sport", "Touring", "Enduro", "Cruiser", "Adventure", "Custom", "Scooter"];
const RIDING_STYLES = ["Allegra", "Tranquilla", "Sportiva", "Turistica"];

type FilterType = "tutti" | "biker" | "zavorrina" | "coppia";

interface FakeUser {
  id: number;
  nickname: string;
  userType: string;
  sex: string;
  region: string;
  birthYear: number;
  isFake: boolean;
  lastLoginAt: string | null;
  profile: { isAvailable: boolean } | null;
  profileViews: number;
  chatRequests: number;
  chatMessages: number;
}

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

export default function FakeUsersAdmin() {
  const rawInsets = useSafeAreaInsets();
  const insets = Platform.OS === "web"
    ? { top: 67, bottom: 34, left: rawInsets.left, right: rawInsets.right }
    : rawInsets;

  const [filter, setFilter] = useState<FilterType>("tutti");
  const [togglePwdVisible, setTogglePwdVisible] = useState(false);
  const [togglePwdInput, setTogglePwdInput] = useState("");
  const [pendingToggleVal, setPendingToggleVal] = useState<boolean | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);

  const [formType, setFormType] = useState<string>("biker");
  const [formSex, setFormSex] = useState<string>("M");
  const [formNickname, setFormNickname] = useState("");
  const [formRegion, setFormRegion] = useState("Lombardia");
  const [formBirthYear, setFormBirthYear] = useState("");
  const [formBio, setFormBio] = useState("");
  const [formMotoBrand, setFormMotoBrand] = useState("");
  const [formMotoModel, setFormMotoModel] = useState("");
  const [formMotoType, setFormMotoType] = useState("Naked");
  const [formRidingStyle, setFormRidingStyle] = useState("Allegra");
  const [formDisplacement, setFormDisplacement] = useState("");
  const [formMotoYear, setFormMotoYear] = useState("");
  const [formWishlistDesc, setFormWishlistDesc] = useState("");
  const [formDesiredBrand, setFormDesiredBrand] = useState("");
  const [formDesiredModel, setFormDesiredModel] = useState("");
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  const { data: chatbotData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/chatbot-enabled"],
  });
  const chatbotEnabled = chatbotData?.enabled !== false;

  const chatbotMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/settings/chatbot_enabled", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: enabled ? "true" : "false" }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/chatbot-enabled"] });
    },
  });

  const { data: fakeUsersEnabledData } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/fake-users-enabled"],
  });
  const allEnabled = fakeUsersEnabledData?.enabled !== false;

  const toggleAllMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/fake-users/toggle-all", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/fake-users-enabled"] });
    },
  });

  const { data: users = [], isLoading, error: usersError } = useQuery<FakeUser[]>({
    queryKey: ["/api/admin/fake-users"],
    queryFn: async () => {
      const url = new URL("/api/admin/fake-users", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 401) throw new Error("Sessione scaduta — effettua di nuovo il login come admin");
      if (!res.ok) throw new Error("Errore caricamento utenti fake");
      return res.json();
    },
    retry: 1,
  });

  const toggleAvailableMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PUT", `/api/admin/fake-users/${id}/toggle-available`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] }),
  });

  const toggleOnlineMutation = useMutation({
    mutationFn: (id: number) => apiRequest("PUT", `/api/admin/fake-users/${id}/toggle-online`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/admin/fake-users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/fake-users"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/fake-users-enabled"] });
      Alert.alert("Fatto", "Tutti gli utenti fake sono stati eliminati");
    },
    onError: (error: Error) => {
      Alert.alert("Errore", error.message || "Errore durante l'eliminazione");
    },
  });

  const [massSeedRunning, setMassSeedRunning] = useState(false);
  const [massSeedCreated, setMassSeedCreated] = useState(0);
  const [massSeedTotal, setMassSeedTotal] = useState(0);
  const [massSeedError, setMassSeedError] = useState<string | null>(null);
  const [massSeedConfirmVisible, setMassSeedConfirmVisible] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = async () => {
    try {
      const url = new URL("/api/admin/mass-seed-status", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setMassSeedRunning(data.running);
      setMassSeedCreated(data.created);
      setMassSeedTotal(data.total);
      setMassSeedError(data.error);
      if (!data.running) {
        stopPolling();
        queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] });
      }
    } catch {}
  };

  const checkAndStartPolling = async () => {
    try {
      const url = new URL("/api/admin/mass-seed-status", getApiUrl()).toString();
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setMassSeedRunning(data.running);
      setMassSeedCreated(data.created);
      setMassSeedTotal(data.total);
      setMassSeedError(data.error);
      if (data.running && !pollRef.current) {
        pollRef.current = setInterval(pollStatus, 3000);
      }
    } catch {}
  };

  useEffect(() => {
    checkAndStartPolling();
    return stopPolling;
  }, []);

  const startMassSeed = async () => {
    try {
      setMassSeedError(null);
      const url = new URL("/api/admin/mass-seed-fake-users", getApiUrl()).toString();
      const res = await fetch(url, { method: "POST", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        Alert.alert("Errore", data.message || "Impossibile avviare");
        return;
      }
      setMassSeedRunning(true);
      setMassSeedCreated(0);
      setMassSeedTotal(2420);
      pollRef.current = setInterval(pollStatus, 3000);
    } catch (e: any) {
      Alert.alert("Errore", e.message || "Errore di rete");
    }
  };

  const handleStartMassSeed = () => {
    setMassSeedConfirmVisible(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/fake-users", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] });
      setCreateModalVisible(false);
      resetForm();
    },
  });

  const resetForm = () => {
    setFormType("biker");
    setFormSex("M");
    setFormNickname("");
    setFormRegion("Lombardia");
    setFormBirthYear("");
    setFormBio("");
    setFormMotoBrand("");
    setFormMotoModel("");
    setFormMotoType("Naked");
    setFormRidingStyle("Allegra");
    setFormDisplacement("");
    setFormMotoYear("");
    setFormWishlistDesc("");
    setFormDesiredBrand("");
    setFormDesiredModel("");
  };

  const filteredUsers = users.filter((u) => {
    if (filter === "tutti") return true;
    return u.userType === filter;
  });

  const bikerCount = users.filter((u) => u.userType === "biker").length;
  const zavorrinaCount = users.filter((u) => u.userType === "zavorrina").length;
  const coppiaCount = users.filter((u) => u.userType === "coppia").length;

  const handleDelete = (id: number, nickname: string) => {
    Alert.alert("Conferma", `Eliminare l'utente fake "${nickname}"?`, [
      { text: "Annulla", style: "cancel" },
      { text: "Elimina", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const handleDeleteAll = () => {
    if (users.length === 0) {
      Alert.alert("Info", "Non ci sono utenti fake da eliminare");
      return;
    }
    Alert.alert(
      "Elimina tutti gli utenti fake",
      `Stai per eliminare definitivamente ${users.length} utenti fake e tutti i loro dati associati (profili, moto, wishlist, interazioni, conversazioni).\n\nQuesta azione non può essere annullata.`,
      [
        { text: "Annulla", style: "cancel" },
        { text: "Elimina tutti", style: "destructive", onPress: () => deleteAllMutation.mutate() },
      ]
    );
  };

  const handleViewChat = async (userId: number) => {
    setSelectedUserId(userId);
    setSelectedConvId(null);
    setChatMessages([]);
    setLoadingChat(true);
    setChatModalVisible(true);
    try {
      const url = getApiUrl() + `/api/admin/fake-users/${userId}/conversations`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (e) {
      setConversations([]);
    }
    setLoadingChat(false);
  };

  const handleViewMessages = async (convId: number) => {
    setSelectedConvId(convId);
    setLoadingChat(true);
    try {
      const url = getApiUrl() + `/api/admin/fake-users/conversations/${convId}/messages`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data);
      }
    } catch (e) {
      setChatMessages([]);
    }
    setLoadingChat(false);
  };

  const handleCreate = () => {
    const data: any = {
      userType: formType,
      sex: formSex,
      nickname: formNickname,
      region: formRegion,
      birthYear: parseInt(formBirthYear) || 1990,
      bio: formBio,
    };
    if (formType === "biker" || formType === "coppia") {
      data.motorcycle = {
        brand: formMotoBrand,
        model: formMotoModel,
        motorcycleType: formMotoType,
        ridingStyle: formRidingStyle,
        displacement: parseInt(formDisplacement) || 0,
        year: parseInt(formMotoYear) || 2020,
      };
    }
    if (formType === "zavorrina") {
      data.wishlist = {
        description: formWishlistDesc,
        desiredBrand: formDesiredBrand,
        desiredModel: formDesiredModel,
      };
    }
    createMutation.mutate(data);
  };

  const getUserIcon = (userType: string) => {
    switch (userType) {
      case "biker": return <Ionicons name="bicycle" size={24} color={Colors.accent} />;
      case "zavorrina": return <MaterialIcons name="airline-seat-recline-normal" size={24} color={Colors.accent} />;
      case "coppia": return <Ionicons name="people" size={24} color={Colors.accent} />;
      default: return <Ionicons name="person" size={24} color={Colors.accent} />;
    }
  };

  const isOnline = (u: FakeUser) => {
    if (!u.lastLoginAt) return false;
    const diff = Date.now() - new Date(u.lastLoginAt).getTime();
    return diff < 5 * 60 * 1000;
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <KeyboardAwareScrollViewCompat contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]} bottomOffset={20}>
        <Text style={styles.title}>Utenti Fake</Text>

        <View style={styles.controlsCard}>
          <View style={styles.controlRow}>
            <View style={styles.controlInfo}>
              <Ionicons name="people" size={20} color={Colors.accent} />
              <Text style={styles.controlLabel}>Abilita utenti fake</Text>
            </View>
            <Switch
              value={allEnabled}
              onValueChange={(val) => {
                setPendingToggleVal(val);
                setTogglePwdInput("");
                setTogglePwdVisible(true);
              }}
              trackColor={{ false: Colors.border, true: Colors.success }}
              thumbColor={allEnabled ? Colors.text : Colors.textSecondary}
              disabled={toggleAllMutation.isPending}
            />
          </View>
          <Text style={styles.controlDesc}>
            {allEnabled ? "Tutti gli utenti fake sono attivi e visibili" : "Gli utenti fake sono disattivati"}
          </Text>
          {isLoading && (
            <Text style={[styles.controlDesc, { color: Colors.accent }]}>
              Caricamento utenti fake...
            </Text>
          )}
          {!!usersError && (
            <Text style={[styles.controlDesc, { color: Colors.error ?? "#e53935" }]}>
              {(usersError as Error).message}
            </Text>
          )}
          {!isLoading && !usersError && users.length === 0 && (
            <Text style={styles.controlDesc}>
              Nessun utente fake nel sistema. Usa il form in basso per aggiungerne.
            </Text>
          )}

          <View style={[styles.controlDivider]} />

          <View style={styles.controlRow}>
            <View style={styles.controlInfo}>
              <Ionicons name="chatbubbles" size={20} color={Colors.accent} />
              <Text style={styles.controlLabel}>Chatbot Utenti Fittizi</Text>
            </View>
            <Switch
              value={chatbotEnabled}
              onValueChange={(val) => chatbotMutation.mutate(val)}
              trackColor={{ false: Colors.border, true: Colors.accent }}
              thumbColor={chatbotEnabled ? Colors.text : Colors.textSecondary}
              disabled={chatbotMutation.isPending}
            />
          </View>
          <Text style={styles.controlDesc}>
            {chatbotEnabled ? "Il bot risponde automaticamente per gli utenti fittizi" : "Il bot è disattivato, gli utenti fittizi non rispondono"}
          </Text>

          <View style={[styles.controlDivider]} />

          <TouchableOpacity
            style={styles.deleteAllBtn}
            onPress={handleDeleteAll}
            disabled={deleteAllMutation.isPending || users.length === 0}
            activeOpacity={0.7}
          >
            {deleteAllMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="trash" size={18} color="#fff" />
                <Text style={styles.deleteAllBtnText}>Elimina tutti ({users.length})</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.massSeedCard}>
          <View style={styles.massSeedHeader}>
            <Ionicons name="flash" size={22} color={Colors.accent} />
            <Text style={styles.massSeedTitle}>Generazione Massiva</Text>
          </View>
          <Text style={styles.massSeedDesc}>
            Genera 2420 utenti fake (1500 biker M, 200 biker F, 170 coppie, 500 zav F, 50 zav M) distribuiti uniformemente nelle 20 regioni italiane.
          </Text>
          {massSeedRunning && (
            <View style={styles.massSeedProgress}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${massSeedTotal > 0 ? Math.round((massSeedCreated / massSeedTotal) * 100) : 0}%` }]} />
              </View>
              <Text style={styles.massSeedProgressText}>
                {massSeedCreated} / {massSeedTotal} ({massSeedTotal > 0 ? Math.round((massSeedCreated / massSeedTotal) * 100) : 0}%)
              </Text>
            </View>
          )}
          {!!massSeedError && (
            <Text style={styles.massSeedErrorText}>Errore: {massSeedError}</Text>
          )}
          {!massSeedRunning && massSeedCreated > 0 && !massSeedError && (
            <Text style={styles.massSeedSuccessText}>Completato: {massSeedCreated} utenti creati</Text>
          )}
          <TouchableOpacity
            style={[styles.massSeedBtn, massSeedRunning && styles.massSeedBtnDisabled]}
            onPress={handleStartMassSeed}
            disabled={massSeedRunning}
            activeOpacity={0.7}
          >
            {massSeedRunning ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <>
                <Ionicons name="flash" size={18} color="#000" />
                <Text style={styles.massSeedBtnText}>Genera 2420 utenti</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{users.length}</Text>
            <Text style={styles.summaryLabel}>Totale</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{bikerCount}</Text>
            <Text style={styles.summaryLabel}>Biker</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{zavorrinaCount}</Text>
            <Text style={styles.summaryLabel}>Zavorrine</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{coppiaCount}</Text>
            <Text style={styles.summaryLabel}>Coppie</Text>
          </View>
        </View>

        <View style={styles.filterRow}>
          {(["tutti", "biker", "zavorrina", "coppia"] as FilterType[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, filter === f && styles.filterTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterTabText, filter === f && styles.filterTabTextActive]}>
                {f === "tutti" ? "Tutti" : f === "biker" ? "Biker" : f === "zavorrina" ? "Zavorrine" : "Coppie"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading && <ActivityIndicator color={Colors.accent} style={{ marginTop: 40 }} />}

        {filteredUsers.map((user) => (
          <View key={user.id} style={styles.userCard}>
            <View style={styles.userCardHeader}>
              <View style={styles.userIconWrap}>{getUserIcon(user.userType)}</View>
              <View style={styles.userInfo}>
                <View style={styles.userNameRow}>
                  <Text style={styles.userNickname}>{user.nickname}</Text>
                  <View style={[styles.onlineDot, { backgroundColor: isOnline(user) ? Colors.success : "#666" }]} />
                </View>
                <Text style={styles.userMeta}>{user.region} · {user.sex}</Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Ionicons name="eye" size={16} color={Colors.textSecondary} />
                <Text style={styles.statText}>{user.profileViews}</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="chatbubble" size={16} color={Colors.textSecondary} />
                <Text style={styles.statText}>{user.chatRequests}</Text>
              </View>
              <View style={styles.statItem}>
                <Ionicons name="mail" size={16} color={Colors.textSecondary} />
                <Text style={styles.statText}>{user.chatMessages}</Text>
              </View>
            </View>

            <View style={styles.togglesRow}>
              <View style={styles.toggleItem}>
                <Text style={styles.toggleLabel}>Disponibile</Text>
                <Switch
                  value={!!user.profile?.isAvailable}
                  onValueChange={() => toggleAvailableMutation.mutate(user.id)}
                  trackColor={{ false: "#555", true: Colors.success }}
                  thumbColor="#fff"
                />
              </View>
              <View style={styles.toggleItem}>
                <Text style={styles.toggleLabel}>Online</Text>
                <Switch
                  value={isOnline(user)}
                  onValueChange={() => toggleOnlineMutation.mutate(user.id)}
                  trackColor={{ false: "#555", true: Colors.success }}
                  thumbColor="#fff"
                />
              </View>
            </View>

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.chatBtn} onPress={() => handleViewChat(user.id)}>
                <Ionicons name="chatbubbles" size={16} color={Colors.accent} />
                <Text style={styles.chatBtnText}>Vedi Chat</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(user.id, user.nickname)}>
                <Ionicons name="trash" size={22} color={Colors.error} />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {!isLoading && filteredUsers.length === 0 && (
          <Text style={styles.emptyText}>Nessun utente fake trovato</Text>
        )}
      </KeyboardAwareScrollViewCompat>

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 20 }]}
        onPress={() => setCreateModalVisible(true)}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={chatModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {!!selectedConvId ? "Messaggi" : "Conversazioni"}
              </Text>
              <TouchableOpacity onPress={() => {
                if (selectedConvId) {
                  setSelectedConvId(null);
                  setChatMessages([]);
                } else {
                  setChatModalVisible(false);
                }
              }}>
                <Ionicons name={selectedConvId ? "arrow-back" : "close"} size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {loadingChat && <ActivityIndicator color={Colors.accent} style={{ marginTop: 20 }} />}

              {!loadingChat && !selectedConvId && conversations.map((conv) => (
                <TouchableOpacity
                  key={conv.id}
                  style={styles.convItem}
                  onPress={() => handleViewMessages(conv.id)}
                >
                  <View>
                    <Text style={styles.convNickname}>{conv.otherParticipantNickname}</Text>
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
        </View>
      </Modal>

      <Modal visible={createModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nuovo Utente Fake</Text>
                <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                  <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollViewCompat style={styles.modalScroll} bottomOffset={20} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Tipo utente</Text>
              <View style={styles.filterRow}>
                {["biker", "zavorrina", "coppia"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.filterTab, formType === t && styles.filterTabActive]}
                    onPress={() => setFormType(t)}
                  >
                    <Text style={[styles.filterTabText, formType === t && styles.filterTabTextActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Sesso</Text>
              <View style={styles.filterRow}>
                {(formType === "coppia" ? ["MF"] : ["M", "F"]).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.filterTab, formSex === s && styles.filterTabActive]}
                    onPress={() => setFormSex(s)}
                  >
                    <Text style={[styles.filterTabText, formSex === s && styles.filterTabTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Nickname</Text>
              <TextInput
                style={styles.input}
                value={formNickname}
                onChangeText={setFormNickname}
                placeholder="Nickname"
                placeholderTextColor="#666"
              />

              <Text style={styles.fieldLabel}>Regione</Text>
              <TouchableOpacity style={styles.input} onPress={() => setShowRegionPicker(!showRegionPicker)}>
                <Text style={styles.inputText}>{formRegion}</Text>
              </TouchableOpacity>
              {!!showRegionPicker && (
                <View style={styles.pickerList}>
                  {REGIONS.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.pickerItem, formRegion === r && styles.pickerItemActive]}
                      onPress={() => { setFormRegion(r); setShowRegionPicker(false); }}
                    >
                      <Text style={[styles.pickerItemText, formRegion === r && styles.pickerItemTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Anno nascita</Text>
              <TextInput
                style={styles.input}
                value={formBirthYear}
                onChangeText={setFormBirthYear}
                placeholder="1990"
                placeholderTextColor="#666"
                keyboardType="number-pad"
              />

              <Text style={styles.fieldLabel}>Bio</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={formBio}
                onChangeText={setFormBio}
                placeholder="Bio..."
                placeholderTextColor="#666"
                multiline
                numberOfLines={3}
              />

              {(formType === "biker" || formType === "coppia") && (
                <>
                  <Text style={styles.sectionTitle}>Moto</Text>
                  <Text style={styles.fieldLabel}>Marca</Text>
                  <TextInput style={styles.input} value={formMotoBrand} onChangeText={setFormMotoBrand} placeholder="Honda" placeholderTextColor="#666" />
                  <Text style={styles.fieldLabel}>Modello</Text>
                  <TextInput style={styles.input} value={formMotoModel} onChangeText={setFormMotoModel} placeholder="CBR 600" placeholderTextColor="#666" />

                  <Text style={styles.fieldLabel}>Tipo moto</Text>
                  <View style={styles.chipRow}>
                    {MOTORCYCLE_TYPES.map((mt) => (
                      <TouchableOpacity
                        key={mt}
                        style={[styles.chip, formMotoType === mt && styles.chipActive]}
                        onPress={() => setFormMotoType(mt)}
                      >
                        <Text style={[styles.chipText, formMotoType === mt && styles.chipTextActive]}>{mt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>Stile di guida</Text>
                  <View style={styles.chipRow}>
                    {RIDING_STYLES.map((rs) => (
                      <TouchableOpacity
                        key={rs}
                        style={[styles.chip, formRidingStyle === rs && styles.chipActive]}
                        onPress={() => setFormRidingStyle(rs)}
                      >
                        <Text style={[styles.chipText, formRidingStyle === rs && styles.chipTextActive]}>{rs}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.fieldLabel}>Cilindrata</Text>
                  <TextInput style={styles.input} value={formDisplacement} onChangeText={setFormDisplacement} placeholder="600" placeholderTextColor="#666" keyboardType="number-pad" />
                  <Text style={styles.fieldLabel}>Anno moto</Text>
                  <TextInput style={styles.input} value={formMotoYear} onChangeText={setFormMotoYear} placeholder="2020" placeholderTextColor="#666" keyboardType="number-pad" />
                </>
              )}

              {formType === "zavorrina" && (
                <>
                  <Text style={styles.sectionTitle}>Wishlist</Text>
                  <Text style={styles.fieldLabel}>Descrizione</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={formWishlistDesc}
                    onChangeText={setFormWishlistDesc}
                    placeholder="Cosa cerchi..."
                    placeholderTextColor="#666"
                    multiline
                    numberOfLines={3}
                  />
                  <Text style={styles.fieldLabel}>Marca desiderata</Text>
                  <TextInput style={styles.input} value={formDesiredBrand} onChangeText={setFormDesiredBrand} placeholder="Ducati" placeholderTextColor="#666" />
                  <Text style={styles.fieldLabel}>Modello desiderato</Text>
                  <TextInput style={styles.input} value={formDesiredModel} onChangeText={setFormDesiredModel} placeholder="Monster" placeholderTextColor="#666" />
                </>
              )}

              <TouchableOpacity
                style={[styles.createBtn, createMutation.isPending && styles.createBtnDisabled]}
                onPress={handleCreate}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.createBtnText}>Crea Utente Fake</Text>
                )}
              </TouchableOpacity>
              </KeyboardAwareScrollViewCompat>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={massSeedConfirmVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pwdModalContainer}>
            <Text style={styles.pwdModalTitle}>Generazione Massiva</Text>
            <Text style={styles.pwdModalDesc}>
              Verranno generati 2420 utenti fake distribuiti uniformemente in tutte le 20 regioni italiane.{"\n\n"}Questo processo richiederà qualche minuto.
            </Text>
            <View style={styles.pwdModalButtons}>
              <TouchableOpacity
                style={[styles.pwdBtn, styles.pwdBtnCancel]}
                onPress={() => setMassSeedConfirmVisible(false)}
              >
                <Text style={styles.pwdBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pwdBtn, styles.pwdBtnConfirm]}
                onPress={() => { setMassSeedConfirmVisible(false); startMassSeed(); }}
              >
                <Text style={styles.pwdBtnText}>Genera</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={togglePwdVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.pwdModalContainer}>
            <Text style={styles.pwdModalTitle}>
              {pendingToggleVal ? "Abilita utenti fake" : "Disabilita utenti fake"}
            </Text>
            <Text style={styles.pwdModalDesc}>
              Inserisci la password admin per confermare questa operazione.
            </Text>
            <TextInput
              style={styles.pwdInput}
              placeholder="Password admin"
              placeholderTextColor={Colors.textSecondary}
              secureTextEntry
              value={togglePwdInput}
              onChangeText={setTogglePwdInput}
              autoFocus
            />
            <View style={styles.pwdModalButtons}>
              <TouchableOpacity
                style={[styles.pwdBtn, styles.pwdBtnCancel]}
                onPress={() => { setTogglePwdVisible(false); setTogglePwdInput(""); }}
              >
                <Text style={styles.pwdBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pwdBtn, styles.pwdBtnConfirm]}
                onPress={async () => {
                  try {
                    const url = new URL("/api/admin/verify-password", getApiUrl());
                    const res = await fetch(url.toString(), {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      credentials: "include",
                      body: JSON.stringify({ password: togglePwdInput }),
                    });
                    if (res.ok) {
                      setTogglePwdVisible(false);
                      setTogglePwdInput("");
                      if (pendingToggleVal !== null) toggleAllMutation.mutate(pendingToggleVal);
                    } else {
                      setTogglePwdInput("");
                      Alert.alert("Errore", "Password non corretta.");
                    }
                  } catch {
                    Alert.alert("Errore", "Errore di connessione.");
                  }
                }}
              >
                <Text style={styles.pwdBtnText}>Conferma</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
    marginBottom: 16,
  },
  controlsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  controlRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  controlInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  controlLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  controlDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  controlDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 14,
  },
  deleteAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  deleteAllBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  summaryCount: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.accent,
  },
  summaryLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterTabActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  filterTabText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  filterTabTextActive: {
    color: "#000",
  },
  userCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  userCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  userIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userNickname: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  userMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
    paddingLeft: 56,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  statText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  togglesRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 10,
    paddingLeft: 56,
  },
  toggleItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toggleLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingLeft: 56,
  },
  chatBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  chatBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.accent,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: 40,
  },
  fab: {
    position: "absolute",
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  modalContent: {
    flex: 1,
    backgroundColor: Colors.background,
    marginTop: 40,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.text,
  },
  modalScroll: {
    flex: 1,
  },
  convItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  convNickname: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
  convPreview: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    maxWidth: 220,
  },
  convBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 24,
    alignItems: "center",
  },
  convBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#000",
  },
  msgBubble: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  msgSender: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
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
  fieldLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 6,
    marginTop: 10,
  },
  sectionTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.accent,
    marginTop: 20,
    marginBottom: 4,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: 12,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 4,
  },
  inputText: {
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  pickerList: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    maxHeight: 200,
  },
  pickerItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pickerItemActive: {
    backgroundColor: Colors.accent,
  },
  pickerItemText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text,
  },
  pickerItemTextActive: {
    color: "#000",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  chipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: "#000",
  },
  createBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 20,
    marginBottom: 20,
  },
  createBtnDisabled: {
    opacity: 0.6,
  },
  createBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#000",
  },
  massSeedCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  massSeedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  massSeedTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: Colors.text,
  },
  massSeedDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 18,
  },
  massSeedProgress: {
    marginBottom: 12,
  },
  progressBarBg: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    overflow: "hidden" as const,
    marginBottom: 6,
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
  massSeedProgressText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.text,
    textAlign: "center" as const,
  },
  massSeedErrorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.error,
    marginBottom: 8,
  },
  massSeedSuccessText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: Colors.success,
    marginBottom: 8,
  },
  massSeedBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 10,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  massSeedBtnDisabled: {
    opacity: 0.6,
  },
  massSeedBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: "#000",
  },
  pwdModalContainer: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 32,
    gap: 12,
  },
  pwdModalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: Colors.text,
    textAlign: "center" as const,
  },
  pwdModalDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center" as const,
  },
  pwdInput: {
    backgroundColor: Colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pwdModalButtons: {
    flexDirection: "row" as const,
    gap: 10,
    marginTop: 4,
  },
  pwdBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center" as const,
  },
  pwdBtnCancel: {
    backgroundColor: Colors.border,
  },
  pwdBtnConfirm: {
    backgroundColor: Colors.accent,
  },
  pwdBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.text,
  },
});

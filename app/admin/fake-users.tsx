import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Platform,
  Modal,
  TextInput,
  ActivityIndicator,
  Switch,
} from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { apiRequest, getApiUrl, queryClient } from "@/lib/query-client";

const COUNTRIES_DATA: { code: string; name: string; regions: string[] }[] = [
  { code: "IT", name: "🇮🇹 Italia", regions: ["Abruzzo","Basilicata","Calabria","Campania","Emilia-Romagna","Friuli Venezia Giulia","Lazio","Liguria","Lombardia","Marche","Molise","Piemonte","Puglia","Sardegna","Sicilia","Toscana","Trentino-Alto Adige","Umbria","Valle d'Aosta","Veneto"] },
  { code: "DE", name: "🇩🇪 Germania", regions: ["Baden-Württemberg","Bayern","Berlin","Brandenburg","Bremen","Hamburg","Hessen","Mecklenburg-Vorpommern","Niedersachsen","Nordrhein-Westfalen","Rheinland-Pfalz","Saarland","Sachsen","Sachsen-Anhalt","Schleswig-Holstein","Thüringen"] },
  { code: "FR", name: "🇫🇷 Francia", regions: ["Auvergne-Rhône-Alpes","Bourgogne-Franche-Comté","Bretagne","Centre-Val de Loire","Corse","Grand Est","Hauts-de-France","Île-de-France","Normandie","Nouvelle-Aquitaine","Occitanie","Pays de la Loire","Provence-Alpes-Côte d'Azur"] },
  { code: "ES", name: "🇪🇸 Spagna", regions: ["Andalucía","Aragón","Asturias","Baleares","Canarias","Cantabria","Castilla-La Mancha","Castilla y León","Cataluña","Comunidad de Madrid","Comunidad Valenciana","Extremadura","Galicia","La Rioja","Navarra","País Vasco","Región de Murcia"] },
  { code: "PT", name: "🇵🇹 Portogallo", regions: ["Alentejo","Algarve","Centro","Lisboa","Norte","Açores","Madeira"] },
  { code: "AT", name: "🇦🇹 Austria", regions: ["Burgenland","Kärnten","Niederösterreich","Oberösterreich","Salzburg","Steiermark","Tirol","Vorarlberg","Wien"] },
  { code: "CH", name: "🇨🇭 Svizzera", regions: ["Bern","Geneva","Graubünden","Luzern","Ticino","Valais","Vaud","Zürich"] },
  { code: "BE", name: "🇧🇪 Belgio", regions: ["Bruxelles","Fiandre","Vallonia"] },
  { code: "NL", name: "🇳🇱 Paesi Bassi", regions: ["Drenthe","Flevoland","Friesland","Gelderland","Groningen","Limburg","Noord-Brabant","Noord-Holland","Overijssel","Utrecht","Zeeland","Zuid-Holland"] },
  { code: "PL", name: "🇵🇱 Polonia", regions: ["Dolnośląskie","Kujawsko-Pomorskie","Łódź","Lubelskie","Lubuskie","Małopolskie","Mazowieckie","Opolskie","Podkarpackie","Podlaskie","Pomorskie","Śląskie","Świętokrzyskie","Warmińsko-Mazurskie","Wielkopolskie","Zachodniopomorskie"] },
  { code: "CZ", name: "🇨🇿 Rep. Ceca", regions: ["Jihočeský","Jihomoravský","Karlovarský","Královéhradecký","Liberecký","Moravskoslezský","Olomoucký","Pardubický","Plzeňský","Praha","Středočeský","Ústecký","Vysočina","Zlínský"] },
  { code: "SK", name: "🇸🇰 Slovacchia", regions: ["Banskobystrický","Bratislavský","Košický","Nitrianský","Prešovský","Trenčínský","Trnavský","Žilinský"] },
  { code: "HU", name: "🇭🇺 Ungheria", regions: ["Budapest","Bács-Kiskun","Baranya","Békés","Borsod-Abaúj-Zemplén","Csongrád-Csanád","Fejér","Győr-Moson-Sopron","Hajdú-Bihar","Heves","Jász-Nagykun-Szolnok","Komárom-Esztergom","Nógrád","Pest","Somogy","Szabolcs-Szatmár-Bereg","Tolna","Vas","Veszprém","Zala"] },
  { code: "RO", name: "🇷🇴 Romania", regions: ["Alba","Arad","Argeș","Bacău","Bihor","Bistrița-Năsăud","Botoșani","Brașov","Brăila","București","Buzău","Caraș-Severin","Cluj","Constanța","Covasna","Dâmbovița","Dolj","Galați","Gorj","Harghita","Hunedoara","Iași","Maramureș","Mureș","Neamț","Olt","Prahova","Satu Mare","Sibiu","Suceava","Timiș","Tulcea","Vâlcea","Vaslui","Vrancea"] },
  { code: "GR", name: "🇬🇷 Grecia", regions: ["Attica","Creta","Epiro","Ionia","Macedonia","Peloponneso","Tessaglia","Tracia"] },
  { code: "HR", name: "🇭🇷 Croazia", regions: ["Grad Zagreb","Splitsko-dalmatinska","Primorsko-goranska","Istarska","Osječko-baranjska","Zadarska","Vukovarsko-srijemska","Karlovačka","Varaždinska","Sisačko-moslavačka","Šibensko-kninska","Dubrovačko-neretvanska","Koprivničko-križevačka","Brodsko-posavska","Međimurska","Bjelovarsko-bilogorska","Virovitičko-podravska","Požeško-slavonska","Krapinsko-zagorska","Ličko-senjska","Zagrebačka"] },
  { code: "SI", name: "🇸🇮 Slovenia", regions: ["Gorenjska","Goriška","Jugovzhodna Slovenija","Koroška","Obalno-kraška","Osrednjeslovenska","Podravska","Pomurska","Posavska","Primorsko-notranjska","Savinjska","Zasavska"] },
  { code: "RS", name: "🇷🇸 Serbia", regions: ["Beograd","Vojvodina","Šumadija","Serbia Occidentale","Serbia Meridionale","Serbia Orientale"] },
  { code: "BA", name: "🇧🇦 Bosnia Erzegovina", regions: ["Federazione di BiH","Repubblica Srpska","Distretto di Brčko"] },
  { code: "ME", name: "🇲🇪 Montenegro", regions: ["Bar","Bijelo Polje","Budva","Nikšić","Pljevlja","Podgorica"] },
  { code: "MK", name: "🇲🇰 Macedonia del Nord", regions: ["Pelagonia","Polog","Skopje","Sud-Ovest","Sud-Est","Vardar","Est","Nord-Est"] },
  { code: "AL", name: "🇦🇱 Albania", regions: ["Berat","Dibër","Durrës","Elbasan","Fier","Gjirokastër","Korçë","Kukës","Lezhë","Shkodër","Tiranë","Vlorë"] },
  { code: "BG", name: "🇧🇬 Bulgaria", regions: ["Blagoevgrad","Burgas","Gabrovo","Haskovo","Lovech","Montana","Pazardzhik","Pernik","Pleven","Plovdiv","Razgrad","Ruse","Shumen","Silistra","Sliven","Sofia","Stara Zagora","Varna","Veliko Tarnovo","Vidin","Vratsa","Yambol"] },
  { code: "MD", name: "🇲🇩 Moldova", regions: ["Chișinău","Centru","Nord","Sud"] },
  { code: "UA", name: "🇺🇦 Ucraina", regions: ["Cherkasy","Chernihiv","Chernivtsi","Dnipropetrovsk","Ivano-Frankivsk","Kharkiv","Kherson","Kiev","Leopoli","Mykolaiv","Odessa","Poltava","Rivne","Sumy","Ternopil","Vinnytsia","Volyn","Zakarpattia","Zaporizhzhia","Zhytomyr"] },
  { code: "BY", name: "🇧🇾 Bielorussia", regions: ["Brest","Gomel","Grodno","Minsk","Mogilev","Vitebsk"] },
  { code: "LT", name: "🇱🇹 Lituania", regions: ["Alytus","Kaunas","Klaipėda","Marijampolė","Panevėžys","Šiauliai","Tauragė","Telšiai","Utena","Vilnius"] },
  { code: "LV", name: "🇱🇻 Lettonia", regions: ["Courland","Latgale","Pieriga","Riga","Vidzeme","Zemgale"] },
  { code: "EE", name: "🇪🇪 Estonia", regions: ["Harju","Hiiu","Ida-Viru","Jõgeva","Järva","Lääne","Lääne-Viru","Põlva","Pärnu","Rapla","Saare","Tartu","Valga","Viljandi","Võru"] },
  { code: "FI", name: "🇫🇮 Finlandia", regions: ["Ahvenanmaa","Etelä-Karjala","Etelä-Pohjanmaa","Etelä-Savo","Kainuu","Kanta-Häme","Keski-Suomi","Kymenlaakso","Lappi","Pirkanmaa","Pohjanmaa","Pohjois-Karjala","Pohjois-Pohjanmaa","Pohjois-Savo","Päijät-Häme","Satakunta","Uusimaa","Varsinais-Suomi"] },
  { code: "SE", name: "🇸🇪 Svezia", regions: ["Blekinge","Dalarna","Gävleborg","Gotland","Halland","Jämtland","Jönköping","Kalmar","Kronoberg","Norrbotten","Skåne","Södermanland","Stockholm","Uppsala","Värmland","Västerbotten","Västernorrland","Västmanland","Västra Götaland","Örebro","Östergötland"] },
  { code: "NO", name: "🇳🇴 Norvegia", regions: ["Agder","Innlandet","Møre og Romsdal","Nordland","Oslo","Rogaland","Troms og Finnmark","Trøndelag","Vestfold og Telemark","Vestland","Viken"] },
  { code: "DK", name: "🇩🇰 Danimarca", regions: ["Hovedstaden","Midtjylland","Nordjylland","Sjælland","Syddanmark"] },
  { code: "IE", name: "🇮🇪 Irlanda", regions: ["Connacht","Leinster","Munster","Ulster"] },
  { code: "GB", name: "🇬🇧 Regno Unito", regions: ["Inghilterra","Scozia","Galles","Irlanda del Nord"] },
  { code: "IS", name: "🇮🇸 Islanda", regions: ["Capitale","Penisola di Reykjanes","Ovest","Fiordi Occidentali","Nord-Ovest","Nord-Est","Est","Sud"] },
  { code: "LU", name: "🇱🇺 Lussemburgo", regions: ["Diekirch","Grevenmacher","Lussemburgo"] },
  { code: "MT", name: "🇲🇹 Malta", regions: ["Malta","Gozo"] },
  { code: "CY", name: "🇨🇾 Cipro", regions: ["Nicosia","Limassol","Larnaca","Paphos","Famagosta","Kyrenia"] },
  { code: "TR", name: "🇹🇷 Turchia", regions: ["Ankara","İstanbul","İzmir","Antalya","Bursa","Adana","Konya","Gaziantep","Mersin","Kayseri","Trabzon","Erzurum","Malatya","Diyarbakır","Samsun"] },
  { code: "AD", name: "🇦🇩 Andorra", regions: ["Andorra la Vella","Canillo","Encamp","Escaldes-Engordany","La Massana","Ordino","Sant Julià de Lòria"] },
  { code: "MC", name: "🇲🇨 Monaco", regions: ["Monaco"] },
  { code: "SM", name: "🇸🇲 San Marino", regions: ["San Marino","Borgo Maggiore","Serravalle","Domagnano","Fiorentino","Acquaviva","Città","Montegiardino","Faetano"] },
  { code: "LI", name: "🇱🇮 Liechtenstein", regions: ["Vaduz","Schaan","Balzers","Triesen","Eschen","Mauren","Triesenberg","Ruggell","Gamprin","Schellenberg","Planken"] },
  { code: "XK", name: "🇽🇰 Kosovo", regions: ["Pristina","Mitrovica","Peja","Prizren","Gjakova","Ferizaj","Gjilan"] },
];

const getRegionsForCountry = (code: string): string[] => {
  return COUNTRIES_DATA.find(c => c.code === code)?.regions ?? [];
};

const MOTORCYCLE_TYPES = ["Naked", "Sport", "Touring", "Enduro", "Cruiser", "Adventure", "Custom", "Scooter"];
const RIDING_STYLES = ["Allegra", "Tranquilla", "Sportiva", "Turistica"];

type FilterType = "tutti" | "biker" | "zavorrina" | "coppia";

interface FakeUser {
  id: string;
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

interface FakeUsersPage {
  users: FakeUser[];
  total: number;
  hasMore: boolean;
  stats: { total: number; biker: number; zavorrina: number; coppia: number };
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

  const flatListRef = useRef<FlatList<FakeUser>>(null);
  const [filter, setFilter] = useState<FilterType>("tutti");
  const [deleteAllConfirmVisible, setDeleteAllConfirmVisible] = useState(false);
  const [deleteAllResultMsg, setDeleteAllResultMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteSingleTarget, setDeleteSingleTarget] = useState<{ id: string; nickname: string } | null>(null);
  const [togglePwdVisible, setTogglePwdVisible] = useState(false);
  const [togglePwdInput, setTogglePwdInput] = useState("");
  const [togglePwdError, setTogglePwdError] = useState<string | null>(null);
  const [pendingToggleVal, setPendingToggleVal] = useState<boolean | null>(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [deletingChats, setDeletingChats] = useState(false);
  const [deletingAllChats, setDeletingAllChats] = useState(false);
  const [deleteAllChatsResult, setDeleteAllChatsResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<number | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);

  const [formType, setFormType] = useState<string>("biker");
  const [formSex, setFormSex] = useState<string>("M");
  const [formNickname, setFormNickname] = useState("");
  const [formCountry, setFormCountry] = useState("IT");
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
  const [showCountryPicker, setShowCountryPicker] = useState(false);
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
    mutationFn: async ({ enabled, adminPassword }: { enabled: boolean; adminPassword: string }) => {
      const baseUrl = getApiUrl();
      const url = new URL("/api/admin/fake-users/toggle-all", baseUrl);
      const res = await fetch(url.toString(), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, adminPassword }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Errore" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/fake-users-enabled"] });
    },
  });

  const PAGE_SIZE = 50;
  const {
    data: usersData,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error: usersError,
  } = useInfiniteQuery<FakeUsersPage>({
    queryKey: ["/api/admin/fake-users", filter],
    queryFn: async ({ pageParam = 0 }) => {
      const url = new URL("/api/admin/fake-users", getApiUrl());
      url.searchParams.set("limit", String(PAGE_SIZE));
      url.searchParams.set("offset", String((pageParam as number) * PAGE_SIZE));
      url.searchParams.set("type", filter);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (res.status === 401) throw new Error("Sessione scaduta — effettua di nuovo il login come admin");
      if (!res.ok) throw new Error("Errore caricamento utenti fake");
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => lastPage.hasMore ? allPages.length : undefined,
    initialPageParam: 0,
    retry: 1,
  });

  const users: FakeUser[] = usersData?.pages.flatMap(p => p.users) ?? [];
  const totalCount = usersData?.pages[0]?.total ?? 0;
  const pageStats = usersData?.pages[0]?.stats ?? { total: 0, biker: 0, zavorrina: 0, coppia: 0 };

  const toggleAvailableMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/admin/fake-users/${id}/toggle-available`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] }),
  });

  const toggleOnlineMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PUT", `/api/admin/fake-users/${id}/toggle-online`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/fake-users/${id}`),
    onSuccess: () => {
      setDeleteSingleTarget(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/admin/fake-users"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/fake-users-enabled"] });
      setDeleteAllResultMsg({ type: "success", text: "Tutti gli utenti fake eliminati." });
    },
    onError: (error: Error) => {
      setDeleteAllResultMsg({ type: "error", text: error.message || "Errore durante l'eliminazione" });
    },
  });

  const [massSeedRunning, setMassSeedRunning] = useState(false);
  const [massSeedCreated, setMassSeedCreated] = useState(0);
  const [massSeedTotal, setMassSeedTotal] = useState(0);
  const [massSeedError, setMassSeedError] = useState<string | null>(null);
  const [massSeedConfirmVisible, setMassSeedConfirmVisible] = useState(false);

  const [wakeAllResult, setWakeAllResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const wakeAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/fake-users/wake-all", {}),
    onSuccess: (data: any) => {
      setWakeAllResult({ type: "success", text: `${data?.count ?? "?"} utenti fake portati online` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/fake-users"] });
    },
    onError: () => setWakeAllResult({ type: "error", text: "Errore durante l'operazione" }),
  });
  const [distributeResult, setDistributeResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const distributeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/fake-users/distribute-to-clubs", {}),
    onSuccess: (data: any) => {
      setDistributeResult({ type: "success", text: `${data?.count ?? "?"} utenti fake distribuiti nei motoclub` });
    },
    onError: () => setDistributeResult({ type: "error", text: "Errore durante la distribuzione" }),
  });
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
        setMassSeedError(data.message || "Impossibile avviare");
        return;
      }
      setMassSeedRunning(true);
      setMassSeedCreated(0);
      setMassSeedTotal(2420);
      pollRef.current = setInterval(pollStatus, 3000);
    } catch (e: any) {
      setMassSeedError(e.message || "Errore di rete");
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
    setFormCountry("IT");
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
    setShowCountryPicker(false);
    setShowRegionPicker(false);
  };

  useEffect(() => {
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [filter]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleDelete = (id: string, nickname: string) => {
    setDeleteSingleTarget({ id, nickname });
  };

  const handleDeleteAll = () => {
    if (totalCount === 0) return;
    setDeleteAllResultMsg(null);
    setDeleteAllConfirmVisible(true);
  };

  const handleViewChat = async (userId: string) => {
    setSelectedUserId(userId);
    setSelectedConvId(null);
    setChatMessages([]);
    setLoadingChat(true);
    setChatModalVisible(true);
    try {
      const url = new URL(`/api/admin/fake-users/${userId}/conversations`, getApiUrl()).toString();
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
      const url = new URL(`/api/admin/fake-users/conversations/${convId}/messages`, getApiUrl()).toString();
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

  const handleDeleteAllFakeChats = async () => {
    Alert.alert(
      "Elimina tutte le chat fake",
      "Eliminare TUTTE le conversazioni di TUTTI gli utenti fake? L'operazione non è reversibile.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina tutto",
          style: "destructive",
          onPress: async () => {
            setDeletingAllChats(true);
            setDeleteAllChatsResult(null);
            try {
              const url = new URL("/api/admin/fake-users/all-conversations", getApiUrl()).toString();
              const res = await fetch(url, { method: "DELETE", credentials: "include" });
              const data = await res.json();
              if (res.ok) {
                setDeleteAllChatsResult({ type: "success", text: `✓ ${data.deleted} conversazioni eliminate` });
              } else {
                setDeleteAllChatsResult({ type: "error", text: data.message || "Errore durante l'eliminazione" });
              }
            } catch (e) {
              setDeleteAllChatsResult({ type: "error", text: "Errore di rete" });
            }
            setDeletingAllChats(false);
          },
        },
      ]
    );
  };

  const handleDeleteFakeChats = async () => {
    if (!selectedUserId) return;
    Alert.alert(
      "Elimina Chat Fake",
      "Eliminare tutte le conversazioni di questo utente fake? L'operazione non è reversibile.",
      [
        { text: "Annulla", style: "cancel" },
        {
          text: "Elimina",
          style: "destructive",
          onPress: async () => {
            setDeletingChats(true);
            try {
              const url = new URL(`/api/admin/fake-users/${selectedUserId}/conversations`, getApiUrl()).toString();
              const res = await fetch(url, { method: "DELETE", credentials: "include" });
              if (res.ok) {
                setConversations([]);
              }
            } catch (e) {}
            setDeletingChats(false);
          },
        },
      ]
    );
  };

  const handleCreate = () => {
    const data: any = {
      userType: formType,
      sex: formSex,
      nickname: formNickname,
      country: formCountry,
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
      <FlatList
        ref={flatListRef}
        data={users}
        keyExtractor={(item) => item.id}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 80 }]}
        renderItem={({ item: user }) => (
          <View style={styles.userCard}>
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
        )}
        ListFooterComponent={
          <View>
            {isFetchingNextPage && <ActivityIndicator color={Colors.accent} style={{ marginVertical: 16 }} />}
            {!isLoading && !isFetchingNextPage && users.length === 0 && (
              <Text style={styles.emptyText}>Nessun utente fake trovato</Text>
            )}
            {users.length > 0 && !isFetchingNextPage && (
              <Text style={styles.paginationInfo}>Visualizzati {users.length} / {totalCount}</Text>
            )}
          </View>
        }
        ListHeaderComponent={
          <View>
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
          {!!usersError && (
            <Text style={[styles.controlDesc, { color: Colors.error ?? "#e53935" }]}>
              {(usersError as Error).message}
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

          <TouchableOpacity
            style={[styles.deleteAllBtn, { backgroundColor: "#c62828", marginTop: 12 }, deletingAllChats && { opacity: 0.7 }]}
            onPress={handleDeleteAllFakeChats}
            disabled={deletingAllChats}
            activeOpacity={0.7}
          >
            {deletingAllChats ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.deleteAllBtnText}>Eliminazione in corso...</Text>
              </View>
            ) : (
              <>
                <Ionicons name="chatbubbles" size={18} color="#fff" />
                <Text style={styles.deleteAllBtnText}>Elimina tutte le chat fake</Text>
              </>
            )}
          </TouchableOpacity>
          {!!deleteAllChatsResult && (
            <Text style={[styles.controlDesc, { color: deleteAllChatsResult.type === "success" ? Colors.success : (Colors.error ?? "#e53935"), marginTop: 8, fontWeight: "600" as const }]}>
              {deleteAllChatsResult.text}
            </Text>
          )}

          <View style={[styles.controlDivider]} />

          <TouchableOpacity
            style={[styles.deleteAllBtn, deleteAllMutation.isPending && { opacity: 0.7 }]}
            onPress={handleDeleteAll}
            disabled={deleteAllMutation.isPending || totalCount === 0}
            activeOpacity={0.7}
          >
            {deleteAllMutation.isPending ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.deleteAllBtnText}>Eliminazione in corso...</Text>
              </View>
            ) : (
              <>
                <Ionicons name="trash" size={18} color="#fff" />
                <Text style={styles.deleteAllBtnText}>Elimina tutti ({totalCount})</Text>
              </>
            )}
          </TouchableOpacity>

          {!!deleteAllResultMsg && (
            <Text style={[styles.controlDesc, { color: deleteAllResultMsg.type === "success" ? Colors.success : (Colors.error ?? "#e53935"), marginTop: 8, fontWeight: "600" as const }]}>
              {deleteAllResultMsg.text}
            </Text>
          )}
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

          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, gap: 8 }}>
            <Text style={[styles.massSeedDesc, { marginBottom: 0 }]}>
              Porta tutti gli utenti fake online aggiornando l'ultima sessione a adesso.
            </Text>
            {!!wakeAllResult && (
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: wakeAllResult.type === "success" ? Colors.success : Colors.error }}>
                {wakeAllResult.text}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.massSeedBtn, { backgroundColor: "#2196F3" }, wakeAllMutation.isPending && styles.massSeedBtnDisabled]}
              onPress={() => { setWakeAllResult(null); wakeAllMutation.mutate(); }}
              disabled={wakeAllMutation.isPending}
              activeOpacity={0.7}
            >
              {wakeAllMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="radio-button-on" size={18} color="#fff" />
                  <Text style={[styles.massSeedBtnText, { color: "#fff" }]}>Porta tutti online</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12, gap: 8 }}>
            <Text style={[styles.massSeedDesc, { marginBottom: 0 }]}>
              Distribuisce i fake user esistenti nei motoclub approvati (1-3 club casuali per utente).
            </Text>
            {!!distributeResult && (
              <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: distributeResult.type === "success" ? Colors.success : Colors.error }}>
                {distributeResult.text}
              </Text>
            )}
            <TouchableOpacity
              style={[styles.massSeedBtn, { backgroundColor: "#4CAF50" }, distributeMutation.isPending && styles.massSeedBtnDisabled]}
              onPress={() => { setDistributeResult(null); distributeMutation.mutate(); }}
              disabled={distributeMutation.isPending}
              activeOpacity={0.7}
            >
              {distributeMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="people" size={18} color="#fff" />
                  <Text style={[styles.massSeedBtnText, { color: "#fff" }]}>Distribuisci nei motoclub</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{pageStats.total}</Text>
            <Text style={styles.summaryLabel}>Totale</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{pageStats.biker}</Text>
            <Text style={styles.summaryLabel}>Biker</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{pageStats.zavorrina}</Text>
            <Text style={styles.summaryLabel}>Zavorrine</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryCount}>{pageStats.coppia}</Text>
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
          </View>
        }
      />

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
              <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                {!selectedConvId && conversations.length > 0 && (
                  <TouchableOpacity onPress={handleDeleteFakeChats} disabled={deletingChats}>
                    {deletingChats
                      ? <ActivityIndicator size="small" color="#e53935" />
                      : <Ionicons name="trash" size={22} color="#e53935" />}
                  </TouchableOpacity>
                )}
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

              <Text style={styles.fieldLabel}>Paese</Text>
              <TouchableOpacity style={styles.input} onPress={() => { setShowCountryPicker(!showCountryPicker); setShowRegionPicker(false); }}>
                <Text style={styles.inputText}>{COUNTRIES_DATA.find(c => c.code === formCountry)?.name ?? formCountry}</Text>
              </TouchableOpacity>
              {!!showCountryPicker && (
                <View style={styles.pickerList}>
                  {COUNTRIES_DATA.map((c) => (
                    <TouchableOpacity
                      key={c.code}
                      style={[styles.pickerItem, formCountry === c.code && styles.pickerItemActive]}
                      onPress={() => {
                        setFormCountry(c.code);
                        const firstRegion = c.regions[0] ?? "";
                        setFormRegion(firstRegion);
                        setShowCountryPicker(false);
                      }}
                    >
                      <Text style={[styles.pickerItemText, formCountry === c.code && styles.pickerItemTextActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Regione</Text>
              <TouchableOpacity style={styles.input} onPress={() => { setShowRegionPicker(!showRegionPicker); setShowCountryPicker(false); }}>
                <Text style={styles.inputText}>{formRegion || "— nessuna —"}</Text>
              </TouchableOpacity>
              {!!showRegionPicker && (
                <ScrollView style={styles.pickerList} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                  {getRegionsForCountry(formCountry).map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.pickerItem, formRegion === r && styles.pickerItemActive]}
                      onPress={() => { setFormRegion(r); setShowRegionPicker(false); }}
                    >
                      <Text style={[styles.pickerItemText, formRegion === r && styles.pickerItemTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
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
              onChangeText={(v) => { setTogglePwdInput(v); setTogglePwdError(null); }}
              autoFocus
            />
            {!!togglePwdError && (
              <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.error ?? "#e53935", marginTop: 6 }}>
                {togglePwdError}
              </Text>
            )}
            <View style={styles.pwdModalButtons}>
              <TouchableOpacity
                style={[styles.pwdBtn, styles.pwdBtnCancel]}
                onPress={() => { setTogglePwdVisible(false); setTogglePwdInput(""); setTogglePwdError(null); }}
              >
                <Text style={styles.pwdBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.pwdBtn, styles.pwdBtnConfirm]}
                disabled={!togglePwdInput || toggleAllMutation.isPending}
                onPress={() => {
                  if (pendingToggleVal === null) return;
                  toggleAllMutation.mutate(
                    { enabled: pendingToggleVal, adminPassword: togglePwdInput },
                    {
                      onSuccess: () => {
                        setTogglePwdVisible(false);
                        setTogglePwdInput("");
                        setTogglePwdError(null);
                      },
                      onError: (err: Error) => {
                        setTogglePwdInput("");
                        setTogglePwdError(err.message || "Password non corretta.");
                      },
                    }
                  );
                }}
              >
                {toggleAllMutation.isPending ? (
                  <ActivityIndicator color={Colors.background} size="small" />
                ) : (
                  <Text style={styles.pwdBtnText}>Conferma</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={deleteAllConfirmVisible} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmBox}>
            <Ionicons name="warning" size={36} color={Colors.error} style={{ marginBottom: 12 }} />
            <Text style={styles.confirmTitle}>Elimina tutti gli utenti fake?</Text>
            <Text style={styles.confirmDesc}>Questa azione elimina permanentemente tutti i {totalCount} utenti fake e non può essere annullata.</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={[styles.confirmCancelBtn, deleteAllMutation.isPending && { opacity: 0.4 }]}
                onPress={() => setDeleteAllConfirmVisible(false)}
                disabled={deleteAllMutation.isPending}
              >
                <Text style={styles.confirmCancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, deleteAllMutation.isPending && { opacity: 0.6 }]}
                disabled={deleteAllMutation.isPending}
                onPress={() => {
                  deleteAllMutation.mutate(undefined, {
                    onSettled: () => setDeleteAllConfirmVisible(false),
                  });
                }}
              >
                {deleteAllMutation.isPending ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.confirmDeleteBtnText}>Eliminazione...</Text>
                  </View>
                ) : (
                  <Text style={styles.confirmDeleteBtnText}>Elimina tutti</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!deleteSingleTarget} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmBox}>
            <Ionicons name="trash" size={36} color={Colors.error} style={{ marginBottom: 12 }} />
            <Text style={styles.confirmTitle}>Elimina utente?</Text>
            <Text style={styles.confirmDesc}>Eliminare definitivamente "{deleteSingleTarget?.nickname}"?</Text>
            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={() => setDeleteSingleTarget(null)}>
                <Text style={styles.confirmCancelBtnText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.confirmDeleteBtn, deleteMutation.isPending && { opacity: 0.6 }]}
                disabled={deleteMutation.isPending}
                onPress={() => {
                  if (deleteSingleTarget) {
                    deleteMutation.mutate(deleteSingleTarget.id);
                    setDeleteSingleTarget(null);
                  }
                }}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmDeleteBtnText}>Elimina</Text>
                )}
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
  paginationInfo: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    marginVertical: 12,
  },
  confirmBox: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 24,
    margin: 32,
    alignItems: "center",
  },
  confirmTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  confirmDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginBottom: 20,
  },
  confirmBtns: {
    flexDirection: "row",
    gap: 12,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.border,
    alignItems: "center",
  },
  confirmCancelBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: Colors.text,
  },
  confirmDeleteBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.error,
    alignItems: "center",
  },
  confirmDeleteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
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
    backgroundColor: Colors.surface,
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

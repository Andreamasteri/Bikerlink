import React, { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  Pressable,
  Platform,
  useWindowDimensions,
  ListRenderItemInfo,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { getApiUrl } from "@/lib/query-client";
import { trackEvent } from "@/lib/analytics";

const ONBOARDING_BASE = `${getApiUrl()}/api/assets/onboarding/`;

export interface OnboardingSlide {
  id: string;
  image: { uri: string };
  section: string;
  title: string;
  description: string;
}

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: "01",
    image: { uri: ONBOARDING_BASE + "01-posizione-fake-intro.png" },
    section: "Posizione Fake",
    title: "Proteggi la tua privacy",
    description: "Con la posizione fake puoi mostrarti sulla mappa senza rivelare dove sei davvero.",
  },
  {
    id: "02",
    image: { uri: ONBOARDING_BASE + "02-posizione-fake-attivazione.png" },
    section: "Posizione Fake",
    title: "Attivazione facile",
    description: "Attiva la posizione fake direttamente dal menu profilo in un tap.",
  },
  {
    id: "03",
    image: { uri: ONBOARDING_BASE + "03-posizione-fake-quando.png" },
    section: "Posizione Fake",
    title: "Quando usarla",
    description: "Ideale quando sei a casa, in città o vuoi restare visibile senza esporti.",
  },
  {
    id: "04",
    image: { uri: ONBOARDING_BASE + "04-posizione-fake-privacy.png" },
    section: "Posizione Fake",
    title: "Privacy garantita",
    description: "Gli altri biker ti vedranno in posizione approssimativa, non quella reale.",
  },
  {
    id: "05",
    image: { uri: ONBOARDING_BASE + "05-garage-intro.png" },
    section: "Garage",
    title: "Il tuo garage virtuale",
    description: "Aggiungi le tue moto e gestisci tutta la tua flotta in un unico posto.",
  },
  {
    id: "06",
    image: { uri: ONBOARDING_BASE + "06-garage-inserisci-moto.png" },
    section: "Garage",
    title: "Inserisci la tua moto",
    description: "Marca, modello, anno e foto — il tuo profilo biker diventa completo.",
  },
  {
    id: "07",
    image: { uri: ONBOARDING_BASE + "07-wishlist-intro.png" },
    section: "Garage",
    title: "Wishlist moto",
    description: "Tieni traccia dei modelli che sogni. Condividila con la community.",
  },
  {
    id: "08",
    image: { uri: ONBOARDING_BASE + "08-wishlist-aggiungi.png" },
    section: "Garage",
    title: "Aggiungi alla wishlist",
    description: "Cerca qualsiasi moto e aggiungila alla tua lista dei desideri.",
  },
  {
    id: "09",
    image: { uri: ONBOARDING_BASE + "09-registra-giro-intro.png" },
    section: "Registra Giro",
    title: "Traccia ogni avventura",
    description: "Registra i tuoi giri in moto con traccia GPS, distanza e velocità media.",
  },
  {
    id: "10",
    image: { uri: ONBOARDING_BASE + "10-registra-giro-avvio.png" },
    section: "Registra Giro",
    title: "Avvia la registrazione",
    description: "Premi il tasto di avvio e lascia che BikerLink registri ogni curva.",
  },
  {
    id: "11",
    image: { uri: ONBOARDING_BASE + "11-registra-giro-dati.png" },
    section: "Registra Giro",
    title: "Dati del percorso",
    description: "A fine giro visualizza statistiche dettagliate: km, durata, altimetria.",
  },
  {
    id: "12",
    image: { uri: ONBOARDING_BASE + "12-registra-giro-condividi.png" },
    section: "Registra Giro",
    title: "Condividi il giro",
    description: "Pubblica il tuo percorso nella community e ispira altri biker.",
  },
  {
    id: "13",
    image: { uri: ONBOARDING_BASE + "13-matching-biker-intro.png" },
    section: "Matching Biker",
    title: "Trova il tuo match",
    description: "BikerLink ti abbina con biker compatibili nelle vicinanze.",
  },
  {
    id: "14",
    image: { uri: ONBOARDING_BASE + "14-matching-biker-dati.png" },
    section: "Matching Biker",
    title: "Profilo compatibilità",
    description: "Il sistema analizza stile di guida, moto e disponibilità per trovare il match perfetto.",
  },
  {
    id: "15",
    image: { uri: ONBOARDING_BASE + "15-matching-biker-risultato.png" },
    section: "Matching Biker",
    title: "Vedi i risultati",
    description: "Esplora i profili compatibili e scopri con chi condividi la passione.",
  },
  {
    id: "16",
    image: { uri: ONBOARDING_BASE + "16-matching-biker-profilo.png" },
    section: "Matching Biker",
    title: "Profilo del match",
    description: "Visualizza il profilo completo e contatta il biker direttamente in chat.",
  },
  {
    id: "17",
    image: { uri: ONBOARDING_BASE + "17-matching-musicale-intro.png" },
    section: "Matching Musicale",
    title: "Guida con la tua musica",
    description: "Connetti Last.fm e scopri chi condivide i tuoi gusti musicali.",
  },
  {
    id: "18",
    image: { uri: ONBOARDING_BASE + "18-lastfm-registrazione.png" },
    section: "Matching Musicale",
    title: "Registrati su Last.fm",
    description: "Crea un account Last.fm gratuito per tracciare la musica che ascolti.",
  },
  {
    id: "19",
    image: { uri: ONBOARDING_BASE + "19-lastfm-collegamento.png" },
    section: "Matching Musicale",
    title: "Collega Last.fm",
    description: "Inserisci il tuo username Last.fm nel profilo e il gioco è fatto.",
  },
  {
    id: "20",
    image: { uri: ONBOARDING_BASE + "20-matching-musicale-sblocca.png" },
    section: "Matching Musicale",
    title: "Sblocca il matching musicale",
    description: "Con Last.fm collegato trovi biker con gusti musicali simili ai tuoi.",
  },
  {
    id: "21",
    image: { uri: ONBOARDING_BASE + "21-mappa-live.png" },
    section: "Mappa Live",
    title: "Mappa in tempo reale",
    description: "Vedi tutti i biker attivi in Italia sulla mappa live, aggiornata in tempo reale.",
  },
  {
    id: "22",
    image: { uri: ONBOARDING_BASE + "22-motoclub-intro.png" },
    section: "MotoClub",
    title: "Entra in un MotoClub",
    description: "Unisciti a club di biker, organizza uscite di gruppo e crea la tua community.",
  },
  {
    id: "23",
    image: { uri: ONBOARDING_BASE + "23-motoclub-unisciti.png" },
    section: "MotoClub",
    title: "Unisciti al club",
    description: "Cerca il club più vicino a te o creane uno per i tuoi amici.",
  },
  {
    id: "24",
    image: { uri: ONBOARDING_BASE + "24-sos-emergenza.png" },
    section: "SOS Emergenza",
    title: "SOS stradale",
    description: "In caso di guasto o incidente, invia un SOS con la tua posizione GPS.",
  },
  {
    id: "25",
    image: { uri: ONBOARDING_BASE + "25-chat-biker.png" },
    section: "Chat",
    title: "Chatta con i biker",
    description: "Messaggi privati e chat di gruppo per restare sempre connesso.",
  },
  {
    id: "26",
    image: { uri: ONBOARDING_BASE + "26-profilo-biker.png" },
    section: "Profilo",
    title: "Il tuo profilo biker",
    description: "Personalizza il profilo con foto, bio e tutte le tue moto.",
  },
  {
    id: "27",
    image: { uri: ONBOARDING_BASE + "27-notifiche-push.png" },
    section: "Notifiche",
    title: "Notifiche push",
    description: "Ricevi notifiche per nuovi match, messaggi e attività del tuo club.",
  },
  {
    id: "28",
    image: { uri: ONBOARDING_BASE + "28-hashtag-chat.png" },
    section: "Chat",
    title: "Hashtag nelle chat",
    description: "Usa gli hashtag per categorizzare i messaggi e trovare conversazioni simili.",
  },
  {
    id: "29",
    image: { uri: ONBOARDING_BASE + "29-codici-invito.png" },
    section: "Inviti",
    title: "Codici invito",
    description: "Invita i tuoi amici biker con un codice esclusivo e guadagna badge.",
  },
  {
    id: "30",
    image: { uri: ONBOARDING_BASE + "30-bikerlink-benvenuto.png" },
    section: "Benvenuto",
    title: "Benvenuto in BikerLink",
    description: "Riders from all across the globe ti aspettano. Pronto a partire?",
  },
];

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

export default function OnboardingCarousel({ onComplete, onSkip }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<OnboardingSlide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const total = ONBOARDING_SLIDES.length;

  useEffect(() => {
    trackEvent("onboarding_started", { totalSlides: total });
  }, [total]);

  const topPad = insets.top;
  const bottomPad = insets.bottom;

  const isFirst = activeIndex === 0;
  const isLast = activeIndex === total - 1;

  const scrollToIndex = useCallback((index: number) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  }, []);

  const handleNext = useCallback(() => {
    if (isLast) {
      trackEvent("onboarding_carousel_completed", {
        action: "complete",
        reachedIndex: activeIndex,
        totalSlides: total,
      });
      onComplete();
    } else {
      scrollToIndex(activeIndex + 1);
    }
  }, [isLast, activeIndex, total, onComplete, scrollToIndex]);

  const handleSkip = useCallback(() => {
    trackEvent("onboarding_carousel_completed", {
      action: "skip",
      reachedIndex: activeIndex,
      totalSlides: total,
    });
    onSkip();
  }, [activeIndex, total, onSkip]);

  const handleBack = useCallback(() => {
    if (!isFirst) {
      scrollToIndex(activeIndex - 1);
    }
  }, [isFirst, activeIndex, scrollToIndex]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setActiveIndex(viewableItems[0].index);
      }
    }
  ).current;

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<OnboardingSlide>) => (
      <View style={[styles.slide, { width, height }]}>
        <Image
          source={item.image}
          style={[styles.image, { width, height }]}
          resizeMode="cover"
        />
        <View style={[styles.slideOverlay, { paddingBottom: bottomPad + 120 }]}>
          <View style={styles.sectionBadge}>
            <Text style={styles.sectionText}>{item.section}</Text>
          </View>
          <Text style={styles.slideTitle}>{item.title}</Text>
          <Text style={styles.slideDesc}>{item.description}</Text>
        </View>
      </View>
    ),
    [width, height, bottomPad]
  );

  const dotsVisible = Math.min(total, 7);
  const dotsOffset = Math.max(0, activeIndex - Math.floor(dotsVisible / 2));
  const dotsEnd = Math.min(total, dotsOffset + dotsVisible);

  return (
    <View style={[styles.container, { width, height }]}>
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_SLIDES}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        initialNumToRender={2}
        maxToRenderPerBatch={3}
        windowSize={5}
      />

      <View style={[styles.header, { paddingTop: topPad + 8, paddingHorizontal: 20 }]}>
        {!isFirst ? (
          <Pressable style={styles.headerBtn} onPress={handleBack} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </Pressable>
        ) : (
          <View style={styles.headerBtnPlaceholder} />
        )}

        <View style={styles.progressContainer}>
          <Text style={styles.progressText}>
            {activeIndex + 1} / {total}
          </Text>
        </View>

        <Pressable style={styles.headerBtn} onPress={handleSkip} hitSlop={12}>
          <Text style={styles.skipText}>Salta</Text>
        </Pressable>
      </View>

      <View style={[styles.footer, { paddingBottom: bottomPad + 16, paddingHorizontal: 24 }]}>
        <View style={styles.dotsRow}>
          {Array.from({ length: dotsEnd - dotsOffset }).map((_, i) => {
            const realIndex = dotsOffset + i;
            const isActive = realIndex === activeIndex;
            return (
              <Pressable
                key={realIndex}
                onPress={() => scrollToIndex(realIndex)}
                hitSlop={8}
              >
                <View
                  style={[
                    styles.dot,
                    isActive ? styles.dotActive : styles.dotInactive,
                  ]}
                />
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[styles.nextBtn, isLast && styles.nextBtnLast]}
          onPress={handleNext}
        >
          {isLast ? (
            <Text style={styles.nextBtnText}>Inizia l'avventura 🏍️</Text>
          ) : (
            <View style={styles.nextBtnRow}>
              <Text style={styles.nextBtnText}>Avanti</Text>
              <Ionicons name="arrow-forward" size={18} color={Colors.background} style={{ marginLeft: 6 }} />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

import { styles } from "./OnboardingCarousel.styles";

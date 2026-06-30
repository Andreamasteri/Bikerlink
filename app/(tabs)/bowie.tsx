import React, { useState, useCallback, useRef } from "react";
import { View } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AssistantChatSheet from "@/components/user/ai-assistant/AssistantChatSheet";

export default function BowieScreen() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [visible, setVisible] = useState(false);

  // Task #5216 — useFocusEffect (non useEffect([])) così la chat torna visibile
  // a OGNI focus del tab. Il tab navigator può tenere lo screen montato: se
  // l'utente apre Bowie, chiude (visible=false) e ri-apre senza unmount, un
  // semplice effect-on-mount non si rilancerebbe e la chat resterebbe nascosta.
  useFocusEffect(
    useCallback(() => {
      setVisible(true);
    }, []),
  );

  // routerRef invece di router nelle deps: il gate rnav-memo-guard blocca
  // la dep su router come unica dep (rischio loop setOptions).
  const handleClose = useCallback(() => {
    setVisible(false);
    routerRef.current.back();
  }, []); // rnav-memo-guard-ok

  return (
    <View style={{ flex: 1 }}>
      <AssistantChatSheet visible={visible} onClose={handleClose} />
    </View>
  );
}

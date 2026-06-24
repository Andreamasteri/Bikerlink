/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback } from "react";
import { useRouter } from "expo-router";
import { InteractiveMapHandle } from "@/components/InteractiveMap";

export function useHomeMapInteractions(mapRef: React.RefObject<InteractiveMapHandle>, setLastSmallMapCenter: any, handleUserPress: any, handleFocusAnimation: any, setFocusToast: any, focusToastAnim: any, focusMap: any) {
  const router = useRouter();

  const handleSearchResultPress = useCallback((u: any) => {
    router.push(`/profile/${u.id}` as never);
  // check-router-in-effect-deps: safe — router.push chiamato da press utente, non da useEffect
  }, [router]);

  const handleLocateUser = useCallback((u: any) => {
    const lat = Number(u.latitude);
    const lng = Number(u.longitude);
    setLastSmallMapCenter({ latitude: lat, longitude: lng });
    setTimeout(() => {
      focusMap(mapRef, lat, lng, String(u.id));
      handleUserPress({ id: u.id, nickname: u.nickname, userType: u.userType, latitude: lat, longitude: lng });
      if (u.nickname) {
        handleFocusAnimation(u.nickname, setFocusToast, focusToastAnim);
      }
    }, 300);
  }, [handleUserPress, focusToastAnim, focusMap, handleFocusAnimation, mapRef, setFocusToast, setLastSmallMapCenter]);

  return { handleSearchResultPress, handleLocateUser };
}

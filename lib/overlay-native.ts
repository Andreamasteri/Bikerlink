import { NativeModules, Platform } from "react-native";

const { BikerLinkOverlay } = NativeModules;

const isSupported = Platform.OS === "android" && !!BikerLinkOverlay;

export const OverlayNative = {
  checkPermission: (): Promise<boolean> => {
    if (!isSupported) return Promise.resolve(false);
    return BikerLinkOverlay.checkPermission();
  },

  requestPermission: (): void => {
    if (!isSupported) return;
    BikerLinkOverlay.requestPermission();
  },

  showOverlay: (badgeChat: number, badgeNotif: number): void => {
    if (!isSupported) return;
    BikerLinkOverlay.showOverlay(badgeChat, badgeNotif);
  },

  hideOverlay: (): void => {
    if (!isSupported) return;
    BikerLinkOverlay.hideOverlay();
  },

  updateBadges: (badgeChat: number, badgeNotif: number): void => {
    if (!isSupported) return;
    BikerLinkOverlay.updateBadges(badgeChat, badgeNotif);
  },
};

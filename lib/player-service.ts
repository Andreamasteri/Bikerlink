import { Platform } from "react-native";

export async function setupPlaybackService() {
  if (Platform.OS === "web") return;
  try {
    const TrackPlayer = (await import("react-native-track-player")).default;
    const { Event } = await import("react-native-track-player");

    TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
    TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
    TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
    TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
    TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  } catch {}
}

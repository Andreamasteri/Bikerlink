/**
 * BikerLink — Playback Service per react-native-track-player
 *
 * Registrato con TrackPlayer.registerPlaybackService() in player-context.tsx
 * PRIMA di TrackPlayer.setupPlayer(). Gestisce i controlli remoti (lockscreen,
 * notification bar, cuffiette) nella build nativa Android/iOS.
 *
 * Usa import dinamico per compatibilità Expo Go / web (graceful degradation).
 */

export const PlaybackService = async function () {
  try {
    const { default: TrackPlayer, Event } = await import(
      "react-native-track-player"
    );

    TrackPlayer.addEventListener(Event.RemotePlay, () => {
      TrackPlayer.play();
    });

    TrackPlayer.addEventListener(Event.RemotePause, () => {
      TrackPlayer.pause();
    });

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
      TrackPlayer.stop();
    });

    TrackPlayer.addEventListener(Event.RemoteNext, () => {
      TrackPlayer.skipToNext();
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
      TrackPlayer.skipToPrevious();
    });

    TrackPlayer.addEventListener(
      Event.RemoteSeek,
      (event: { position: number }) => {
        TrackPlayer.seekTo(event.position);
      }
    );

    TrackPlayer.addEventListener(
      Event.RemoteDuck,
      (event: { permanent: boolean; paused: boolean }) => {
        if (event.permanent) {
          TrackPlayer.stop();
        } else if (event.paused) {
          TrackPlayer.pause();
        } else {
          TrackPlayer.play();
        }
      }
    );
  } catch {
    // Graceful degradation: RNTP non disponibile (Expo Go, web)
  }
};

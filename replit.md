# BikerLink

## Overview
BikerLink is a React Native (Expo SDK 55) mobile application designed to connect motorcyclists ("biker") and passengers ("zavorrine") across Italy, with a vision to expand Pan-European. The application aims to foster a community for motorcycle enthusiasts, enabling them to find riding partners, organize group rides, and share experiences. The tagline, "U'll never ride alone," encapsulates its core mission. Sponsored by Syneco Lubrificanti, BikerLink also integrates advertising and services relevant to its user base, such as Syneco workshops. The project seeks to create a dynamic platform for the motorcycle community, offering interactive maps, social features, and essential tools for riders.

## User Preferences
I prefer detailed explanations and iterative development. Ask before making major changes. Do not make changes to folder `node_modules`. Do not make changes to file `package-lock.json`.

## NOTA CRITICA — Dispositivo utente
**L'utente usa ANDROID** come dispositivo principale di test. Tutte le funzionalità devono essere verificate su Android prima di tutto. iOS è secondario. Non assumere mai che qualcosa funzioni "su iOS quindi funzionerà su Android" — testare sempre il contrario.

## System Architecture
BikerLink utilizes a modern full-stack architecture.

**Frontend:**
- Developed with Expo SDK 55 (React Native 0.83.4) for cross-platform compatibility.
- Navigation is handled by Expo Router, leveraging file-based routing.
- State management relies on `@tanstack/react-query` for data fetching and caching, complemented by React Context for global state.
- Internationalization supports 5 languages (IT/EN/DE/ES/FR) via `lib/i18n.ts` and `lib/language-context.tsx`.
- The UI/UX features a dark theme by default (background `#0D0D0D`, accent `#FF6600`) and includes custom icons like a Shark Carbon helmet for SOS.
- **Brand Theme Switcher**: Admin panel includes a 4-theme selector ("Attuale", "Asfalto Caldo", "Velocità Pura", "Rotta Libera"). Themes are defined in `constants/colors.ts` (`THEMES`), managed via `ThemeProvider` in `lib/theme-context.tsx`, persisted in AsyncStorage. Components use `useColors()` from `hooks/useColors.ts` to receive dynamic colors.
- Interactive maps are implemented using `react-native-maps`, with web-specific components (`.web.tsx`) providing alternative UIs where native map features are not available.
- Features include user profiles (Biker, Zavorrina/Zavorrino, Coppia), interactive maps displaying users, Syneco workshops, and collectible easter eggs.
- Users can create and respond to ride proposals, engage in private and group chats, and track GPS routes with performance statistics.
- A photo contest system allows users to upload and vote on photos.
- User-specific features include a "Garage" for bikers to list motorcycles and a "Wishlist" for passengers to specify desired rides.
- Automatic matching connects compatible bikers and passengers based on preferences and location.
- "Ready to Ride" functionality indicates user availability.
- Custom routes can be created with multiple waypoints.
- Advertisement banners are integrated with targeting capabilities.
- GDPR compliance is addressed with data export, consent tracking, and account deletion requests.
- Over-the-air (OTA) updates are supported for seamless app versioning.

**Backend:**
- Built with Express 5 and TypeScript, running on port 5000.
- PostgreSQL is used as the database, managed with Drizzle ORM.
- Replit Object Storage is utilized for user photos and backup services.
- The API provides endpoints for authentication, user management, motorcycle CRUD, ride proposals, chat, emergency SOS, GPS tracking, photo contests, Syneco workshops, advertising, notifications, reports, and administrative functions.
- A robust admin panel offers user management, content moderation, analytics, and system settings.
- A moderation panel handles photo approvals.
- A matching engine runs periodically to connect users based on defined criteria.
- Fake user generation is implemented for testing and initial user base simulation, with admin controls for management.
- Email services are handled via Nodemailer with Gmail SMTP.
- **OnlineTracker** (`server/online-tracker.ts`): In-memory singleton that tracks active sessions in real-time. Counter endpoints (`online-count`, `biker-available-count`, `zavorrine-available-count`) read directly from this tracker (zero DB queries). Updated on login, logout, availability toggle, ghost-mode toggle, heartbeat, and every authenticated API request (middleware in `server/routes.ts`). Stale sessions auto-expire after 15 minutes via a cleanup interval. On server restart, sessions are re-registered transparently from the first API call.

**Core Features:**
- **Interactive Maps**: Display users, workshops, and easter eggs.
- **Proposals & Requests**: Facilitate ride organization with group chat.
- **Chat System**: Private and group messaging with phone number filtering.
- **GPS Tracking**: Records ride statistics.
- **Photo Contest**: Weekly contest with voting.
- **Syneco Integration**: Workshop locator and advertising.
- **Collectible Easter Eggs**: Geolocation-based hidden items.
- **Admin & Moderation Panels**: Comprehensive tools for platform management.
- **Automatic Matching**: Connects users based on profiles and preferences.
- **User Favorites**: Users can mark other users as favorites via a star icon next to nicknames. Favorites are persisted in `user_favorites` table. FavoriteStar component (`components/FavoriteStar.tsx`) shown in all user lists. Primal star is red (#FF3B30), favorite star is yellow (#FFD700) when active, white outline when inactive.
- **Custom Routes**: Allows users to create and share personalized routes.
- **Advertisement System**: Targeted ad delivery.
- **User Types**: Biker, Zavorrina/Zavorrino, Coppia with distinct functionalities.
- **Multilingual Support**: IT, EN, DE, ES, FR.
- **Player Musicale in-app** (SDK 55 cycle): `lib/player-context.tsx` (PlayerProvider con **expo-av** Audio.Sound, sleep timer, preferiti AsyncStorage). `components/MiniPlayer.tsx` (barra persistente + modal fullscreen con griglia generi radio). Backend: `server/routes/radio.ts` — `/api/music/genres`, `/stations/:genre` (Radio Browser API), `/preview` + `/preview-playlist` (iTunes Search API), `/suggested-genres`. Pulsante anteprima 30s nelle SharedPlaylistCard in music.tsx. **expo-av@16.0.8** + `expo-media-library`. UIBackgroundModes["audio"] e permessi READ_MEDIA_AUDIO/FOREGROUND_SERVICE in app.json. NOTA: RNTP rimosso (incompatibile New Arch RN 0.83.4).
- **Spotify Music Integration** (Task #440/#441): OAuth connection to Spotify, syncs user's top tracks and recently played songs. Music Match feature finds bikers with common music taste. Playlist sharing via chat messages. Backend: `server/routes/spotify.ts` (9 endpoints: callback, disconnect, sync, status, my-tracks, share-playlist, shared-playlists, merge-playlist, match/music). DB tables: `user_spotify_tokens` (AES-256-CBC encrypted tokens), `user_music_tracks`, `shared_playlists`. messages table has new `playlist_id` column. Requires Secrets: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `EXPO_PUBLIC_SPOTIFY_CLIENT_ID`. Redirect URIs to register: `bikerlink://spotify-callback` and `https://biker-link.replit.app/api/spotify/callback`.

**Deployment & Operations:**
- Development workflow includes separate commands for frontend and backend, with watchdog scripts for automatic restarts and error monitoring.
- EAS Build is used for cloud-based Android APK and AAB generation, supporting `preview` and `production` profiles.
- **react-native-reanimated@~4.2.1** (versione corretta SDK 55, bundledNativeModules.json) e **react-native-maps@1.27.2** configurati per compatibilità EAS. NOTA: reanimated 3.x causava CMake build failure con NDK r27b (immagine EAS ubuntu-24.04-jdk-17-ndk-r27b-sdk-55). Android/ rimosso da git — EAS usa managed workflow (expo prebuild automatico).
- OTA updates are managed via custom scripts for seamless deployment of new features.

## Utenti Seed

| Nickname | Email | Ruolo | Password |
|----------|-------|-------|----------|
| admin | admin@bikerlink.it | admin | admin2025! |
| moderatore | mod@bikerlink.it | moderator | mod2025! |
| user1 | user1@bikerlink.it | user | test |

Seed script: `npx tsx server/seed.ts` (idempotente, salta utenti esistenti).
Il seed imposta `emailVerified: true` per tutti gli utenti creati.

## External Dependencies
- **Expo SDK 55** (React Native 0.83.4): Core framework for React Native development.
- **expo-av@16.0.8**: Audio playback (radio streaming, MP3, preview 30s) con background playback. Sostituisce RNTP (incompatibile New Architecture RN 0.83.4).
- **react-native-reanimated@~4.2.1**: Versione corretta per SDK 55 (bundledNativeModules.json). Versioni 3.x causano CMake build failure con NDK r27b su EAS.
- **expo-media-library**: Accesso alla libreria musicale del dispositivo.
- **React Native**: Frontend UI framework.
- **Express 5**: Backend web application framework.
- **TypeScript**: Superset of JavaScript for type safety.
- **PostgreSQL**: Relational database.
- **Drizzle ORM**: Object-Relational Mapper for database interaction.
- **@tanstack/react-query**: Data fetching and caching library for React.
- **Replit Object Storage**: Cloud storage for media files and backups.
- **react-native-maps**: Native map components for React Native.
- **pdfkit**: Library for PDF generation (used in scripts).
- **Zod**: Schema validation library.
- **express-rate-limit**: Middleware for rate limiting API requests.
- **Nodemailer**: Module for sending emails.
- **Gmail SMTP**: Email sending service.
- **eas-cli**: Command-line interface for Expo Application Services builds.
## APK Build — Regola Obbligatoria

**Nessuna build APK può essere avviata senza autorizzazione esplicita dell'utente.**

Usare SEMPRE `scripts/build-apk.sh` — mai `npx eas-cli build` direttamente.

Procedura:
1. Ottenere approvazione esplicita dall'utente ("sì, avvia la build APK")
2. `touch .local/apk-build-authorized`  ← token monouso, viene eliminato dopo l'uso
3. `bash scripts/build-apk.sh [preview|production]`

Lo script blocca l'esecuzione se `.local/apk-build-authorized` non esiste, logga ogni build in `logs/apk-build-history.log`, e richiede un nuovo token per ogni build successiva.

## Dev vs Production JS Engine (Android)
- **SDK 55**: Il campo `jsEngine` è stato rimosso da `app.json` (la configurazione è ora automatica).
- **Build EAS** (preview/production): `eas.json` → `android.jsEngine: "hermes"` — le APK/AAB usano Hermes.
- **Expo Go**: Metro gestisce automaticamente il bundling senza bisogno di configurazione esplicita jsEngine.

## Ciclo APK corrente — v11 (rv 5.0.0)

| Campo | Valore |
|---|---|
| versionCode | 11 |
| version | 1.2.0 |
| runtimeVersion | 5.0.0 |
| EAS Build ID | `6ea14cd7-6eb4-405c-b7e8-45698408d742` |
| EAS Dashboard | https://expo.dev/accounts/andreamasteri/projects/bikerlink/builds/6ea14cd7-6eb4-405c-b7e8-45698408d742 |
| Avviata il | 2026-04-13 |
| Profilo | preview (APK) |
| Cache | --clear-cache |
| Primo OTA del ciclo | OTA-41 (aggiornare CURRENT_OTA_NUMBER = 41 quando si pubblica) |

**Note ciclo 5.x:**
- CURRENT_OTA_NUMBER = 0 in profile.tsx finché non viene pubblicata la prima OTA
- Il registro ota-updates.json resta vuoto per rv=5.0.0 fino alla prima OTA-41
- validate-ota.sh gestisce il ciclo vuoto con la path NEW_CYCLE (exit 0)
- apkBuildId + apkUrl compariranno nella prima entry OTA del ciclo 5.x

**Ciclo precedente:** APK v10 / rv 4.0.0 / OTA-40 (ultima) — apkBuildId `7a08598a-3a00-4169-aed1-b1d4ab6e8e7c`

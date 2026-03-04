# BikerLink

**Tagline**: U'll never ride alone  
**Sponsor**: Syneco lubricants  
**Language**: Italian (UI entirely in Italian)

## Stack
- **Frontend**: React Native / Expo (file-based routing with expo-router)
- **Backend**: Express + TypeScript
- **Database**: PostgreSQL (Drizzle ORM)
- **State Management**: React Query + React Context
- **Styling**: StyleSheet (dark theme)

## Architecture
- `app/` — Expo Router screens (tabs, admin, moderator, feedback, profile, chat, etc.)
- `server/` — Express backend (routes, middleware, storage, websocket)
- `shared/` — Shared schema (Drizzle tables)
- `constants/` — Colors, config
- `lib/` — Query client, auth context, utilities

## Key Features
1. **Auth**: Registration with invitation codes, login, EULA acceptance, session-based
2. **User Profiles**: Biker/Zavorrina types, GPS location, profile photos, phone-number visibility filter
3. **Chat**: Private and group chat with WebSocket, phone-number filter
4. **Route Tracking**: GPS route recording with distance/duration
5. **Photo Contest**: Submit photos, vote, admin publish results
6. **Interactive Map**: OpenStreetMap (web) / react-native-maps (native), with Syneco workshops, nearby user markers
7. **Easter Eggs**: Collectible location-based easter eggs
8. **Feedback System**: Bug reports & feature requests from users → admin panel with badge, admin responses with notifications
9. **Reports**: User-to-user behavior reports → admin only
10. **Admin Panel**: Full CRUD for users, ads, workshops, settings, easter eggs, reports, feedback, analytics, invitation codes, moderator logs
11. **Moderator Role**: Content moderation with action logging
12. **Notifications**: In-app notifications for reports, feedback responses, etc.
13. **Syneco Advertising**: Ad management system
14. **Garage**: Motorcycle management for bikers/couples (type + riding style)
15. **Ready to Ride**: Toggle availability with color-coded tab icon
16. **Proximity Tracking**: Detects pairs of users within 100m for >1h, logs encounters to DB, admin statistics panel
17. **PayPal Donations**: 1/5/10€ donation buttons, admin-configurable PayPal address

## Database Tables
users, user_profiles, user_motorcycles, user_photos, proposals, conversations, conversation_participants, messages, routes, route_points, photo_contest_entries, photo_winners, workshops, easter_eggs, collected_easter_eggs, reports, notifications, ad_campaigns, app_settings, moderator_logs, invitation_codes, feedback_tickets, verification_codes, proximity_sessions, proximity_pairs, session

## API Routes
- `/api/auth/*` — login, register, logout, me, eula
- `/api/users/*` — profiles, search, nearby
- `/api/proposals/*` — ride proposals
- `/api/chat/*` — rooms, messages
- `/api/tracking/*` — GPS routes
- `/api/contest/*` — photo contest
- `/api/workshops/*` — workshop map
- `/api/easter-eggs/*` — easter eggs
- `/api/feedback/*` — user bug reports & feature requests
- `/api/notifications/*` — user notifications
- `/api/reports/*` — user reports
- `/api/ads/*` — Syneco ads
- `/api/garage/*` — motorcycle garage CRUD
- `/api/proximity/*` — proximity check for nearby users
- `/api/settings/*` — public settings (syneco-branding, paypal_donation_address)
- `/api/admin/*` — admin endpoints (users, feedback, reports, settings, proximity-stats, etc.)
- `/api/moderator/*` — moderator endpoints

## Credentials (Dev)
- Admin: admin@bikerlink.it / admin2025! (username: admin)
- Test users: user1-user30 @ userN@test.it / test

## Color Palette
- Background: #0D0D0D
- Surface: #1E1E1E
- Accent (gold): #D4A017
- Male: #4A90D9
- Female: #E91E8C
- Syneco green: #2E7D32
- Error red: #E63946

## Workflows
- `Start Backend`: npm run server:dev (port 5000)
- `Start Frontend`: npm run expo:dev (port 8081)

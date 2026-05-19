# BikerLink Matching System

**Document version:** 1.0 — May 2026  
**Language:** English  
**Audience:** Investors, partners, non-technical team members, new users

---

## 1. Introduction

The **matching system** is the heart of BikerLink. Its purpose is to connect people who share the same passion for motorcycles, based on real affinities: the bike they ride, the way they ride it, the music they listen to, the events they attend, and the routes they take.

A **match** is a pair of users that the system has identified as compatible. When two users match, both receive a notification and can start a private conversation, accept or reject the match, and — in the case of proposals — organize a trip together.

BikerLink does not rely on a single algorithm: it uses **17 distinct match types**, each based on a different criterion. This way, every user has more opportunities to find someone they have something in common with.

---

## 2. Glossary of Roles

| Role | Who they are | What they do on BikerLink |
|------|--------------|---------------------------|
| **Biker** | Someone who owns and rides a motorcycle | Adds their bike to the garage, creates trip proposals, looks for other compatible bikers or zavorrine |
| **Zavorrina** (or Zavorra) | Someone who loves motorcycles but does not own one (passenger) | Adds a wishlist of bikes they would like to ride on, looks for bikers who own those bikes |
| **Club** | A group of motorcyclists registered in the app (e.g. brand club, regional club) | Not a single user but a collective entity: its members are matched with bikers or zavorrine who have an affinity with the club's brand |

> **Cultural note:** The term "Zavorrina" (or "Zavorra", literally "ballast") is the affectionate, ironic name used in the Italian motorcycle community to refer to the passenger. On BikerLink it is an official role, with no negative connotation. In English you can think of it simply as "passenger" or "pillion rider", but we keep the original Italian term throughout the product to honor the community's culture.

> **Additional role — Couple (Coppia):** two people who travel together on the same motorcycle. Internally a couple can match either as a biker or as a zavorrina, depending on the context.

---

## 3. The 17 Match Types

The table below lists all match types active in the system, with the exact criteria used.

| # | Match Type | Roles Involved | Criterion | Data Used | Notes |
|---|-----------|----------------|-----------|-----------|-------|
| 1 | **Motorcycle Brand (BB)** | Biker ↔ Biker | Same motorcycle brand in the garage | `user_motorcycles` table, `brand` field | Supermatch if model + type + riding style also coincide |
| 2 | **Wishlist / Garage (BZ)** | Biker ↔ Zavorrina | The biker's bike brand or type matches the zavorrina's wishlist | `user_motorcycles` and `zavorrina_wishlist_motos` tables | Supermatch if brand + model + type + style coincide |
| 3 | **Club Brand — Biker** | Biker ↔ Club Member | The biker owns a motorcycle of a club's official brand, and is matched with that club's members | `user_motorcycles` and `moto_clubs` tables (`brand_name` field) | The club must be approved by the admin |
| 4 | **Club Brand — Zavorrina** | Zavorrina ↔ Club Member | The zavorrina has a club's official brand on her wishlist, and is matched with that club's members | `zavorrina_wishlist_motos` and `moto_clubs` tables | Same mechanism as #3, zavorrina side |
| 5 | **Type + Riding Style (BB)** | Biker ↔ Biker | Same motorcycle type (e.g. naked, enduro) and same riding style | `user_motorcycles` table, `motorcycle_type` and `riding_style` fields | Both fields must match exactly |
| 6 | **Type + Riding Style (BZ)** | Biker ↔ Zavorrina | The biker's bike type and style match the zavorrina's wishlist preference | `user_motorcycles` and `zavorrina_wishlist_motos` tables | Both fields must be present in the wishlist |
| 7 | **Route Distance (BB)** | Biker ↔ Biker | The geographic centroid of the two bikers' recorded routes is within 150 km | `routes` and `route_points` tables (average GPS centroid) | Also active as a criterion in biker↔biker trip proposals |
| 8 | **Route Distance (BZ)** | Biker ↔ Zavorrina | Same logic as #7, between biker and zavorrina | `routes` and `route_points` tables | Also active as a criterion in biker↔zavorrina proposals |
| 9 | **Music Affinity (BB)** | Biker ↔ Biker | At least 65% of tracks in common relative to the smaller library | `user_music_tracks` table, `lastfm_track_id` field | Requires Last.fm connection on both accounts |
| 10 | **Music Affinity (BZ)** | Biker ↔ Zavorrina | Same logic as #9, between biker and zavorrina | `user_music_tracks` table | Requires Last.fm on both accounts |
| 11 | **Lean Angle (GPS)** | Biker ↔ Biker | Same average lean angle "bucket" (low / medium / high), with at least 3 recorded routes each | `routes` table, `max_tilt_deg` field (averaged across all routes) | Thresholds: low <20°, medium 20–35°, high >35°. If the phone has no gyroscope the field is 0 (low bucket) |
| 12 | **Zone + Route Profile (BB)** | Biker ↔ Biker | GPS centroid within 50 km AND same route profile (curvy / highway / city / mixed) | `routes` and `route_points` tables | Profile computed from: average speed, average lean angle, average distance |
| 13 | **Zone + Route Profile (BZ)** | Biker ↔ Zavorrina | Same logic as #12, between biker and zavorrina | `routes` and `route_points` tables | The zavorrina must have recorded routes |
| 14 | **Average GPS Speed** | Biker ↔ Biker | Same average speed "bucket" (slow / medium / fast) | `routes` table, `avg_speed_kmh` field | Thresholds: slow <50 km/h, medium 50–80, fast >80 |
| 15 | **Average GPS Duration** | Biker ↔ Biker | Same average ride duration "bucket" (short / medium / long) | `routes` table, `duration_seconds` field | Thresholds: short <2h, medium 2–6h, long >6h |
| 16 | **Preferred GPS Time** | Biker ↔ Biker | Same day of the week and time of day (morning / afternoon / evening) | `proposals` table (departure timestamp `scheduled_at` / `departure_time_from`) | Computed on the median of the times of the user's created proposals |
| 17 | **Rally / Event Attendance** | Biker ↔ Biker | Both attended the same rally or event in the app | `event_participants` table | Matches are created between all participants of the same event |

> **Supermatch:** a special match generated when two users meet stricter criteria (e.g. same brand + same model + same type + same style). Supermatches are visually highlighted in the app.

> **Trip proposals:** proposals (e.g. "looking for a companion for Saturday morning") generate an additional type of match called a "proposal match". They are matched automatically between users compatible by role, area, and time window. The `bikerBikerDistance` and `bikerZavarrinaDistance` preferences also control this type of match.

---

## 4. How Distance Is Calculated

BikerLink does not use country or region to decide if two users are close. It uses the **Haversine formula**, which calculates the actual straight-line distance between two GPS points on the Earth's surface.

**In plain words:** imagine drawing a straight line (through the curvature of the Earth) between the positions of two users. Haversine computes that distance in kilometers, with high precision, taking the Earth's spherical shape into account.

**Why it matters:** two users living in Milan and Bergamo are ~45 km apart as the crow flies. With a "same region" logic they would never match because they live in different provinces. With Haversine they are correctly matched.

In route-based match types (# 7, 8, 12, 13), distance is not measured on the user's current position, but on the **geographic centroid** of all recorded routes: the average of the GPS coordinates of all tracked points. This represents the area where the user typically rides.

---

## 5. User Preferences

Every user can **disable individual match types** from the app's settings. This makes it possible, for instance, to receive matches by motorcycle brand but not by music, or vice versa.

**How it works:**
- In the app's "Match Preferences" section, every match type has an on/off switch.
- The default is all enabled.
- If a user disables a match type, they will never appear in matches of that type — neither as sender nor as recipient.
- The block is bidirectional: if even one of the two users has disabled that type, the match is not created.

**When this section is visible:**
- The match preferences section is accessible from the user's profile → Settings → Match Preferences.
- It is shown only after the user has completed their profile (garage or wishlist filled in).

---

## 6. Admin Control

The BikerLink administrator has access to advanced tools to monitor and control the matching system.

### Admin Panel — What is shown

| Function | Description |
|----------|-------------|
| **Match monitoring** | View statistics and logs of created matches (by type, by user pair, with timestamp of the last cycle) |
| **Global matching toggle** | Enable or disable the entire matching engine with a single switch (`auto_matching_enabled`) |
| **Cycle statistics** | Shows date/time of the last matching cycle, duration in seconds, number of matches created per type |
| **Manual trigger** | Launches a matching cycle on-demand without waiting for the automatic one |
| **Enabled countries** | Configures in which countries matching is active (e.g. Italy only) via the `matching_countries` setting |

### Global Toggle

When the global toggle is **OFF**, no matches are created, regardless of individual user preferences. This is useful during maintenance, database upgrades, or to freeze the system in a given state.

---

## 7. Match Types Built but Not Yet Active

Some match types have been designed and implemented in the code, but require data that few users currently have. They will be activated progressively as the user base grows and in-app behavior becomes richer.

### Lean Angle — Gyroscope Sensors (Type #11)

This match compares the average lean angle of the motorcycle on recorded routes. **It requires:**
- At least 3 routes recorded with the phone's gyroscope sensor active
- A phone capable of detecting the lateral axis while riding

**Status:** the code is active, but the match is generated only when both users have enough routes with real lean data. With a small user base or with phones that do not record gyroscope data, this match type stays silent.

**When it will fully activate:** as more users record routes with sensors enabled. No technical action needed — it is already in place.

### Rallies and Events (Type #17)

The rally match pairs all users who attended the same motorcycle event or rally registered in the app. **It requires:**
- Events (rallies) to be created and approved in the app
- Users to sign up for events through the dedicated feature

**Status:** the code is active, but only generates matches if there is a sufficient number of events with attendees. In this early stage, the events feature is operational but lightly used.

**When it will fully activate:** when motorcycle rallies are entered regularly in the app and users start to register their attendance. A dedicated onboarding campaign is planned.

### Music Affinity (Types #9 and #10)

The music match compares songs listened to via **Last.fm**, the music scrobbling platform. **It requires** the user to link their Last.fm account to BikerLink.

**Status:** working, but depends on Last.fm adoption. When the number of users with Last.fm connected is high enough, music matches will become more frequent.

---

## 8. FAQ

**Why don't I have any matches yet?**  
Matches are generated automatically every time a user logs into the app (with a minimum 2-minute interval per user). If you don't have any matches yet, there probably aren't enough compatible users in your area, or your profile is incomplete (missing garage or wishlist).

**Does music matching require Last.fm?**  
Yes. Match types #9 and #10 require you to have linked your Last.fm account in your profile settings. Without Last.fm, these matches are never generated for you, but all other types remain active.

**Can I block someone so I don't receive matches from them anymore?**  
Yes. By blocking a user, no type of match will ever be created between the two of you again. The block is permanent until removed.

**Are trip proposal matches different from the others?**  
Yes. Proposal matches use separate logic: they pair two users who created compatible proposals by role, date, time window, and geographic area. Once accepted by both parties, a chat is automatically opened.

**What does "Supermatch" mean?**  
A Supermatch is generated when compatibility is maximum: same motorcycle brand, same model, same type, and same riding style. It is highlighted in the app with a special icon to signal its quality.

**Does matching work abroad too?**  
It depends on the admin's configuration. By default, matching can be limited to certain countries. If you are in an uncovered country, you may not receive matches until your country is enabled.

**How often does the matching engine run?**  
The engine is triggered every time a user logs into the app, with a minimum of 5 minutes between global cycles. A user receives personalized matches within 2 minutes of connecting.

**What role does a Club play in matching?**  
A Club on BikerLink is often associated with a motorcycle brand (e.g. "Honda Club Rome"). When a biker owns a bike of that brand, they are matched with the club's members — and vice versa for zavorrine who have that brand on their wishlist. The Club is not a user but a catalyst for matches between people with the same motorcycle.

---

<details>
<summary><strong>Technical Appendix</strong> — Details for developers and the technical team</summary>

## Database Tables

| Table | Contents |
|-------|----------|
| `users` | User profile: `user_type` (biker/zavorrina/coppia), `role` (user/admin) |
| `user_motorcycles` | Biker garage: brand, model, motorcycle_type, riding_style |
| `zavorrina_wishlists` | Zavorrina wishlist (container) |
| `zavorrina_wishlist_motos` | Individual wishlist entries: brand, model, motorcycle_type, riding_style |
| `biker_zavorrina_matches` | Biker↔zavorrina matches from wishlist/garage (**only type #2**): bikerId, zavarrinaId, bikerMotorcycleId, wishlistMotoId |
| `biker_biker_matches` | All other matches (types #1, #3–#17): biker↔biker and generic biker↔zavorrina — distinguishable by the `motorcycle_brand` and `pair_type` fields |
| `proposals` | Trip proposals: search_type, departure coords, time window, club_id |
| `proposal_matches` | Matches between compatible proposals |
| `match_preferences` | Match-type preferences, one row per user |
| `routes` | Recorded routes: avg_speed_kmh, max_tilt_deg, duration_seconds |
| `route_points` | GPS points of routes |
| `user_music_tracks` | Last.fm tracks linked to the user: lastfm_track_id, artist_id, genres |
| `event_participants` | Event/rally signups: user_id, event_id |
| `moto_clubs` | Motorcycle clubs: brand_name, is_approved |
| `moto_club_members` | Club members: status (active/pending) |
| `user_blocks` | Blocked pairs: blocker_id, blocked_id |
| `app_settings` | Global settings: `auto_matching_enabled`, `matching_countries`, `fake_users_enabled` |

> **Important:** the `biker_biker_matches` table is used both for biker↔biker pairs (pair_type='bb') and for biker↔zavorrina pairs (pair_type='bz') generated by all matching engines except wishlist/garage (type #2). The distinction is read from the `pair_type` field and the `motorcycle_brand` value.

## Match Types — Internal Keys (`motorcycle_brand` in `biker_biker_matches`)

| `motorcycle_brand` value | Match Type | pair_type |
|--------------------------|------------|-----------|
| `<real brand>` (e.g. "Honda") | Type #1 — Brand BB | bb |
| `tipo:<motorcycle_type>` | Type #5 — Type+Style BB | bb |
| `club:<brand>` | Type #3 — Club Brand Biker | bb |
| `club_zav:<brand>` | Type #4 — Club Brand Zavorrina | bz |
| `tipo_zav:<type>` | Type #6 — Type+Style BZ | bz |
| `musica` | Type #9 — Music BB | bb |
| `musica_zav` | Type #10 — Music BZ | bz |
| `gps_full` | Types #11+#14+#15+#16 combined (GPS Supermatch) | bb |
| `gps_speed` | Types #14+#15 — GPS Speed+Duration | bb |
| `gps_tilt` | Type #11 — Lean angle | bb |
| `gps_day` | Type #16 — Preferred time | bb |
| `zona_bb:<profile>` | Type #12 — Zone+Profile BB | bb |
| `zona_zav:<profile>` | Type #13 — Zone+Profile BZ | bz |
| `distanza` | Type #7 — Route distance BB | bb |
| `distanza_zav` | Type #8 — Route distance BZ | bz |
| `eventi` | Type #17 — Rallies/Events | bb |

## Match Preferences — `match_preferences` Columns

| DB Column | Match Type |
|-----------|------------|
| `biker_biker_brand` | #1 |
| `biker_zavorrina_brand` | #2 |
| `biker_club_brand` | #3 |
| `zavorrina_club_brand` | #4 |
| `biker_biker_type_style` | #5 |
| `biker_zavorrina_type_style` | #6 |
| `biker_biker_distance` | #7 (and BB proposals) |
| `biker_zavorrina_distance` | #8 (and BZ proposals) |
| `biker_biker_music` | #9 |
| `biker_zavorrina_music` | #10 |
| `biker_biker_lean_angle` | #11 |
| `biker_biker_route_type_zone` | #12 |
| `biker_zavorrina_route_type_zone` | #13 |
| `biker_biker_avg_speed` | #14 |
| `biker_biker_avg_duration` | #15 |
| `biker_biker_day_time` | #16 |
| `biker_biker_events` | #17 |
| `direct_match` | Direct proposal match |

## Numeric Thresholds

| Metric | Bucket thresholds |
|--------|-------------------|
| Average GPS speed | slow <50 km/h · medium 50–80 · fast >80 |
| Average ride duration | short <7,200 s (2h) · medium 7,200–21,600 s (2–6h) · long >21,600 s |
| Average lean angle | low <20° · medium 20–35° · high >35° |
| Route profile | curvy (tilt>30°) · highway (speed>100 km/h) · city (dist<30 km) · mixed |
| BB centroid distance threshold | 150 km |
| Zone distance threshold (type+zone) | 50 km |
| Music overlap threshold | 65% relative to the smaller library |
| Default proposal radius | 50 km (configurable per proposal) |

## Main Functions — `server/matching-engine.ts`

| Function | Type |
|----------|------|
| `runMatching()` | Compatible proposals (search_type + zone + time) |
| `runWishlistMatching()` | #2 — Wishlist/Garage → `biker_zavorrina_matches` |
| `runBikerBikerMatching()` | #1 — Brand BB → `biker_biker_matches` |
| `runBikerBikerTypeStyleMatching()` | #5 — Type+Style BB → `biker_biker_matches` |
| `runClubBrandMatching()` | #3 and #4 — Club Brand → `biker_biker_matches` |
| `runMusicMatchBikerZavarrina()` | #9 and #10 — Music → `biker_biker_matches` |
| `runGpsBasedMatching()` | #11, #14, #15, #16 — GPS → `biker_biker_matches` |
| `runEventMatching()` | #17 — Rallies/Events → `biker_biker_matches` |
| `runBikerZavarrinaTypeStyleMatching()` | #6 — Type+Style BZ → `biker_biker_matches` (pair_type='bz') |
| `runDistanceMatching()` | #7 and #8 — Route distance → `biker_biker_matches` |
| `runRouteTypeZoneMatching()` | #12 and #13 — Zone+Profile → `biker_biker_matches` |
| `triggerMatchingRun()` | Global on-demand cycle (5-min debounce) |
| `triggerMatchingForUser(userId)` | Personalized cycle per user (2-min debounce) |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `GET /api/matches` | GET | User's biker↔zavorrina match list (`biker_zavorrina_matches`) |
| `GET /api/biker-biker-matches` | GET | User's biker↔biker match list (and generic bz) |
| `GET /api/proposals/matches` | GET | Matches between the user's trip proposals |
| `GET /api/match/music` | GET | On-demand music matches via Last.fm (`server/routes/music-match.ts`) |
| `GET /api/match-preferences` | GET | Match preferences of the authenticated user |
| `PUT /api/match-preferences` | PUT | Updates match preferences of the authenticated user |
| `POST /api/admin/force-matching` | POST | Starts a manual matching cycle (admin only) |
| `GET /api/admin/matching-stats` | GET | Last cycle statistics: date, duration, per-type counters (admin only) |
| `GET /api/admin/settings/matching_countries` | GET | Reads matching-enabled countries (admin only) |
| `PUT /api/admin/settings/matching_countries` | PUT | Updates matching-enabled countries (admin only) |

</details>

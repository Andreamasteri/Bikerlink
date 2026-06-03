---
name: match-health source-data classification
description: Why /match-health distinguishes NO_DATA/WARN/INACTIVE per match type, and the rule for keeping source probes aligned with matchers.
---

# match-health: 0-match is not always an anomaly

The admin "match health" panel (`GET /api/admin/matching/.../match-health`) historically
flagged every match type with 0 results as an anomaly. On a DB lacking prerequisite
source data (few real users, no tags/routes/wishlists/clubs/events) this means all
countable types (IDs 1–17) show as anomalies — false alarms, not bugs in the matchers.

## Classification rule
Each countable type maps to a **source family** with a probe SQL + `min` threshold:
- `count > 0` → **OK**
- `count == 0` AND eligible source data present (`sourceCount >= min`) → **WARN** (real anomaly)
- `count == 0` AND no eligible source → **NO_DATA** (expected)
- type has **no producing matcher** at all → **INACTIVE** (never WARN)

Only WARN feeds `warns` / `overallStatus`.

**Why:** a probe that doesn't mirror what the matcher actually consumes produces false
WARNs the moment unrelated data appears, re-introducing the very false-alarm the feature
removes.

## How to apply
When adding/changing a match type or its matcher:
- The source probe must count the *same* prerequisites the matcher reads. Biker↔zavorrina
  types (e.g. `tipo_zav`) need BOTH biker moto tags AND a zavorrina wishlist — probe must
  require both, not just one.
- If a registry type has **no run-*.ts producer** (e.g. `club_zav:%` — `zavarrinaClubBrand`
  / id 4 — no matcher emits that brand string), add it to the INACTIVE set so it never
  becomes a WARN even when related data (clubs) exists.
- Real source tables: `user_motorcycles` (NOT `motorcycles`), `zavorrina_wishlists` +
  `zavorrina_wishlist_motos`, `entity_tags`(entity_type 'motorcycle'|'user') via
  `tag_categories.slug` in tipo_moto/stile_guida/musica, `routes`/`route_points`,
  `moto_clubs`/`moto_club_members`, `event_participants`. Probes filter
  `users.is_fake=false AND status='active' AND user_type IN ('biker','coppia')`.

# Audit Tabelle Dominio Matching — 2026-06-11

## Query eseguita
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

## Tabelle attese vs presenti nel DB

| # | Tabella | Sorgente schema | DB |
|---|---------|----------------|----|
| 1 | `zavorrina_wishlists` | matching.ts | ✅ |
| 2 | `zavorrina_wishlist_photos` | matching.ts | ✅ |
| 3 | `zavorrina_wishlist_motos` | matching.ts | ✅ |
| 4 | `biker_zavorrina_matches` | matching.ts | ✅ |
| 5 | `direct_match_requests` | matching.ts | ✅ |
| 6 | `match_preferences` | matching.ts | ✅ |
| 7 | `weekly_recaps` | matching.ts | ✅ |
| 8 | `music_affinity_matches` | matching.ts | ✅ |
| 9 | `user_route_fingerprints` | matching.ts | ✅ |
| 10 | `geo_cell_labels` | matching.ts | ✅ |
| 11 | `route_affinity_matches` | matching.ts | ✅ |
| 12 | `user_curvy_profile` | matching.ts | ✅ |
| 13 | `telemetry_affinity_matches` | matching.ts | ✅ |
| 14 | `planned_route_invites` | matching.ts | ✅ |
| 15 | `bio_affinity_matches` | matching.ts | ✅ |
| 16 | `daily_push_counts` | matching.ts | ✅ |
| 17 | `match_notification_deliveries` | matching.ts | ✅ |
| 18 | `match_feedback` | matching.ts | ✅ |
| 19 | `user_match_profile` | matching.ts | ✅ |
| 20 | `biker_biker_matches` | matching-drizzle-excluded.ts | ✅ |
| 21 | `match_negative_preferences` | matching-drizzle-excluded.ts | ✅ |
| 22 | `pending_auto_suggestions` | matching-drizzle-excluded.ts | ✅ |
| 23 | `match_rules` | matching-extra.ts | ✅ |
| 24 | `match_thresholds` | matching-extra.ts | ✅ |
| 25 | `match_zero_snapshots` | matching-extra.ts | ✅ |

## Risultato

**✅ Tutte e 25 le tabelle sono presenti con il nome corretto.**

Nessuna discrepanza di nome. Nessuna migration correttiva necessaria.

## Note

- `music_match_dismissals` è presente nel DB ma appartiene a `shared/db/music.ts` (fuori scope dominio matching).
- Le 3 tabelle in `matching-drizzle-excluded.ts` (`biker_biker_matches`, `match_negative_preferences`, `pending_auto_suggestions`) sono escluse da drizzle-kit per via di indici su espressione LEAST/GREATEST e FK troncati a 63 char. Gestite via migration SQL numerata in `migrations/`.
- Per rieseguire l'audit: query `information_schema.tables` + confronto con i `pgTable(...)` nei 3 file schema.

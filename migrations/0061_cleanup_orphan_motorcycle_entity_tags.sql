-- Task #2718 — One-shot cleanup of orphan `entity_tags` rows.
--
-- L'associazione tag↔moto è polimorfica (entityType="motorcycle", entityId =
-- user_motorcycles.id) e non ha FK su user_motorcycles. Prima del fix
-- applicativo in `deleteUserMotorcycle`, ogni DELETE di una moto lasciava
-- righe orfane in entity_tags. Questa migrazione rimuove gli orfani esistenti.

DELETE FROM entity_tags
WHERE entity_type = 'motorcycle'
  AND entity_id NOT IN (SELECT id FROM user_motorcycles);

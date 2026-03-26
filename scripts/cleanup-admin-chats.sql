BEGIN;

CREATE TEMP TABLE admin_convs_to_delete AS
SELECT c.id FROM conversations c
JOIN conversation_participants cp ON cp.conversation_id = c.id
WHERE cp.user_id = '63d14222-e80f-481a-a2be-7784e7a397a4'
AND c.conversation_type IN ('private', 'direct', 'contact');

DELETE FROM messages WHERE conversation_id IN (SELECT id FROM admin_convs_to_delete);
DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM admin_convs_to_delete);
DELETE FROM conversations WHERE id IN (SELECT id FROM admin_convs_to_delete);

DROP TABLE admin_convs_to_delete;

COMMIT;

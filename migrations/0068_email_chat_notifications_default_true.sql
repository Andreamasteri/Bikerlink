-- Allinea utenti esistenti con NULL in email_chat_notifications a true.
-- Sicuro: non tocca chi ha scelto esplicitamente false.
UPDATE user_profiles
SET email_chat_notifications = true
WHERE email_chat_notifications IS NULL;

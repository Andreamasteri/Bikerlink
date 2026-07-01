-- Task #5298 — timestamp dell'ultima apertura/foreground dell'app PRINCIPALE
-- BikerLink. Campo DEDICATO (mai riusare last_login_at): scritto SOLO dall'app
-- principale, letto dal Bowie Terminal standalone per auto-chiudersi quando
-- l'utente apre BikerLink (algoritmo baseline/ack lato terminale).
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_main_app_foreground_at TIMESTAMP;

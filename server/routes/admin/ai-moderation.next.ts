/**
 * ai-moderation.next.ts — file successore di ai-moderation.ts
 *
 * Contenuto futuro (da spostare qui quando ai-moderation.ts supera la soglia):
 *   - POST /ai/digest/run — Avvio manuale digest AI per tutti i moderatori
 *   - GET  /ai/digest/latest — Recupero digest più recente con stato lettura
 *   - POST /ai/digest/mark-read — Marca digest come letto (idempotente)
 *   - GET  /ai/digest/unread — Flag "non letto" per badge hub report
 *   - GET  /ai/hub-card — Stato AI unificato per Hub Report
 *   - Eventuali nuovi endpoint AI moderazione
 */

import { Router } from "express";

const router = Router();

export default router;

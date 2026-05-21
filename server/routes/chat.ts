import { Router } from "express";
import conversationsRouter from "./chat/conversations";
import messagesRouter from "./chat/messages";
import attachmentsRouter from "./chat/attachments";
import streamRouter from "./chat/stream";

const router = Router();

// Mount sub-routers
router.use("/stream", streamRouter);
router.use("/conversations", conversationsRouter);
router.use("/", messagesRouter);
router.use("/", attachmentsRouter);

// Compatibility alias for the old structure if needed by some clients
// /api/chat/unread-total is handled by conversationsRouter.get('/unread-total') if it was mounted at /
// but I mounted it at /conversations, so /api/chat/conversations/unread-total.
// Let's adjust to match EXACTLY the original paths.

export default router;

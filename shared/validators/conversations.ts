import { z } from "zod";

export const createConversationSchema = z.object({
  conversationType: z.enum(["direct", "private", "contact", "group", "club"]),
  title: z.string().max(200).optional().nullable(),
  proposalId: z.string().optional().nullable(),
  participantIds: z.array(z.string()).min(1, "Almeno un partecipante richiesto"),
});
export type CreateConversationInput = z.infer<typeof createConversationSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1, "ID conversazione obbligatorio"),
  messageType: z.enum(["text", "image", "location", "audio", "video", "system", "playlist"]).default("text"),
  content: z.string().max(10000).optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  latitude: z.number().finite().optional().nullable(),
  longitude: z.number().finite().optional().nullable(),
  playlistId: z.string().optional().nullable(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

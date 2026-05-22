import { z } from "zod";

export const createEventSchema = z.object({
  title: z.string().min(1, "Titolo obbligatorio").max(200),
  description: z.string().max(5000).optional().nullable(),
  eventType: z.string().optional().nullable(),
  latitude: z.number().finite().optional().nullable(),
  longitude: z.number().finite().optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional().nullable(),
  maxParticipants: z.number().int().positive().optional().nullable(),
  isPublic: z.boolean().optional(),
  isMultiday: z.boolean().optional(),
  gpxUrl: z.string().optional().nullable(),
  clubId: z.string().optional().nullable(),
  coverUrl: z.string().optional().nullable(),
  waypoints: z.array(z.unknown()).optional().nullable(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema.partial();
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const eventParticipationSchema = z.object({
  status: z.enum(["going", "interested", "not_going"]),
});
export type EventParticipationInput = z.infer<typeof eventParticipationSchema>;

export const rejectEventSchema = z.object({
  reason: z.string().optional(),
}).passthrough();
export type RejectEventInput = z.infer<typeof rejectEventSchema>;

export const inviteUserToEventSchema = z.object({
  userId: z.string().min(1, "userId obbligatorio"),
});
export type InviteUserToEventInput = z.infer<typeof inviteUserToEventSchema>;

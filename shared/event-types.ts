export type EventType = "raduno" | "uscita_gruppo" | "festa" | "gara" | "altro";
export type EventStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ParticipationStatus = "going" | "interested";

export interface EventImageDTO {
  id: string;
  imageUrl: string;
  sortOrder: number;
}

export interface EventParticipantDTO {
  userId: string;
  nickname: string | null;
  photoUrl: string | null;
  participationStatus: ParticipationStatus;
}

export interface EventDTO {
  id: string;
  title: string;
  description: string | null;
  eventType: EventType;
  creatorId: string;
  creatorNickname: string | null;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  eventDate: string;
  eventTime: string | null;
  isRecurring: boolean;
  recurrenceInfo: string | null;
  maxParticipants: number | null;
  websiteUrl: string | null;
  autoInviteReason: string | null;
  autoInviteRegion: string | null;
  autoInviteBrand: string | null;
  status: EventStatus;
  rejectionReason: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  participantCount: number;
  interestedCount: number;
  userParticipation: ParticipationStatus | null;
  images: EventImageDTO[];
  participants: EventParticipantDTO[];
  createdAt: string;
  updatedAt: string;
}

export interface EventMapPin {
  id: string;
  title: string;
  eventType: EventType;
  latitude: number;
  longitude: number;
  locationName: string | null;
  eventDate: string;
  eventTime: string | null;
  isRecurring: boolean;
}

export interface CreateEventPayload {
  title: string;
  description?: string;
  eventType: EventType;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  eventDate: string;
  eventTime?: string;
  isRecurring: boolean;
  recurrenceInfo?: string;
  maxParticipants?: number;
  websiteUrl?: string;
  autoInviteReason?: string;
  autoInviteRegion?: string;
  autoInviteBrand?: string;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  raduno: "Raduno",
  uscita_gruppo: "Uscita di gruppo",
  festa: "Festa / Festival",
  gara: "Gara",
  altro: "Altro",
};

export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  raduno: "#FF6B35",
  uscita_gruppo: "#4CAF50",
  festa: "#9C27B0",
  gara: "#F44336",
  altro: "#607D8B",
};

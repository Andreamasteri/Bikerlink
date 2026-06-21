export interface ProfileData {
  id: string;
  nickname: string;
  email: string;
  phone?: string;
  userType: string;
  sex?: string;
  coupleSexConfig?: string;
  birthYear?: number;
  region?: string;
  country?: string;
  avatarUrl?: string;
  role: string;
  status: string;
  isPrimal?: boolean;
  deletionRequestedAt?: string;
  gpsPrecision?: string;
  profile?: {
    isAvailable: boolean;
    bio?: string;
    totalKm: number;
    totalRides: number;
    easterEggsCollected: number;
    maxPickupDistance?: number;
    searchPreference?: string;
    preferredMapStyle?: string | null;
    hideFromMap?: boolean;
    positionFuzz?: boolean;
    positionFuzzKm?: number;
    fakeHomeEnabled?: boolean;
    homeLatitude?: number | null;
    homeLongitude?: number | null;
    fakeHomeLatitude?: number | null;
    fakeHomeLongitude?: number | null;
    fakeHomeRadius?: number;
    notificationPreferences?: {
      matches?: boolean;
      zoneProposals?: boolean;
      chat?: boolean;
      motoclub?: boolean;
      eventi?: boolean;
      system_alerts?: boolean;
    } | null;
    pushNotificationsEnabled?: boolean;
  };
  photos?: Array<{
    id: string;
    photoUrl: string;
    sortOrder: number;
    isApproved: boolean;
  }>;
  motorcycles?: Array<{
    id: string;
    brand: string;
    model: string;
    year?: number;
    displacement?: number;
    motorcycleType?: string;
    ridingStyle?: string;
    photoUrl?: string;
  }>;
}

export interface PendingOtaRelease {
  id: string;
  version: string;
  runtime_version: string | null;
  status: string;
  slot: string | null;
  published_at: string | null;
}

export type IdealLap = {
  sessionId: string;
  startedAt: string;
  sampleCount: number;
  maxSpeedKmh: number | null;
  maxLeanDeg: number | null;
  maxGforce: number | null;
  lapNumber: number;
  lapName: string | null;
  distanceKm: number | null;
};

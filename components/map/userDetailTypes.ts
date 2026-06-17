export interface UserSummary {
  id: string;
  nickname: string;
  userType: string;
  sex?: string;
  country?: string;
  region?: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface Photo {
  id: string;
  photoUrl: string;
}

export interface Motorcycle {
  id: string;
  brand: string;
  model: string;
  motorcycleType?: string;
}

export interface UserDetail {
  isOnline: boolean;
  isAvailable: boolean;
  lastLoginAt?: string | null;
  bio?: string;
  primaryClubId?: string;
  primaryClubName?: string;
  topTrackName?: string;
  topArtistName?: string;
  photos?: Photo[];
  motorcycles?: Motorcycle[];
}

export interface Proposal {
  id: string;
  title: string;
  location?: string;
}

export interface OrganizedEvent {
  id: string;
}

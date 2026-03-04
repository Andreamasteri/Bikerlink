import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { fetch } from "expo/fetch";

interface User {
  id: string;
  email: string;
  phone: string | null;
  nickname: string;
  sex: "male" | "female";
  birthYear: number;
  region: string;
  profilePhotoUrl: string | null;
  userType: "biker" | "zavorrina" | "coppia";
  coupleSexConfig: "mm" | "mf" | "ff" | null;
  role: "user" | "moderator" | "admin";
  status: "active" | "suspended" | "blocked";
  eulaAccepted: boolean;
}

interface UserProfile {
  motorcycleType: string | null;
  motorcyclePhotoUrl: string | null;
  ridingStyle: string | null;
  maxPickupDistanceKm: number | null;
  isAvailable: boolean;
  availabilityType: string | null;
  departureLocation: string | null;
  departureTime: string | null;
  shareExactLocation: boolean;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastCity: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: any) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const baseUrl = getApiUrl();
      const url = new URL("/api/auth/me", baseUrl);
      const res = await fetch(url.toString(), { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setProfile(data.profile);
        await AsyncStorage.setItem("user", JSON.stringify(data.user));
      } else {
        setUser(null);
        setProfile(null);
        await AsyncStorage.removeItem("user");
      }
    } catch (err) {
      setUser(null);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        const cached = await AsyncStorage.getItem("user");
        if (cached) {
          setUser(JSON.parse(cached));
        }
        await refreshUser();
      } catch (err) {
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const res = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await res.json();
    setUser(data.user);
    await AsyncStorage.setItem("user", JSON.stringify(data.user));
    await refreshUser();
  };

  const register = async (data: any) => {
    const res = await apiRequest("POST", "/api/auth/register", data);
    const result = await res.json();
    setUser(result.user);
    await AsyncStorage.setItem("user", JSON.stringify(result.user));
    await refreshUser();
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (e) {}
    setUser(null);
    setProfile(null);
    await AsyncStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

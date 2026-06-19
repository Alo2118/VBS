import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";
import type { MemberProfile } from "@vbs/shared";
import { CASHIER_ROLES, STAFF_ROLES } from "@vbs/shared";
import { supabase } from "@/shared/api/supabase";
import { fetchMyProfile } from "@/shared/api/auth";

type AuthState = {
  loading: boolean;
  profile: MemberProfile | null;
  isAuthenticated: boolean;
  isStaff: boolean;
  isCashier: boolean;
  canBook: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MemberProfile | null>(null);

  const load = async () => {
    try {
      const me = await fetchMyProfile();
      setProfile(me);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // Reagisce a login/logout/refresh token.
    const { data } = supabase.auth.onAuthStateChange(() => {
      setLoading(true);
      void load();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    loading,
    profile,
    isAuthenticated: Boolean(profile),
    isStaff: profile ? STAFF_ROLES.includes(profile.role) : false,
    isCashier: profile ? CASHIER_ROLES.includes(profile.role) : false,
    canBook: profile?.membershipStatus === "VALID",
    refresh: load
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve essere usato dentro <AuthProvider>");
  return ctx;
};

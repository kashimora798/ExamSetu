import {
  createContext, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import { supabase } from '../lib/supabase';
import type { UserProfile } from '../lib/types';
import type { Session, User } from '@supabase/supabase-js';

/* ── Types ── */
interface AuthContextType {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/* ── Provider ── */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  /* Fetch user profile from user_profiles table */
  async function fetchProfile(userId: string, retryCount = 0) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); // Use maybeSingle to avoid 406 when row doesn't exist

    if (data) {
      setProfile(data as UserProfile);
    } else if (!data && !error && retryCount < 2) {
      // Profile doesn't exist yet (trigger might be delayed) — wait and retry
      await new Promise((r) => setTimeout(r, 1000));
      return fetchProfile(userId, retryCount + 1);
    } else if (!data && !error) {
      // After retries, set profile as a "new user" placeholder
      setProfile({
        id: userId,
        role: 'aspirant',
        full_name: null,
        phone: null,
        avatar_url: null,
        preferred_lang: 'hi',
        target_exam_id: null,
        target_paper: null,
        onboarding_done: false,
        streak_days: 0,
        last_active_at: null,
        total_questions_attempted: 0,
        total_correct: 0,
      } as UserProfile);
    }
  }

  /* Refresh profile (callable from outside) */
  async function refreshProfile() {
    if (user) {
      await fetchProfile(user.id);
    }
  }

  /* Listen for auth state changes */
  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      }
      setLoading(false);
    });

    // Subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        fetchProfile(s.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  /* Auth actions */
  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
  }

  async function signInWithMagicLink(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session, user, profile, loading,
        signInWithGoogle, signInWithMagicLink, signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/* ── Hook ── */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

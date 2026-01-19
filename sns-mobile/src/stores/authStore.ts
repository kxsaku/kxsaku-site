// Auth Store using Zustand
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

interface UserProfile {
  email: string;
  is_admin: boolean;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isSigningOut: boolean;

  // Actions
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  setSession: (session: Session | null) => void;
  fetchProfile: () => Promise<void>;
}

// Helper to fetch profile and determine admin status
async function fetchUserProfile(email: string): Promise<{ profile: UserProfile | null; isAdmin: boolean }> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('email, is_admin')
      .eq('email', email.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error('Profile fetch error:', error);
      return { profile: null, isAdmin: false };
    }

    console.log('Profile fetched:', data);
    return {
      profile: data,
      isAdmin: data?.is_admin || false,
    };
  } catch (error) {
    console.error('Profile fetch error:', error);
    return { profile: null, isAdmin: false };
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isAdmin: false,
  isAuthenticated: false,
  isSigningOut: false,

  initialize: async () => {
    console.log('=== AUTH INIT ===');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Initial session:', session?.user?.email || 'none');

      if (session?.user?.email) {
        // Fetch profile FIRST to get admin status
        const { profile, isAdmin } = await fetchUserProfile(session.user.email);
        console.log('Init - isAdmin:', isAdmin);

        set({
          user: session.user,
          session,
          profile,
          isAdmin,
          isAuthenticated: true,
        });
      }
    } catch (error) {
      console.error('Auth init error:', error);
    } finally {
      set({ isLoading: false });
    }

    // Listen for auth changes - but DON'T auto-set isAuthenticated
    // Let the signIn/signOut functions handle that
    supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session?.user?.email);

      // Only handle SIGNED_OUT events automatically
      // SIGNED_IN is handled by signIn function to avoid race conditions
      if (event === 'SIGNED_OUT' || !session?.user) {
        set({
          user: null,
          session: null,
          profile: null,
          isAdmin: false,
          isAuthenticated: false,
        });
      }
      // For TOKEN_REFRESHED, just update the session
      else if (event === 'TOKEN_REFRESHED') {
        set({ session });
      }
      // For INITIAL_SESSION, we've already handled it in initialize
      // For SIGNED_IN from signIn(), we've already handled it there
    });
  },

  signIn: async (email: string, password: string) => {
    console.log('=== AUTH STORE SIGN IN ===');
    console.log('Attempting login for:', email);
    try {
      set({ isLoading: true });
      console.log('Calling Supabase signInWithPassword...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase().trim(),
        password,
      });

      console.log('Supabase response - data:', data?.user?.email, 'error:', error?.message);

      if (error) {
        console.log('Login error:', error.message);
        return { error: error.message };
      }

      // Fetch profile FIRST to get admin status
      console.log('Fetching profile to check admin status...');
      const { profile, isAdmin } = await fetchUserProfile(data.user?.email || '');
      console.log('User is admin:', isAdmin);

      // NOW set everything including isAuthenticated
      set({
        user: data.user,
        session: data.session,
        profile,
        isAdmin,
        isAuthenticated: true,
      });

      console.log('Auth state set - isAuthenticated: true, isAdmin:', isAdmin);
      return {};
    } catch (error) {
      return { error: String(error) };
    } finally {
      set({ isLoading: false });
    }
  },

  signOut: async () => {
    // Prevent multiple simultaneous signOut calls
    if (get().isSigningOut) {
      console.log('SignOut already in progress, skipping...');
      return;
    }

    console.log('=== SIGN OUT CALLED ===');
    set({ isSigningOut: true });

    try {
      console.log('Calling Supabase signOut...');
      await supabase.auth.signOut();
      console.log('Supabase signOut complete, clearing state...');
      set({
        user: null,
        session: null,
        profile: null,
        isAdmin: false,
        isAuthenticated: false,
        isSigningOut: false,
      });
      console.log('State cleared, isAuthenticated should be false now');
    } catch (error) {
      console.error('Sign out error:', error);
      set({ isSigningOut: false });
    }
  },

  setSession: (session: Session | null) => {
    set({
      user: session?.user || null,
      session,
      isAuthenticated: !!session?.user,
    });
  },

  fetchProfile: async () => {
    const { user } = get();
    if (!user?.email) return;

    const { profile, isAdmin } = await fetchUserProfile(user.email);
    set({ profile, isAdmin });
  },
}));

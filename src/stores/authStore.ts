// Authentication store using Zustand + Supabase
// Based on TTRPG system patterns
import { create } from 'zustand';
import { supabase, isSupabaseConfigured } from '../services/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile, StaffRole, ClientRole } from '../types/supabase';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  isInitialized: boolean;
  error: string | null;

  // Computed helpers
  isStaff: boolean;
  isAdmin: boolean;
  isManagement: boolean;
  staffRole: StaffRole | null;
  clientRole: ClientRole | null;
  companyId: string | null;
  branchId: string | null;

  // Actions
  initialize: () => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  session: null,
  isLoading: false,
  isInitialized: false,
  error: null,

  // Computed
  isStaff: false,
  isAdmin: false,
  isManagement: false,
  staffRole: null,
  clientRole: null,
  companyId: null,
  branchId: null,

  initialize: async () => {
    if (!isSupabaseConfigured() || !supabase) {
      set({ isInitialized: true });
      return;
    }

    try {
      // Get initial session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (session?.user) {
        // Fetch profile
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profileError && profileError.code !== 'PGRST116') {
          console.error('Error fetching profile:', profileError);
        }

        const p = profile || null;
        set({
          user: session.user,
          session,
          profile: p,
          isInitialized: true,
          // Computed values
          isStaff: p?.is_staff || false,
          isAdmin: p?.staff_role === 'admin',
          isManagement: p?.staff_role === 'management' || p?.staff_role === 'admin',
          staffRole: p?.staff_role || null,
          clientRole: p?.client_role || null,
          companyId: p?.company_id || null,
          branchId: p?.branch_id || null,
        });
      } else {
        set({ isInitialized: true });
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('Auth state changed:', event);

        if (session?.user && supabase) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          const p = profile || null;
          set({
            user: session.user,
            session,
            profile: p,
            isStaff: p?.is_staff || false,
            isAdmin: p?.staff_role === 'admin',
            isManagement: p?.staff_role === 'management' || p?.staff_role === 'admin',
            staffRole: p?.staff_role || null,
            clientRole: p?.client_role || null,
            companyId: p?.company_id || null,
            branchId: p?.branch_id || null,
          });
        } else {
          set({
            user: null,
            session: null,
            profile: null,
            isStaff: false,
            isAdmin: false,
            isManagement: false,
            staffRole: null,
            clientRole: null,
            companyId: null,
            branchId: null,
          });
        }
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
      set({ isInitialized: true, error: (error as Error).message });
    }
  },

  signUp: async (email: string, password: string, fullName: string) => {
    if (!supabase) throw new Error('Supabase not configured');

    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        set({
          user: data.user,
          session: data.session,
          isLoading: false,
        });
      }
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  signIn: async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase not configured');

    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        const p = profile || null;
        set({
          user: data.user,
          session: data.session,
          profile: p,
          isLoading: false,
          isStaff: p?.is_staff || false,
          isAdmin: p?.staff_role === 'admin',
          isManagement: p?.staff_role === 'management' || p?.staff_role === 'admin',
          staffRole: p?.staff_role || null,
          clientRole: p?.client_role || null,
          companyId: p?.company_id || null,
          branchId: p?.branch_id || null,
        });
      }
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  signOut: async () => {
    if (!supabase) throw new Error('Supabase not configured');

    set({ isLoading: true, error: null });

    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      set({
        user: null,
        session: null,
        profile: null,
        isLoading: false,
        isStaff: false,
        isAdmin: false,
        isManagement: false,
        staffRole: null,
        clientRole: null,
        companyId: null,
        branchId: null,
      });
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  updateProfile: async (updates: Partial<Profile>) => {
    if (!supabase) throw new Error('Supabase not configured');

    const { user } = get();
    if (!user) throw new Error('Not authenticated');

    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;

      const p = data;
      set({
        profile: p,
        isLoading: false,
        isStaff: p?.is_staff || false,
        isAdmin: p?.staff_role === 'admin',
        isManagement: p?.staff_role === 'management' || p?.staff_role === 'admin',
        staffRole: p?.staff_role || null,
        clientRole: p?.client_role || null,
        companyId: p?.company_id || null,
        branchId: p?.branch_id || null,
      });
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  clearError: () => set({ error: null }),
}));

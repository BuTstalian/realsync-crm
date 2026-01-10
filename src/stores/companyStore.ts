// Company management store using Zustand + Supabase
// Based on TTRPG system patterns
import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type {
  Company,
  Branch,
  CompanyWithBranches,
  InsertTables,
  UpdateTables,
} from '../types/supabase';

interface CompanyFilters {
  search?: string;
  isActive?: boolean;
  tags?: string[];
}

interface CompanyState {
  // Data
  companies: Company[];
  currentCompany: CompanyWithBranches | null;
  branches: Branch[];

  // State flags
  isLoading: boolean;
  error: string | null;

  // Pagination
  totalCount: number;
  currentPage: number;
  pageSize: number;

  // Realtime channel
  channel: RealtimeChannel | null;

  // Actions - Companies
  loadCompanies: (filters?: CompanyFilters, page?: number) => Promise<void>;
  loadCompany: (id: string) => Promise<void>;
  createCompany: (data: InsertTables<'companies'>) => Promise<Company>;
  updateCompany: (id: string, updates: UpdateTables<'companies'>) => Promise<void>;
  deleteCompany: (id: string) => Promise<void>;

  // Actions - Branches
  loadBranches: (companyId: string) => Promise<void>;
  createBranch: (data: InsertTables<'branches'>) => Promise<Branch>;
  updateBranch: (id: string, updates: UpdateTables<'branches'>) => Promise<void>;
  deleteBranch: (id: string) => Promise<void>;

  // Realtime
  subscribeToCompany: (companyId: string) => Promise<void>;
  unsubscribe: () => void;

  // Utils
  clearCurrentCompany: () => void;
  clearError: () => void;
}

export const useCompanyStore = create<CompanyState>((set, get) => ({
  companies: [],
  currentCompany: null,
  branches: [],
  isLoading: false,
  error: null,
  totalCount: 0,
  currentPage: 1,
  pageSize: 20,
  channel: null,

  loadCompanies: async (filters?: CompanyFilters, page: number = 1) => {
    if (!supabase) return;

    set({ isLoading: true, error: null });

    try {
      const { pageSize } = get();
      const offset = (page - 1) * pageSize;

      // Build query
      let query = supabase
        .from('companies')
        .select('*', { count: 'exact' })
        .order('name', { ascending: true })
        .range(offset, offset + pageSize - 1);

      // Apply filters
      if (filters?.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,trading_name.ilike.%${filters.search}%,company_code.ilike.%${filters.search}%`
        );
      }

      if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive);
      }

      if (filters?.tags && filters.tags.length > 0) {
        query = query.contains('tags', filters.tags);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      set({
        companies: data || [],
        totalCount: count || 0,
        currentPage: page,
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
    }
  },

  loadCompany: async (id: string) => {
    if (!supabase) return;

    set({ isLoading: true, error: null });

    try {
      // Load company with branches
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', id)
        .single();

      if (companyError) throw companyError;

      const { data: branches, error: branchesError } = await supabase
        .from('branches')
        .select('*')
        .eq('company_id', id)
        .order('name', { ascending: true });

      if (branchesError) throw branchesError;

      set({
        currentCompany: { ...company, branches: branches || [] },
        branches: branches || [],
        isLoading: false,
      });
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
    }
  },

  createCompany: async (data: InsertTables<'companies'>) => {
    if (!supabase) throw new Error('Supabase not configured');

    set({ isLoading: true, error: null });

    try {
      const { data: company, error } = await supabase
        .from('companies')
        .insert(data)
        .select()
        .single();

      if (error) throw error;

      // Add to local list
      set((state) => ({
        companies: [company, ...state.companies],
        totalCount: state.totalCount + 1,
        isLoading: false,
      }));

      return company;
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  updateCompany: async (id: string, updates: UpdateTables<'companies'>) => {
    if (!supabase) throw new Error('Supabase not configured');

    set({ isLoading: true, error: null });

    try {
      const { data: company, error } = await supabase
        .from('companies')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      set((state) => ({
        companies: state.companies.map((c) => (c.id === id ? company : c)),
        currentCompany:
          state.currentCompany?.id === id
            ? { ...company, branches: state.currentCompany.branches }
            : state.currentCompany,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  deleteCompany: async (id: string) => {
    if (!supabase) throw new Error('Supabase not configured');

    set({ isLoading: true, error: null });

    try {
      const { error } = await supabase.from('companies').delete().eq('id', id);

      if (error) throw error;

      // Remove from local state
      set((state) => ({
        companies: state.companies.filter((c) => c.id !== id),
        currentCompany: state.currentCompany?.id === id ? null : state.currentCompany,
        totalCount: state.totalCount - 1,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  loadBranches: async (companyId: string) => {
    if (!supabase) return;

    set({ isLoading: true, error: null });

    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('company_id', companyId)
        .order('name', { ascending: true });

      if (error) throw error;

      set({ branches: data || [], isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
    }
  },

  createBranch: async (data: InsertTables<'branches'>) => {
    if (!supabase) throw new Error('Supabase not configured');

    set({ isLoading: true, error: null });

    try {
      const { data: branch, error } = await supabase
        .from('branches')
        .insert(data)
        .select()
        .single();

      if (error) throw error;

      // Add to local list
      set((state) => ({
        branches: [...state.branches, branch],
        currentCompany: state.currentCompany
          ? {
              ...state.currentCompany,
              branches: [...(state.currentCompany.branches || []), branch],
            }
          : null,
        isLoading: false,
      }));

      return branch;
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  updateBranch: async (id: string, updates: UpdateTables<'branches'>) => {
    if (!supabase) throw new Error('Supabase not configured');

    set({ isLoading: true, error: null });

    try {
      const { data: branch, error } = await supabase
        .from('branches')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      set((state) => ({
        branches: state.branches.map((b) => (b.id === id ? branch : b)),
        currentCompany: state.currentCompany
          ? {
              ...state.currentCompany,
              branches: state.currentCompany.branches?.map((b) =>
                b.id === id ? branch : b
              ),
            }
          : null,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  deleteBranch: async (id: string) => {
    if (!supabase) throw new Error('Supabase not configured');

    set({ isLoading: true, error: null });

    try {
      const { error } = await supabase.from('branches').delete().eq('id', id);

      if (error) throw error;

      // Remove from local state
      set((state) => ({
        branches: state.branches.filter((b) => b.id !== id),
        currentCompany: state.currentCompany
          ? {
              ...state.currentCompany,
              branches: state.currentCompany.branches?.filter((b) => b.id !== id),
            }
          : null,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: (error as Error).message });
      throw error;
    }
  },

  subscribeToCompany: async (companyId: string) => {
    if (!supabase) return;

    // Unsubscribe from existing channel
    get().unsubscribe();

    // Subscribe to branches changes for this company
    const channel = supabase
      .channel(`company-${companyId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'branches',
          filter: `company_id=eq.${companyId}`,
        },
        (payload) => {
          console.log('Branch change:', payload);

          if (payload.eventType === 'INSERT') {
            set((state) => ({
              branches: [...state.branches, payload.new as Branch],
              currentCompany: state.currentCompany
                ? {
                    ...state.currentCompany,
                    branches: [
                      ...(state.currentCompany.branches || []),
                      payload.new as Branch,
                    ],
                  }
                : null,
            }));
          } else if (payload.eventType === 'UPDATE') {
            set((state) => ({
              branches: state.branches.map((b) =>
                b.id === payload.new.id ? (payload.new as Branch) : b
              ),
              currentCompany: state.currentCompany
                ? {
                    ...state.currentCompany,
                    branches: state.currentCompany.branches?.map((b) =>
                      b.id === payload.new.id ? (payload.new as Branch) : b
                    ),
                  }
                : null,
            }));
          } else if (payload.eventType === 'DELETE') {
            set((state) => ({
              branches: state.branches.filter((b) => b.id !== payload.old.id),
              currentCompany: state.currentCompany
                ? {
                    ...state.currentCompany,
                    branches: state.currentCompany.branches?.filter(
                      (b) => b.id !== payload.old.id
                    ),
                  }
                : null,
            }));
          }
        }
      )
      .subscribe();

    set({ channel });
  },

  unsubscribe: () => {
    const { channel } = get();
    if (channel && supabase) {
      supabase.removeChannel(channel);
      set({ channel: null });
    }
  },

  clearCurrentCompany: () => {
    get().unsubscribe();
    set({ currentCompany: null, branches: [] });
  },

  clearError: () => set({ error: null }),
}));

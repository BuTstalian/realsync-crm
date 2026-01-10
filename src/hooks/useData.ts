// Optimized Data Hooks using React Query
// Handles caching, background sync, pagination, and selective real-time updates
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase';
import { queryKeys, STALE_TIMES, invalidateQueries } from '../lib/queryClient';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { 
  Company, 
  Branch, 
  Equipment, 
  Job, 
  Task,
  InsertTables,
  UpdateTables 
} from '../types/supabase';

// ============================================
// COMPANIES
// ============================================

interface CompanyFilters {
  search?: string;
  isActive?: boolean;
  page?: number;
  pageSize?: number;
}

interface CompanyListResult {
  data: Company[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function useCompanies(filters: CompanyFilters = {}) {
  const { search, isActive = true, page = 1, pageSize = 20 } = filters;

  return useQuery({
    queryKey: queryKeys.companies.list({ search, isActive, page, pageSize }),
    queryFn: async (): Promise<CompanyListResult> => {
      if (!supabase) throw new Error('Supabase not configured');

      const offset = (page - 1) * pageSize;

      let query = supabase
        .from('companies')
        .select('*', { count: 'exact' })
        .eq('is_active', isActive)
        .order('name')
        .range(offset, offset + pageSize - 1);

      if (search) {
        query = query.or(`name.ilike.%${search}%,trading_name.ilike.%${search}%,company_code.ilike.%${search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        data: data || [],
        totalCount: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    staleTime: STALE_TIMES.companies,
    placeholderData: (prev) => prev,
  });
}

export function useCompany(id: string | null) {
  return useQuery({
    queryKey: queryKeys.companies.detail(id || ''),
    queryFn: async () => {
      if (!supabase || !id) return null;

      const { data, error } = await supabase
        .from('companies')
        .select(`
          *,
          branches (*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: STALE_TIMES.companies,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: InsertTables<'companies'>) => {
      if (!supabase) throw new Error('Supabase not configured');

      const { data: company, error } = await supabase
        .from('companies')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return company;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.lists() });
    },
  });
}

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateTables<'companies'> }) => {
      if (!supabase) throw new Error('Supabase not configured');

      const { data: company, error } = await supabase
        .from('companies')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return company;
    },
    onSuccess: (data) => {
      invalidateQueries.company(data.id);
    },
  });
}

// ============================================
// EQUIPMENT (with infinite scroll support)
// ============================================

interface EquipmentFilters {
  branchId?: string;
  companyId?: string;
  search?: string;
  category?: string;
  dueWithinDays?: number;
}

export function useEquipmentInfinite(filters: EquipmentFilters = {}) {
  const pageSize = 50;

  return useInfiniteQuery({
    queryKey: queryKeys.equipment.list(filters),
    queryFn: async ({ pageParam = 0 }) => {
      if (!supabase) throw new Error('Supabase not configured');

      // Use the optimized database function
      const { data, error } = await supabase.rpc('search_equipment', {
        p_branch_id: filters.branchId || null,
        p_company_id: filters.companyId || null,
        p_search: filters.search || null,
        p_category: filters.category || null,
        p_due_within_days: filters.dueWithinDays || null,
        p_limit: pageSize,
        p_offset: pageParam,
      });

      if (error) throw error;

      const totalCount = data?.[0]?.total_count || 0;

      return {
        data: data || [],
        nextOffset: pageParam + pageSize < totalCount ? pageParam + pageSize : undefined,
        totalCount,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextOffset,
    initialPageParam: 0,
    staleTime: STALE_TIMES.equipment,
  });
}

export function useEquipment(id: string | null) {
  return useQuery({
    queryKey: queryKeys.equipment.detail(id || ''),
    queryFn: async () => {
      if (!supabase || !id) return null;

      const { data, error } = await supabase
        .from('equipment')
        .select(`
          *,
          branch:branches (
            id,
            name,
            company:companies (
              id,
              name
            )
          ),
          primary_service:services (*)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
    staleTime: STALE_TIMES.equipment,
  });
}

// ============================================
// JOBS
// ============================================

interface JobFilters {
  status?: string | string[];
  assignedTo?: string;
  branchId?: string;
  scheduledDate?: string;
  page?: number;
  pageSize?: number;
}

export function useJobs(filters: JobFilters = {}) {
  const { page = 1, pageSize = 20, ...rest } = filters;

  return useQuery({
    queryKey: queryKeys.jobs.list({ ...rest, page, pageSize }),
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');

      const offset = (page - 1) * pageSize;

      let query = supabase
        .from('jobs')
        .select(`
          *,
          branch:branches (
            id,
            name,
            company:companies (id, name)
          ),
          assigned_user:profiles!jobs_assigned_to_fkey (id, full_name)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in('status', filters.status);
        } else {
          query = query.eq('status', filters.status);
        }
      }

      if (filters.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo);
      }

      if (filters.branchId) {
        query = query.eq('branch_id', filters.branchId);
      }

      if (filters.scheduledDate) {
        query = query.eq('scheduled_date', filters.scheduledDate);
      }

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        data: data || [],
        totalCount: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    },
    staleTime: STALE_TIMES.jobs,
    // Refetch jobs more frequently since they change often
    refetchInterval: 60 * 1000, // Every minute when window is focused
    refetchIntervalInBackground: false,
  });
}

export function useMyJobs(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.jobs.myJobs(userId || ''),
    queryFn: async () => {
      if (!supabase || !userId) return [];

      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          branch:branches (
            id,
            name,
            address_line1,
            city,
            company:companies (id, name)
          )
        `)
        .eq('assigned_to', userId)
        .in('status', ['scheduled', 'in_progress'])
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: STALE_TIMES.jobs,
    refetchInterval: 30 * 1000, // More frequent for active jobs
  });
}

// ============================================
// TASKS
// ============================================

export function useMyTasks(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.tasks.myTasks(userId || ''),
    queryFn: async () => {
      if (!supabase || !userId) return [];

      const { data, error } = await supabase
        .from('tasks')
        .select(`
          *,
          company:companies (id, name),
          job:jobs (id, job_number)
        `)
        .eq('assigned_to', userId)
        .in('status', ['pending', 'in_progress'])
        .order('due_date', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    staleTime: STALE_TIMES.tasks,
    refetchInterval: 30 * 1000,
  });
}

export function useCompleteTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      if (!supabase) throw new Error('Supabase not configured');

      const { data, error } = await supabase
        .from('tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidateQueries.task();
    },
  });
}

// ============================================
// DASHBOARD STATS
// ============================================

export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: async () => {
      if (!supabase) throw new Error('Supabase not configured');

      try {
        // Try materialized view first
        const { data, error } = await supabase
          .from('mv_system_stats')
          .select('*')
          .single();

        if (!error && data) {
          return data;
        }
      } catch (err) {
        console.warn('Materialized view not available');
      }

      // Fallback to direct queries
      try {
        const [companies, equipment, jobs, equipmentDue] = await Promise.all([
          supabase.from('companies').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('equipment').select('id', { count: 'exact', head: true }).eq('is_active', true),
          supabase.from('jobs').select('id', { count: 'exact', head: true }).in('status', ['scheduled', 'in_progress']),
          supabase.from('equipment').select('id', { count: 'exact', head: true })
            .eq('is_active', true)
            .lte('next_calibration_due', new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()),
        ]);

        return {
          total_companies: companies.count || 0,
          total_equipment: equipment.count || 0,
          open_jobs: jobs.count || 0,
          equipment_due_30_days: equipmentDue.count || 0,
        };
      } catch (err) {
        console.warn('Error fetching dashboard stats:', err);
        return null;
      }
    },
    staleTime: STALE_TIMES.dashboardStats,
    refetchInterval: 60 * 1000,
  });
}

export function useMyDashboardStats(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboard.myStats(userId || ''),
    queryFn: async () => {
      if (!supabase || !userId) return null;

      // Always use direct query - materialized view may not exist
      try {
        const [tasksResult, jobsResult] = await Promise.all([
          supabase
            .from('tasks')
            .select('id, status, due_date', { count: 'exact' })
            .eq('assigned_to', userId)
            .in('status', ['pending', 'in_progress']),
          supabase
            .from('jobs')
            .select('id, status', { count: 'exact' })
            .eq('assigned_to', userId)
            .in('status', ['scheduled', 'in_progress']),
        ]);

        const overdueTasks = tasksResult.data?.filter(t => 
          t.due_date && new Date(t.due_date) < new Date()
        ).length || 0;

        return {
          pending_tasks: tasksResult.count || 0,
          overdue_tasks: overdueTasks,
          active_jobs: jobsResult.count || 0,
          jobs_completed_7d: 0, // Would need separate query
        };
      } catch (err) {
        console.warn('Error fetching dashboard stats:', err);
        return {
          pending_tasks: 0,
          overdue_tasks: 0,
          active_jobs: 0,
          jobs_completed_7d: 0,
        };
      }
    },
    enabled: !!userId,
    staleTime: STALE_TIMES.dashboardStats,
  });
}

// ============================================
// SELECTIVE REAL-TIME SUBSCRIPTION
// Only subscribe when viewing a specific record
// ============================================

export function useRealtimeSubscription(
  table: string,
  id: string | null,
  options: {
    enabled?: boolean;
    onUpdate?: (data: unknown) => void;
    onDelete?: () => void;
  } = {}
) {
  const { enabled = true, onUpdate, onDelete } = options;
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!supabase || !id || !enabled) return;

    // Subscribe to changes on this specific record
    channelRef.current = supabase
      .channel(`${table}-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
          filter: `id=eq.${id}`,
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            // Update cache directly for instant UI update
            const queryKey = getQueryKeyForTable(table, id);
            queryClient.setQueryData(queryKey, payload.new);
            onUpdate?.(payload.new);
          } else if (payload.eventType === 'DELETE') {
            onDelete?.();
          }
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [table, id, enabled, queryClient, onUpdate, onDelete]);
}

// Helper to get query key for a table
function getQueryKeyForTable(table: string, id: string) {
  switch (table) {
    case 'companies':
      return queryKeys.companies.detail(id);
    case 'branches':
      return queryKeys.branches.detail(id);
    case 'equipment':
      return queryKeys.equipment.detail(id);
    case 'jobs':
      return queryKeys.jobs.detail(id);
    default:
      return [table, 'detail', id];
  }
}

// ============================================
// PRESENCE (Polling, not WebSocket)
// ============================================

export function usePresencePolling(
  entityType: string,
  entityId: string | null,
  options: { enabled?: boolean; interval?: number } = {}
) {
  const { enabled = true, interval = 60000 } = options; // Default 60s

  return useQuery({
    queryKey: queryKeys.presence.viewers(entityType, entityId || ''),
    queryFn: async () => {
      if (!supabase || !entityId) return [];

      const { data, error } = await supabase.rpc('get_viewers', {
        p_entity_type: entityType,
        p_entity_id: entityId,
      });

      if (error) throw error;
      return data || [];
    },
    enabled: enabled && !!entityId,
    staleTime: STALE_TIMES.presence,
    refetchInterval: interval,
    refetchIntervalInBackground: false, // Don't poll when tab is hidden
  });
}

// ============================================
// LOCK CHECK (On-demand, not continuous)
// ============================================

export function useLockCheck(entityType: string, entityId: string | null) {
  return useQuery({
    queryKey: queryKeys.locks.check(entityType, entityId || ''),
    queryFn: async () => {
      if (!supabase || !entityId) return { locked: false };

      const { data, error } = await supabase.rpc('check_lock', {
        p_entity_type: entityType,
        p_entity_id: entityId,
      });

      if (error) throw error;
      return data || { locked: false };
    },
    enabled: !!entityId,
    staleTime: STALE_TIMES.locks,
    // Don't auto-refetch - we'll manually check when user tries to edit
    refetchOnWindowFocus: false,
  });
}

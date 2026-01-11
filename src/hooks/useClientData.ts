// Client-specific data hooks
// These fetch data scoped to the client's company via RLS
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../services/supabase';

// ============================================
// CLIENT DASHBOARD DATA
// ============================================

interface ClientDashboardStats {
  branchCount: number;
  totalEquipment: number;
  equipmentDue30Days: number;
  scheduledJobs: number;
  totalCertificates: number;
}

interface EquipmentDue {
  id: string;
  equipment_code: string;
  description: string | null;
  next_calibration_due: string | null;
  branch: { name: string } | null;
}

interface RecentCertificate {
  id: string;
  certificate_number: string;
  calibration_date: string;
  results: string;
  pdf_url: string | null;
  equipment: {
    equipment_code: string;
    description: string | null;
  } | null;
}

interface UpcomingJob {
  id: string;
  job_number: string;
  status: string;
  scheduled_date: string | null;
  branch: { name: string } | null;
}

interface Company {
  id: string;
  name: string;
  trading_name: string | null;
  company_code: string;
}

export function useClientDashboardData(companyId: string | null) {
  // Fetch company details
  const companyQuery = useQuery({
    queryKey: ['client', 'company', companyId],
    queryFn: async () => {
      if (!supabase || !companyId) return null;
      
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, trading_name, company_code')
        .eq('id', companyId)
        .single();
      
      if (error) throw error;
      return data as Company;
    },
    enabled: !!companyId,
  });

  // Fetch dashboard stats
  const statsQuery = useQuery({
    queryKey: ['client', 'dashboard-stats', companyId],
    queryFn: async (): Promise<ClientDashboardStats | null> => {
      if (!supabase || !companyId) return null;

      // Get branch count
      const { count: branchCount } = await supabase
        .from('branches')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId);

      // Get branch IDs for this company
      const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('company_id', companyId);
      
      const branchIds = branches?.map(b => b.id) || [];

      if (branchIds.length === 0) {
        return {
          branchCount: 0,
          totalEquipment: 0,
          equipmentDue30Days: 0,
          scheduledJobs: 0,
          totalCertificates: 0,
        };
      }

      // Get equipment count
      const { count: totalEquipment } = await supabase
        .from('equipment')
        .select('id', { count: 'exact', head: true })
        .in('branch_id', branchIds)
        .eq('is_active', true);

      // Get equipment due in 30 days
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      const { count: equipmentDue30Days } = await supabase
        .from('equipment')
        .select('id', { count: 'exact', head: true })
        .in('branch_id', branchIds)
        .eq('is_active', true)
        .lte('next_calibration_due', thirtyDaysFromNow.toISOString());

      // Get scheduled jobs
      const { count: scheduledJobs } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .in('branch_id', branchIds)
        .in('status', ['scheduled', 'in_progress']);

      // Get certificate count (query via equipment IDs to avoid RLS timeout)
      let totalCertificates = 0;
      try {
        // Get equipment IDs first
        const { data: eqIds } = await supabase
          .from('equipment')
          .select('id')
          .in('branch_id', branchIds)
          .eq('is_active', true)
          .limit(100);
        
        if (eqIds && eqIds.length > 0) {
          const { count } = await supabase
            .from('certificates')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'approved')
            .in('equipment_id', eqIds.map(e => e.id));
          totalCertificates = count || 0;
        }
      } catch (err) {
        console.warn('Could not fetch certificate count:', err);
      }

      return {
        branchCount: branchCount || 0,
        totalEquipment: totalEquipment || 0,
        equipmentDue30Days: equipmentDue30Days || 0,
        scheduledJobs: scheduledJobs || 0,
        totalCertificates,
      };
    },
    enabled: !!companyId,
    staleTime: 60 * 1000, // 1 minute
  });

  // Fetch equipment due for calibration
  const equipmentDueQuery = useQuery({
    queryKey: ['client', 'equipment-due', companyId],
    queryFn: async (): Promise<EquipmentDue[]> => {
      if (!supabase || !companyId) return [];

      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const { data, error } = await supabase
        .from('equipment')
        .select(`
          id,
          equipment_code,
          description,
          next_calibration_due,
          branch:branches (name)
        `)
        .eq('is_active', true)
        .lte('next_calibration_due', thirtyDaysFromNow.toISOString())
        .order('next_calibration_due', { ascending: true })
        .limit(20);

      if (error) throw error;
      return (data || []) as unknown as EquipmentDue[];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  // Fetch recent certificates - optimized approach
  const certificatesQuery = useQuery({
    queryKey: ['client', 'recent-certificates', companyId],
    queryFn: async (): Promise<RecentCertificate[]> => {
      if (!supabase || !companyId) return [];

      try {
        // First get branch IDs for this company
        const { data: branches } = await supabase
          .from('branches')
          .select('id')
          .eq('company_id', companyId);

        if (!branches || branches.length === 0) return [];

        const branchIds = branches.map(b => b.id);

        // Get equipment for these branches
        const { data: equipment, error: eqError } = await supabase
          .from('equipment')
          .select('id, equipment_code, description')
          .in('branch_id', branchIds)
          .eq('is_active', true)
          .limit(100);

        if (eqError || !equipment || equipment.length === 0) {
          return [];
        }

        const equipmentIds = equipment.map(e => e.id);
        const equipmentMap = new Map(equipment.map(e => [e.id, e]));

        // Now query certificates only for these specific equipment IDs
        const { data: certs, error: certError } = await supabase
          .from('certificates')
          .select('id, certificate_number, calibration_date, results, pdf_url, equipment_id')
          .eq('status', 'approved')
          .in('equipment_id', equipmentIds)
          .order('calibration_date', { ascending: false })
          .limit(10);

        if (certError) {
          console.warn('Error fetching certificates:', certError);
          return [];
        }

        return (certs || []).map(c => ({
          ...c,
          equipment: c.equipment_id ? equipmentMap.get(c.equipment_id) || null : null,
        })) as unknown as RecentCertificate[];
      } catch (err) {
        console.warn('Error in certificates query:', err);
        return [];
      }
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  // Fetch upcoming jobs
  const jobsQuery = useQuery({
    queryKey: ['client', 'upcoming-jobs', companyId],
    queryFn: async (): Promise<UpcomingJob[]> => {
      if (!supabase || !companyId) return [];

      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id,
          job_number,
          status,
          scheduled_date,
          branch:branches (name)
        `)
        .in('status', ['scheduled', 'in_progress'])
        .order('scheduled_date', { ascending: true })
        .limit(10);

      if (error) throw error;
      return (data || []) as unknown as UpcomingJob[];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  return {
    company: companyQuery.data || null,
    stats: statsQuery.data || null,
    equipmentDue: equipmentDueQuery.data || [],
    recentCertificates: certificatesQuery.data || [],
    upcomingJobs: jobsQuery.data || [],
    isLoading: companyQuery.isLoading || statsQuery.isLoading,
    error: companyQuery.error || statsQuery.error,
  };
}

// ============================================
// CLIENT EQUIPMENT LIST
// ============================================

interface EquipmentFilters {
  branchId?: string | null;
  category?: string | null;
  dueOnly?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useClientEquipment(companyId: string | null, filters: EquipmentFilters = {}) {
  const { branchId, category, dueOnly, search, page = 1, pageSize = 20 } = filters;

  return useQuery({
    queryKey: ['client', 'equipment', companyId, filters],
    queryFn: async () => {
      if (!supabase || !companyId) return { data: [], totalCount: 0 };

      const offset = (page - 1) * pageSize;

      let query = supabase
        .from('equipment')
        .select(`
          *,
          branch:branches (id, name)
        `, { count: 'exact' })
        .eq('is_active', true)
        .order('equipment_code')
        .range(offset, offset + pageSize - 1);

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      if (category) {
        query = query.eq('category', category);
      }

      if (dueOnly) {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        query = query.lte('next_calibration_due', thirtyDaysFromNow.toISOString());
      }

      if (search) {
        query = query.or(`equipment_code.ilike.%${search}%,description.ilike.%${search}%,serial_number.ilike.%${search}%`);
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
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
}

// ============================================
// CLIENT CERTIFICATES
// ============================================

interface CertificateFilters {
  equipmentId?: string | null;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function useClientCertificates(companyId: string | null, filters: CertificateFilters = {}) {
  const { equipmentId, search, page = 1, pageSize = 20 } = filters;

  return useQuery({
    queryKey: ['client', 'certificates', companyId, filters],
    queryFn: async () => {
      if (!supabase || !companyId) return { data: [], totalCount: 0 };

      const offset = (page - 1) * pageSize;

      let query = supabase
        .from('certificates')
        .select(`
          *,
          equipment:equipment (
            id,
            equipment_code,
            description,
            branch:branches (name)
          )
        `, { count: 'exact' })
        .eq('status', 'approved')
        .order('calibration_date', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (equipmentId) {
        query = query.eq('equipment_id', equipmentId);
      }

      if (search) {
        query = query.or(`certificate_number.ilike.%${search}%`);
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
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
}

// ============================================
// CLIENT JOBS
// ============================================

export function useClientJobs(companyId: string | null) {
  return useQuery({
    queryKey: ['client', 'jobs', companyId],
    queryFn: async () => {
      if (!supabase || !companyId) return [];

      const { data, error } = await supabase
        .from('jobs')
        .select(`
          *,
          branch:branches (
            id,
            name,
            address_line1,
            city
          )
        `)
        .order('scheduled_date', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });
}

// ============================================
// CLIENT BRANCHES
// ============================================

export function useClientBranches(companyId: string | null) {
  return useQuery({
    queryKey: ['client', 'branches', companyId],
    queryFn: async () => {
      if (!supabase || !companyId) return [];

      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

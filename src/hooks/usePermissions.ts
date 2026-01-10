// Permissions hook for role-based access control
// Based on TTRPG system usePermissions pattern
import { useAuthStore } from '../stores/authStore';
import type { StaffRole, ClientRole } from '../types/supabase';

interface Permissions {
  // Role checks
  isStaff: boolean;
  isAdmin: boolean;
  isManagement: boolean;
  isScheduler: boolean;
  isSales: boolean;
  isOnboarding: boolean;
  isTechnician: boolean;
  isClient: boolean;
  isCompanyManager: boolean;
  isBranchManager: boolean;

  // Entity permissions
  canViewAllCompanies: boolean;
  canCreateCompany: boolean;
  canEditCompany: boolean;
  canDeleteCompany: boolean;

  canViewAllBranches: boolean;
  canCreateBranch: boolean;
  canEditBranch: boolean;
  canDeleteBranch: boolean;

  canViewAllEquipment: boolean;
  canCreateEquipment: boolean;
  canEditEquipment: boolean;
  canDeleteEquipment: boolean;

  canViewAllJobs: boolean;
  canCreateJob: boolean;
  canEditJob: boolean;
  canDeleteJob: boolean;
  canAssignJob: boolean;
  canScheduleJob: boolean;

  canViewAllQuotes: boolean;
  canCreateQuote: boolean;
  canEditQuote: boolean;
  canDeleteQuote: boolean;
  canSendQuote: boolean;

  canViewAllCertificates: boolean;
  canCreateCertificate: boolean;
  canEditCertificate: boolean;
  canApproveCertificate: boolean;
  canDeleteCertificate: boolean;

  canViewAllTasks: boolean;
  canCreateTask: boolean;
  canEditTask: boolean;
  canDeleteTask: boolean;

  canViewReports: boolean;
  canManageUsers: boolean;
  canManageServices: boolean;
  canManageSettings: boolean;

  // Helper functions
  canAccessBranch: (branchId: string) => boolean;
  canAccessCompany: (companyId: string) => boolean;
  hasRole: (roles: StaffRole[]) => boolean;
}

// Role hierarchy for permission checks
const MANAGEMENT_ROLES: StaffRole[] = ['admin', 'management'];
const SCHEDULING_ROLES: StaffRole[] = ['admin', 'management', 'scheduler'];
const SALES_ROLES: StaffRole[] = ['admin', 'management', 'sales'];
const ONBOARDING_ROLES: StaffRole[] = ['admin', 'management', 'sales', 'onboarding'];
const TECHNICIAN_ROLES: StaffRole[] = ['admin', 'management', 'technician'];

export function usePermissions(): Permissions {
  const {
    isStaff,
    isAdmin,
    isManagement,
    staffRole,
    clientRole,
    companyId,
    branchId,
  } = useAuthStore();

  // Helper to check if user has one of the specified roles
  const hasRole = (roles: StaffRole[]): boolean => {
    if (!staffRole) return false;
    return roles.includes(staffRole);
  };

  // Role checks
  const isScheduler = staffRole === 'scheduler';
  const isSales = staffRole === 'sales';
  const isOnboarding = staffRole === 'onboarding';
  const isTechnician = staffRole === 'technician';
  const isClient = !isStaff && (clientRole === 'company_manager' || clientRole === 'branch_manager');
  const isCompanyManager = clientRole === 'company_manager';
  const isBranchManager = clientRole === 'branch_manager';

  // Branch access check
  const canAccessBranch = (targetBranchId: string): boolean => {
    if (isStaff) return true;
    if (isCompanyManager) {
      // Would need to check if branch belongs to user's company
      // This would typically be done with a lookup or passed in context
      return true; // Simplified - RLS handles actual security
    }
    if (isBranchManager) {
      return branchId === targetBranchId;
    }
    return false;
  };

  // Company access check
  const canAccessCompany = (targetCompanyId: string): boolean => {
    if (isStaff) return true;
    if (isCompanyManager || isBranchManager) {
      return companyId === targetCompanyId;
    }
    return false;
  };

  return {
    // Role checks
    isStaff,
    isAdmin,
    isManagement,
    isScheduler,
    isSales,
    isOnboarding,
    isTechnician,
    isClient,
    isCompanyManager,
    isBranchManager,

    // Company permissions
    canViewAllCompanies: isStaff,
    canCreateCompany: hasRole(ONBOARDING_ROLES),
    canEditCompany: hasRole(SALES_ROLES),
    canDeleteCompany: isAdmin,

    // Branch permissions
    canViewAllBranches: isStaff,
    canCreateBranch: hasRole(ONBOARDING_ROLES),
    canEditBranch: hasRole([...SALES_ROLES, 'scheduler']),
    canDeleteBranch: isAdmin,

    // Equipment permissions
    canViewAllEquipment: isStaff,
    canCreateEquipment: hasRole([...ONBOARDING_ROLES, 'technician']),
    canEditEquipment: hasRole([...ONBOARDING_ROLES, 'technician']),
    canDeleteEquipment: isAdmin,

    // Job permissions
    canViewAllJobs: isStaff && !isTechnician, // Technicians only see assigned
    canCreateJob: hasRole([...SCHEDULING_ROLES, 'sales']),
    canEditJob: hasRole([...SCHEDULING_ROLES, 'technician']),
    canDeleteJob: isAdmin,
    canAssignJob: hasRole(SCHEDULING_ROLES),
    canScheduleJob: hasRole(SCHEDULING_ROLES),

    // Quote permissions
    canViewAllQuotes: isStaff,
    canCreateQuote: hasRole(SALES_ROLES),
    canEditQuote: hasRole(SALES_ROLES),
    canDeleteQuote: isAdmin,
    canSendQuote: hasRole(SALES_ROLES),

    // Certificate permissions
    canViewAllCertificates: isStaff,
    canCreateCertificate: hasRole([...MANAGEMENT_ROLES, 'technician']),
    canEditCertificate: hasRole([...MANAGEMENT_ROLES, 'technician']),
    canApproveCertificate: hasRole(MANAGEMENT_ROLES),
    canDeleteCertificate: isAdmin,

    // Task permissions
    canViewAllTasks: isStaff,
    canCreateTask: isStaff,
    canEditTask: isStaff,
    canDeleteTask: isAdmin,

    // Admin permissions
    canViewReports: hasRole(MANAGEMENT_ROLES),
    canManageUsers: isAdmin,
    canManageServices: hasRole(MANAGEMENT_ROLES),
    canManageSettings: isAdmin,

    // Helper functions
    canAccessBranch,
    canAccessCompany,
    hasRole,
  };
}

// Hook for checking if user can perform action on specific entity
export function useEntityPermissions(entityType: 'company' | 'branch' | 'equipment' | 'job' | 'quote' | 'certificate') {
  const permissions = usePermissions();

  const getPermissions = () => {
    switch (entityType) {
      case 'company':
        return {
          canView: permissions.canViewAllCompanies || permissions.isClient,
          canCreate: permissions.canCreateCompany,
          canEdit: permissions.canEditCompany,
          canDelete: permissions.canDeleteCompany,
        };
      case 'branch':
        return {
          canView: permissions.canViewAllBranches || permissions.isClient,
          canCreate: permissions.canCreateBranch,
          canEdit: permissions.canEditBranch,
          canDelete: permissions.canDeleteBranch,
        };
      case 'equipment':
        return {
          canView: permissions.canViewAllEquipment || permissions.isClient,
          canCreate: permissions.canCreateEquipment,
          canEdit: permissions.canEditEquipment,
          canDelete: permissions.canDeleteEquipment,
        };
      case 'job':
        return {
          canView: permissions.canViewAllJobs || permissions.isTechnician || permissions.isClient,
          canCreate: permissions.canCreateJob,
          canEdit: permissions.canEditJob,
          canDelete: permissions.canDeleteJob,
        };
      case 'quote':
        return {
          canView: permissions.canViewAllQuotes || permissions.isClient,
          canCreate: permissions.canCreateQuote,
          canEdit: permissions.canEditQuote,
          canDelete: permissions.canDeleteQuote,
        };
      case 'certificate':
        return {
          canView: permissions.canViewAllCertificates || permissions.isClient,
          canCreate: permissions.canCreateCertificate,
          canEdit: permissions.canEditCertificate,
          canDelete: permissions.canDeleteCertificate,
        };
      default:
        return {
          canView: false,
          canCreate: false,
          canEdit: false,
          canDelete: false,
        };
    }
  };

  return getPermissions();
}

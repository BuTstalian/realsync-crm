// Query Client Configuration
// Centralized caching and background sync strategy
import { QueryClient } from '@tanstack/react-query';

// Stale times by data type (how long before background refetch)
export const STALE_TIMES = {
  // Static-ish data - refetch every 5 minutes
  companies: 5 * 60 * 1000,
  branches: 5 * 60 * 1000,
  services: 10 * 60 * 1000,
  
  // Semi-dynamic - refetch every 2 minutes
  equipment: 2 * 60 * 1000,
  quotes: 2 * 60 * 1000,
  
  // Dynamic - refetch every 30 seconds
  jobs: 30 * 1000,
  tasks: 30 * 1000,
  
  // Very dynamic - refetch every 10 seconds
  presence: 10 * 1000,
  locks: 10 * 1000,
  
  // Dashboard stats - refetch every minute
  dashboardStats: 60 * 1000,
};

// Cache times (how long to keep in memory after unused)
export const CACHE_TIMES = {
  default: 10 * 60 * 1000, // 10 minutes
  static: 30 * 60 * 1000,  // 30 minutes
  dynamic: 5 * 60 * 1000,  // 5 minutes
};

// Create query client with optimized defaults
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus by default (we control this per-query)
      refetchOnWindowFocus: false,
      
      // Don't refetch on reconnect automatically
      refetchOnReconnect: 'always',
      
      // Retry failed requests 2 times with exponential backoff
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      
      // Keep unused data in cache for 10 minutes
      gcTime: CACHE_TIMES.default,
      
      // Default stale time
      staleTime: 60 * 1000, // 1 minute
      
      // Use cached data while fetching new data
      placeholderData: (previousData: unknown) => previousData,
    },
    mutations: {
      // Retry mutations once
      retry: 1,
    },
  },
});

// Query key factory for consistent keys
export const queryKeys = {
  // Companies
  companies: {
    all: ['companies'] as const,
    lists: () => [...queryKeys.companies.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.companies.lists(), filters] as const,
    details: () => [...queryKeys.companies.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.companies.details(), id] as const,
    stats: (id: string) => [...queryKeys.companies.detail(id), 'stats'] as const,
  },
  
  // Branches
  branches: {
    all: ['branches'] as const,
    lists: () => [...queryKeys.branches.all, 'list'] as const,
    list: (companyId: string) => [...queryKeys.branches.lists(), companyId] as const,
    details: () => [...queryKeys.branches.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.branches.details(), id] as const,
  },
  
  // Equipment
  equipment: {
    all: ['equipment'] as const,
    lists: () => [...queryKeys.equipment.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.equipment.lists(), filters] as const,
    details: () => [...queryKeys.equipment.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.equipment.details(), id] as const,
    history: (id: string) => [...queryKeys.equipment.detail(id), 'history'] as const,
  },
  
  // Jobs
  jobs: {
    all: ['jobs'] as const,
    lists: () => [...queryKeys.jobs.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.jobs.lists(), filters] as const,
    details: () => [...queryKeys.jobs.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.jobs.details(), id] as const,
    myJobs: (userId: string) => [...queryKeys.jobs.all, 'my', userId] as const,
  },
  
  // Tasks
  tasks: {
    all: ['tasks'] as const,
    lists: () => [...queryKeys.tasks.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.tasks.lists(), filters] as const,
    myTasks: (userId: string) => [...queryKeys.tasks.all, 'my', userId] as const,
  },
  
  // Quotes
  quotes: {
    all: ['quotes'] as const,
    lists: () => [...queryKeys.quotes.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.quotes.lists(), filters] as const,
    details: () => [...queryKeys.quotes.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.quotes.details(), id] as const,
  },
  
  // Certificates
  certificates: {
    all: ['certificates'] as const,
    lists: () => [...queryKeys.certificates.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...queryKeys.certificates.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.certificates.all, 'detail', id] as const,
  },
  
  // Services (catalogue)
  services: {
    all: ['services'] as const,
    list: () => [...queryKeys.services.all, 'list'] as const,
    byCategory: (category: string) => [...queryKeys.services.all, 'category', category] as const,
  },
  
  // Dashboard
  dashboard: {
    stats: ['dashboard', 'stats'] as const,
    myStats: (userId: string) => ['dashboard', 'my', userId] as const,
  },
  
  // Presence & Locks
  presence: {
    viewers: (entityType: string, entityId: string) => ['presence', entityType, entityId] as const,
  },
  locks: {
    check: (entityType: string, entityId: string) => ['locks', entityType, entityId] as const,
  },
};

// Invalidation helpers
export const invalidateQueries = {
  company: (id: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.companies.lists() });
  },
  
  branch: (id: string, companyId: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.branches.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.branches.list(companyId) });
  },
  
  equipment: (id: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.equipment.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.equipment.lists() });
  },
  
  job: (id: string) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.jobs.detail(id) });
    queryClient.invalidateQueries({ queryKey: queryKeys.jobs.lists() });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
  },
  
  task: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats });
  },
  
  all: () => {
    queryClient.invalidateQueries();
  },
};

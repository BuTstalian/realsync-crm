# RealSync CRM - Performance Architecture

## Design Goals

| Requirement | Solution |
|-------------|----------|
| 50,000 client users | Connection pooling, efficient RLS policies |
| 100 staff concurrent | React Query caching, background sync |
| Large datasets (100k+ equipment) | Cursor pagination, virtual scrolling |
| Real-time awareness | Selective subscriptions, polling for presence |
| Edit conflict prevention | Pessimistic locking with auto-expiry |

---

## 1. Data Fetching Strategy

### React Query Caching

All data fetching goes through React Query, which provides:

```
┌─────────────────────────────────────────────────────────┐
│  User clicks "Companies"                                 │
│         ↓                                                │
│  Check cache → Data exists and fresh? → Return instantly │
│         ↓ (no)                                           │
│  Return stale data immediately (instant UI)              │
│         ↓                                                │
│  Fetch fresh data in background                          │
│         ↓                                                │
│  Update UI when fresh data arrives                       │
└─────────────────────────────────────────────────────────┘
```

**Stale Times by Data Type:**

| Data Type | Stale After | Refetch Interval | Rationale |
|-----------|-------------|------------------|-----------|
| Companies | 5 min | On demand | Rarely changes |
| Branches | 5 min | On demand | Rarely changes |
| Services | 10 min | On demand | Almost static |
| Equipment | 2 min | On demand | Changes occasionally |
| Jobs | 30 sec | 1 min | Changes frequently |
| Tasks | 30 sec | 30 sec | Need quick updates |
| Dashboard | 1 min | 1 min | Aggregate stats |

### Pagination Strategy

**For List Views (< 1000 items):**
- Offset-based pagination
- Page numbers displayed
- 20-50 items per page

**For Large Lists (> 1000 items):**
- Cursor-based infinite scroll
- Virtual scrolling (only render visible rows)
- 50 items per fetch, load more on scroll

```typescript
// Virtual scrolling example
const rowVirtualizer = useVirtualizer({
  count: totalItems,
  getScrollElement: () => scrollRef.current,
  estimateSize: () => 48, // Row height
  overscan: 10, // Render 10 extra rows above/below
});
```

---

## 2. Database Optimizations

### Indexes Added

```sql
-- Composite indexes for common query patterns
idx_companies_active_name      -- Company list with search
idx_branches_company_active    -- Branches by company
idx_equipment_branch_due       -- Equipment due for calibration
idx_jobs_assigned_status       -- Technician's job list
idx_tasks_assigned_pending     -- User's task list

-- Partial indexes (smaller, faster)
idx_companies_name_partial     -- Only active companies
idx_jobs_open                  -- Only non-completed jobs
idx_tasks_active               -- Only pending/in-progress tasks

-- BRIN index for time-series
idx_activity_log_brin          -- Activity log (append-only)
```

### Materialized Views

Pre-computed aggregates for dashboards, refreshed every few minutes:

```sql
mv_company_stats     -- Branch count, equipment count, open jobs per company
mv_staff_dashboard   -- Pending tasks, active jobs per staff member
mv_system_stats      -- Overall system metrics
```

**Refresh Strategy:**
- Call `refresh_dashboard_stats()` via Supabase Edge Function on cron
- Every 5 minutes during business hours
- Every 15 minutes off-hours

### Optimized Query Functions

```sql
-- Instead of complex JOINs in app code:
SELECT * FROM search_companies('acme', true, 20, 0);
SELECT * FROM search_equipment(null, company_id, 'multimeter', null, 30, 50, 0);
```

---

## 3. Real-Time Strategy

### What Gets Real-Time Updates (WebSocket)

**Only when viewing a specific record:**
- The record you're currently viewing
- Lock status on that record

### What Gets Polled

| Data | Poll Interval | When |
|------|---------------|------|
| Presence (who's viewing) | 60 sec | Only on detail pages |
| My tasks | 30 sec | Only on dashboard |
| My jobs | 30 sec | Only on dashboard |

### What Doesn't Get Real-Time

- List views (use stale-while-revalidate instead)
- Historical data (certificates, activity log)
- Reference data (services catalogue)

### Implementation

```typescript
// Real-time ONLY for current record
useRealtimeSubscription('jobs', jobId, {
  enabled: isViewingJob,
  onUpdate: (data) => {
    // Update cache directly - instant UI update
    queryClient.setQueryData(['jobs', 'detail', jobId], data);
  },
});

// Presence is polled, not real-time
const { data: viewers } = usePresencePolling('job', jobId, {
  interval: 60000, // Every 60 seconds
  enabled: !!jobId,
});
```

---

## 4. Edit Conflict Prevention

### Locking Flow

```
┌─────────────────────────────────────────────────────────┐
│  User clicks "Edit"                                      │
│         ↓                                                │
│  Call acquire_lock(entity_type, entity_id)              │
│         ↓                                                │
│  ┌─────────────────┐     ┌──────────────────────────┐   │
│  │ Lock acquired   │     │ Lock held by someone     │   │
│  │                 │     │                          │   │
│  │ → Enter edit    │     │ → Show warning:          │   │
│  │   mode          │     │   "Sarah is editing"     │   │
│  │                 │     │                          │   │
│  │ → Auto-extend   │     │ → Disable edit button    │   │
│  │   every 60s     │     │   until lock expires     │   │
│  └─────────────────┘     └──────────────────────────┘   │
│         ↓                                                │
│  User saves or cancels                                   │
│         ↓                                                │
│  Release lock                                            │
└─────────────────────────────────────────────────────────┘
```

### Lock Properties

| Property | Value | Rationale |
|----------|-------|-----------|
| Default duration | 15 min | Long enough for edits |
| Auto-extend | Every 60 sec | Prevents timeout during active edit |
| Auto-expire | Yes | Prevents stuck locks if browser crashes |
| Takeover | After expiry | Can take over expired locks |

### Optimistic Locking (Backup)

Even with pessimistic locks, we check version on save:

```typescript
// Version column auto-increments on every update
const { error } = await supabase
  .from('jobs')
  .update(changes)
  .eq('id', jobId)
  .eq('version', originalVersion); // Fails if version changed

if (error?.code === 'PGRST116') {
  // Version mismatch - someone else saved
  showError('Record was modified. Please refresh.');
}
```

---

## 5. Connection Management

### Supabase Connection Pooling

Supabase uses Supavisor for connection pooling:

- **Transaction mode**: Short-lived queries (most requests)
- **Session mode**: Long-lived connections (real-time only)

We minimize session-mode connections by:
1. Using polling instead of WebSockets for presence
2. Only subscribing to real-time when viewing a specific record
3. Unsubscribing when navigating away

### Estimated Connections

| User Type | Connections | Notes |
|-----------|-------------|-------|
| Staff (100) | 100-200 | 1-2 tabs each |
| Clients (50k) | ~500 concurrent | 1% online at once |
| Real-time | ~100 | Only active viewers |
| **Total** | ~800 | Well under Supabase limits |

---

## 6. Frontend Performance

### Code Splitting

Routes are lazy-loaded:

```typescript
const Companies = lazy(() => import('./pages/Companies'));
const Jobs = lazy(() => import('./pages/Jobs'));
```

### Virtual Scrolling

For lists over 100 items, we use @tanstack/react-virtual:

```typescript
// Only renders visible rows + overscan
// 10,000 items in list = ~20 DOM nodes
```

### Memoization

Heavy computations and filtered lists are memoized:

```typescript
const filteredJobs = useMemo(() => 
  jobs.filter(j => j.status === selectedStatus),
  [jobs, selectedStatus]
);
```

---

## 7. Monitoring

### React Query DevTools

In development, shows:
- All cached queries
- Stale/fresh status
- Refetch timing
- Cache hits/misses

### Key Metrics to Watch

| Metric | Target | Alert If |
|--------|--------|----------|
| API response time | < 200ms | > 500ms |
| Cache hit rate | > 80% | < 60% |
| Active WebSockets | < 200 | > 500 |
| Failed queries | < 1% | > 5% |

---

## 8. Scaling Considerations

### If You Outgrow This Architecture

**50k → 200k users:**
- Add read replicas
- Implement CDN for static assets
- Consider Edge Functions for heavy processing

**100 → 500 staff:**
- Shard by region
- Add Redis cache layer
- Consider dedicated connection pool

**Current architecture comfortably handles the stated requirements** of 50k clients + 100 staff with room to grow.

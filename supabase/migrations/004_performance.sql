-- Performance Optimizations for Scale
-- Run this AFTER the other migrations

-- ============================================
-- COMPOSITE INDEXES FOR COMMON QUERIES
-- ============================================

-- Companies: Search by name with active filter (most common query)
CREATE INDEX IF NOT EXISTS idx_companies_active_name 
  ON companies(is_active, name) 
  WHERE is_active = true;

-- Branches: Filter by company + active (always filtered together)
CREATE INDEX IF NOT EXISTS idx_branches_company_active 
  ON branches(company_id, is_active) 
  WHERE is_active = true;

-- Equipment: Filter by branch + next calibration due (for reminders)
CREATE INDEX IF NOT EXISTS idx_equipment_branch_due 
  ON equipment(branch_id, next_calibration_due) 
  WHERE is_active = true;

-- Equipment: Search by serial number (unique lookups)
CREATE INDEX IF NOT EXISTS idx_equipment_serial 
  ON equipment(serial_number) 
  WHERE serial_number IS NOT NULL;

-- Jobs: Filter by status + assigned (technician dashboard)
CREATE INDEX IF NOT EXISTS idx_jobs_assigned_status 
  ON jobs(assigned_to, status) 
  WHERE status NOT IN ('completed', 'invoiced', 'cancelled');

-- Jobs: Filter by branch + status (company view)
CREATE INDEX IF NOT EXISTS idx_jobs_branch_status 
  ON jobs(branch_id, status);

-- Jobs: Scheduled date range queries
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled 
  ON jobs(scheduled_date, status) 
  WHERE scheduled_date IS NOT NULL;

-- Tasks: My pending tasks (most common task query)
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_pending 
  ON tasks(assigned_to, status, due_date) 
  WHERE status IN ('pending', 'in_progress');

-- Certificates: By equipment (history view)
CREATE INDEX IF NOT EXISTS idx_certificates_equipment_date 
  ON certificates(equipment_id, calibration_date DESC);

-- Activity log: By entity (audit trail)
CREATE INDEX IF NOT EXISTS idx_activity_entity_time 
  ON activity_log(entity_type, entity_id, created_at DESC);

-- Quotes: By branch + status
CREATE INDEX IF NOT EXISTS idx_quotes_branch_status 
  ON quotes(branch_id, status);

-- ============================================
-- PARTIAL INDEXES (Smaller, Faster)
-- ============================================

-- Only index active companies (90%+ queries filter by active)
CREATE INDEX IF NOT EXISTS idx_companies_name_partial
  ON companies(name text_pattern_ops)
  WHERE is_active = true;

-- Only index open jobs (closed jobs rarely queried)
CREATE INDEX IF NOT EXISTS idx_jobs_open
  ON jobs(branch_id, created_at DESC)
  WHERE status NOT IN ('completed', 'invoiced', 'cancelled');

-- Only index pending/in_progress tasks
CREATE INDEX IF NOT EXISTS idx_tasks_active
  ON tasks(assigned_to, due_date)
  WHERE status IN ('pending', 'in_progress');

-- ============================================
-- BRIN INDEXES FOR TIME-SERIES DATA
-- (Much smaller than B-tree for sequential data)
-- ============================================

-- Activity log is append-only, perfect for BRIN
DROP INDEX IF EXISTS idx_activity_created;
CREATE INDEX idx_activity_log_brin ON activity_log USING BRIN(created_at);

-- ============================================
-- MATERIALIZED VIEWS FOR DASHBOARDS
-- (Pre-computed aggregates, refresh periodically)
-- ============================================

-- Dashboard stats per company
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_company_stats AS
SELECT 
  c.id AS company_id,
  c.name AS company_name,
  COUNT(DISTINCT b.id) AS branch_count,
  COUNT(DISTINCT e.id) AS equipment_count,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status NOT IN ('completed', 'invoiced', 'cancelled')) AS open_jobs,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'completed' AND j.completed_at > NOW() - INTERVAL '30 days') AS jobs_completed_30d,
  COUNT(DISTINCT e.id) FILTER (WHERE e.next_calibration_due < NOW() + INTERVAL '30 days') AS equipment_due_30d
FROM companies c
LEFT JOIN branches b ON b.company_id = c.id AND b.is_active = true
LEFT JOIN equipment e ON e.branch_id = b.id AND e.is_active = true
LEFT JOIN jobs j ON j.branch_id = b.id
WHERE c.is_active = true
GROUP BY c.id, c.name;

CREATE UNIQUE INDEX ON mv_company_stats(company_id);

-- Dashboard stats for staff
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_staff_dashboard AS
SELECT 
  p.id AS user_id,
  p.full_name,
  p.staff_role,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending') AS pending_tasks,
  COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'pending' AND t.due_date < NOW()) AS overdue_tasks,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status IN ('scheduled', 'in_progress')) AS active_jobs,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'completed' AND j.completed_at > NOW() - INTERVAL '7 days') AS jobs_completed_7d
FROM profiles p
LEFT JOIN tasks t ON t.assigned_to = p.id
LEFT JOIN jobs j ON j.assigned_to = p.id
WHERE p.is_staff = true AND p.is_active = true
GROUP BY p.id, p.full_name, p.staff_role;

CREATE UNIQUE INDEX ON mv_staff_dashboard(user_id);

-- Overall system stats (for admin dashboard)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_system_stats AS
SELECT 
  COUNT(DISTINCT c.id) FILTER (WHERE c.is_active = true) AS active_companies,
  COUNT(DISTINCT b.id) FILTER (WHERE b.is_active = true) AS active_branches,
  COUNT(DISTINCT e.id) FILTER (WHERE e.is_active = true) AS active_equipment,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status NOT IN ('completed', 'invoiced', 'cancelled')) AS open_jobs,
  COUNT(DISTINCT j.id) FILTER (WHERE j.created_at > NOW() - INTERVAL '7 days') AS jobs_created_7d,
  COUNT(DISTINCT cert.id) FILTER (WHERE cert.created_at > NOW() - INTERVAL '7 days') AS certificates_7d,
  NOW() AS last_refreshed
FROM companies c
CROSS JOIN branches b
CROSS JOIN equipment e
CROSS JOIN jobs j
CROSS JOIN certificates cert;

-- Function to refresh materialized views (call via cron or Edge Function)
CREATE OR REPLACE FUNCTION refresh_dashboard_stats()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_company_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_staff_dashboard;
  REFRESH MATERIALIZED VIEW mv_system_stats;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- QUERY OPTIMIZATION FUNCTIONS
-- ============================================

-- Efficient company search with pagination
CREATE OR REPLACE FUNCTION search_companies(
  p_search TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT true,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  company_code TEXT,
  name TEXT,
  trading_name TEXT,
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  is_active BOOLEAN,
  branch_count BIGINT,
  equipment_count BIGINT,
  total_count BIGINT
) AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Get total count first (for pagination)
  SELECT COUNT(*) INTO v_total
  FROM companies c
  WHERE (p_is_active IS NULL OR c.is_active = p_is_active)
    AND (p_search IS NULL OR 
         c.name ILIKE '%' || p_search || '%' OR 
         c.trading_name ILIKE '%' || p_search || '%' OR
         c.company_code ILIKE '%' || p_search || '%');

  RETURN QUERY
  SELECT 
    c.id,
    c.company_code,
    c.name,
    c.trading_name,
    c.primary_contact_name,
    c.primary_contact_email,
    c.is_active,
    COALESCE(stats.branch_count, 0),
    COALESCE(stats.equipment_count, 0),
    v_total
  FROM companies c
  LEFT JOIN mv_company_stats stats ON stats.company_id = c.id
  WHERE (p_is_active IS NULL OR c.is_active = p_is_active)
    AND (p_search IS NULL OR 
         c.name ILIKE '%' || p_search || '%' OR 
         c.trading_name ILIKE '%' || p_search || '%' OR
         c.company_code ILIKE '%' || p_search || '%')
  ORDER BY c.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Efficient equipment search with filters
CREATE OR REPLACE FUNCTION search_equipment(
  p_branch_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_due_within_days INTEGER DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  equipment_code TEXT,
  description TEXT,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  category TEXT,
  next_calibration_due DATE,
  branch_id UUID,
  branch_name TEXT,
  company_id UUID,
  company_name TEXT,
  total_count BIGINT
) AS $$
DECLARE
  v_total BIGINT;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM equipment e
  JOIN branches b ON b.id = e.branch_id
  JOIN companies c ON c.id = b.company_id
  WHERE e.is_active = true
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    AND (p_company_id IS NULL OR b.company_id = p_company_id)
    AND (p_category IS NULL OR e.category = p_category)
    AND (p_due_within_days IS NULL OR e.next_calibration_due <= CURRENT_DATE + p_due_within_days)
    AND (p_search IS NULL OR 
         e.description ILIKE '%' || p_search || '%' OR
         e.serial_number ILIKE '%' || p_search || '%' OR
         e.equipment_code ILIKE '%' || p_search || '%');

  RETURN QUERY
  SELECT 
    e.id,
    e.equipment_code,
    e.description,
    e.manufacturer,
    e.model,
    e.serial_number,
    e.category,
    e.next_calibration_due,
    b.id,
    b.name,
    c.id,
    c.name,
    v_total
  FROM equipment e
  JOIN branches b ON b.id = e.branch_id
  JOIN companies c ON c.id = b.company_id
  WHERE e.is_active = true
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    AND (p_company_id IS NULL OR b.company_id = p_company_id)
    AND (p_category IS NULL OR e.category = p_category)
    AND (p_due_within_days IS NULL OR e.next_calibration_due <= CURRENT_DATE + p_due_within_days)
    AND (p_search IS NULL OR 
         e.description ILIKE '%' || p_search || '%' OR
         e.serial_number ILIKE '%' || p_search || '%' OR
         e.equipment_code ILIKE '%' || p_search || '%')
  ORDER BY e.next_calibration_due NULLS LAST, e.description
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- RLS POLICY OPTIMIZATION
-- Ensure policies use indexed columns
-- ============================================

-- Add index for RLS policy lookups
CREATE INDEX IF NOT EXISTS idx_profiles_company_active
  ON profiles(company_id, is_active)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_branch_active
  ON profiles(branch_id, is_active)
  WHERE branch_id IS NOT NULL;

-- ============================================
-- CONNECTION OPTIMIZATION
-- ============================================

-- Prepared statement for most common query (reduces parse time)
PREPARE get_my_tasks AS
SELECT t.*, c.name as company_name, j.job_number
FROM tasks t
LEFT JOIN companies c ON c.id = t.company_id
LEFT JOIN jobs j ON j.id = t.job_id
WHERE t.assigned_to = $1
  AND t.status IN ('pending', 'in_progress')
ORDER BY 
  CASE t.priority 
    WHEN 'urgent' THEN 1 
    WHEN 'high' THEN 2 
    WHEN 'normal' THEN 3 
    ELSE 4 
  END,
  t.due_date NULLS LAST;

-- ============================================
-- ANALYZE TABLES
-- Update statistics for query planner
-- ============================================

ANALYZE companies;
ANALYZE branches;
ANALYZE equipment;
ANALYZE jobs;
ANALYZE certificates;
ANALYZE tasks;
ANALYZE profiles;
ANALYZE activity_log;

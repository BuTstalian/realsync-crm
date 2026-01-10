-- RealSync CRM - Large Scale Optimized Functions
-- Run AFTER seed_large_scale.sql

-- ============================================
-- APPROXIMATE COUNTS (instant for millions of rows)
-- ============================================
CREATE OR REPLACE FUNCTION get_approximate_count(p_table_name TEXT)
RETURNS BIGINT
SECURITY DEFINER
AS $$
  SELECT reltuples::BIGINT FROM pg_class WHERE relname = p_table_name;
$$ LANGUAGE sql;

-- ============================================
-- CURSOR-BASED PAGINATION (fast at any offset)
-- ============================================

-- Companies with cursor pagination
CREATE OR REPLACE FUNCTION get_companies_cursor(
  p_limit INT DEFAULT 50,
  p_cursor TEXT DEFAULT NULL,  -- Last seen company_code
  p_search TEXT DEFAULT NULL,
  p_active_only BOOLEAN DEFAULT true
)
RETURNS TABLE (
  id UUID,
  company_code TEXT,
  name TEXT,
  billing_city TEXT,
  billing_state TEXT,
  is_active BOOLEAN,
  branch_count BIGINT
)
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_staff AND p.is_active) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    c.id,
    c.company_code,
    c.name,
    c.billing_city,
    c.billing_state,
    c.is_active,
    (SELECT COUNT(*) FROM branches b WHERE b.company_id = c.id)
  FROM companies c
  WHERE (p_cursor IS NULL OR c.company_code > p_cursor)
    AND (p_search IS NULL OR c.name ILIKE '%' || p_search || '%')
    AND (NOT p_active_only OR c.is_active = true)
  ORDER BY c.company_code
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Equipment with cursor pagination
CREATE OR REPLACE FUNCTION get_equipment_cursor(
  p_limit INT DEFAULT 50,
  p_cursor TEXT DEFAULT NULL,  -- Last seen equipment_code
  p_company_id UUID DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_due_within_days INT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  equipment_code TEXT,
  description TEXT,
  manufacturer TEXT,
  model TEXT,
  category TEXT,
  next_calibration_due DATE,
  is_active BOOLEAN,
  branch_name TEXT,
  company_name TEXT,
  company_id UUID
)
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.is_staff AND pr.is_active) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    e.id,
    e.equipment_code,
    e.description,
    e.manufacturer,
    e.model,
    e.category,
    e.next_calibration_due,
    e.is_active,
    b.name,
    c.name,
    c.id
  FROM equipment e
  JOIN branches b ON e.branch_id = b.id
  JOIN companies c ON b.company_id = c.id
  WHERE (p_cursor IS NULL OR e.equipment_code > p_cursor)
    AND (p_company_id IS NULL OR c.id = p_company_id)
    AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
    AND (p_category IS NULL OR e.category = p_category)
    AND (p_due_within_days IS NULL OR e.next_calibration_due <= CURRENT_DATE + p_due_within_days)
    AND (p_search IS NULL OR e.description ILIKE '%' || p_search || '%' OR e.equipment_code ILIKE '%' || p_search || '%')
  ORDER BY e.equipment_code
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Jobs with cursor pagination
CREATE OR REPLACE FUNCTION get_jobs_cursor(
  p_limit INT DEFAULT 50,
  p_cursor TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_assigned_to UUID DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  job_number TEXT,
  status job_status,
  priority task_priority,
  scheduled_date DATE,
  assigned_to UUID,
  branch_name TEXT,
  company_name TEXT
)
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.is_staff AND pr.is_active) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT 
    j.id,
    j.job_number,
    j.status,
    j.priority,
    j.scheduled_date,
    j.assigned_to,
    b.name,
    c.name
  FROM jobs j
  JOIN branches b ON j.branch_id = b.id
  JOIN companies c ON b.company_id = c.id
  WHERE (p_cursor IS NULL OR j.job_number > p_cursor)
    AND (p_status IS NULL OR j.status::TEXT = p_status)
    AND (p_assigned_to IS NULL OR j.assigned_to = p_assigned_to)
    AND (p_from_date IS NULL OR j.scheduled_date >= p_from_date)
    AND (p_to_date IS NULL OR j.scheduled_date <= p_to_date)
  ORDER BY j.job_number
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- SEARCH FUNCTIONS (with limits for large data)
-- ============================================

-- Fast company search with trigram (if extension enabled)
CREATE OR REPLACE FUNCTION search_companies_fast(
  p_search TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  company_code TEXT,
  name TEXT,
  billing_city TEXT
)
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.is_staff AND pr.is_active) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Use index on company_code for prefix search, ILIKE for name
  RETURN QUERY
  SELECT c.id, c.company_code, c.name, c.billing_city
  FROM companies c
  WHERE c.company_code ILIKE p_search || '%'
     OR c.name ILIKE '%' || p_search || '%'
  ORDER BY 
    CASE WHEN c.company_code ILIKE p_search || '%' THEN 0 ELSE 1 END,
    c.name
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- DASHBOARD STATS (optimized for large scale)
-- ============================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS TABLE (
  total_companies BIGINT,
  total_equipment BIGINT,
  equipment_due_30_days BIGINT,
  open_jobs BIGINT,
  pending_tasks BIGINT
)
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.is_staff AND pr.is_active) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  RETURN QUERY
  SELECT
    (SELECT reltuples::BIGINT FROM pg_class WHERE relname = 'companies'),
    (SELECT reltuples::BIGINT FROM pg_class WHERE relname = 'equipment'),
    (SELECT COUNT(*) FROM equipment WHERE next_calibration_due <= CURRENT_DATE + 30 AND is_active),
    (SELECT COUNT(*) FROM jobs WHERE status NOT IN ('completed', 'invoiced', 'cancelled')),
    (SELECT COUNT(*) FROM tasks WHERE status IN ('pending', 'in_progress'));
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INDEXES FOR LARGE SCALE SEARCH
-- ============================================

-- Trigram index for fuzzy search (if extension available)
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_companies_name_trgm ON companies USING gin (name gin_trgm_ops);
-- CREATE INDEX idx_equipment_desc_trgm ON equipment USING gin (description gin_trgm_ops);

-- Ensure we have good indexes for cursor pagination
CREATE INDEX IF NOT EXISTS idx_companies_code_active ON companies(company_code) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_equipment_code_active ON equipment(equipment_code) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_jobs_number ON jobs(job_number);

-- Calibration Services CRM - Row Level Security Policies
-- Run this AFTER 001_initial_schema.sql

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if user is staff member
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND is_staff = true 
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND staff_role = 'admin' 
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is management or admin
CREATE OR REPLACE FUNCTION is_management_or_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND staff_role IN ('admin', 'management') 
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's staff role
CREATE OR REPLACE FUNCTION get_staff_role()
RETURNS staff_role AS $$
DECLARE
  role staff_role;
BEGIN
  SELECT staff_role INTO role FROM profiles WHERE id = auth.uid();
  RETURN role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user belongs to company (for client users)
CREATE OR REPLACE FUNCTION belongs_to_company(company_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND company_id = company_uuid
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user belongs to branch (for branch managers)
CREATE OR REPLACE FUNCTION belongs_to_branch(branch_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() 
    AND (branch_id = branch_uuid OR company_id = (SELECT company_id FROM branches WHERE id = branch_uuid))
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get company ID for a branch
CREATE OR REPLACE FUNCTION get_branch_company(branch_uuid UUID)
RETURNS UUID AS $$
DECLARE
  company UUID;
BEGIN
  SELECT company_id INTO company FROM branches WHERE id = branch_uuid;
  RETURN company;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- PROFILES POLICIES
-- ============================================

-- Staff can view all profiles
CREATE POLICY "Staff can view all profiles" ON profiles
  FOR SELECT USING (is_staff());

-- Client users can view profiles in their company
CREATE POLICY "Clients view company profiles" ON profiles
  FOR SELECT USING (
    NOT is_staff() AND 
    company_id IS NOT NULL AND 
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Users can view their own profile
CREATE POLICY "Users view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Users can update their own profile (limited fields)
CREATE POLICY "Users update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin can update any profile
CREATE POLICY "Admin updates all profiles" ON profiles
  FOR UPDATE USING (is_admin());

-- Admin can insert profiles
CREATE POLICY "Admin creates profiles" ON profiles
  FOR INSERT WITH CHECK (is_admin());

-- ============================================
-- COMPANIES POLICIES
-- ============================================

-- Staff can view all companies
CREATE POLICY "Staff view all companies" ON companies
  FOR SELECT USING (is_staff());

-- Client users can view their own company
CREATE POLICY "Clients view own company" ON companies
  FOR SELECT USING (belongs_to_company(id));

-- Onboarding, Sales, Management, Admin can create companies
CREATE POLICY "Authorized staff create companies" ON companies
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'sales', 'onboarding')
  );

-- Sales, Management, Admin can update companies
CREATE POLICY "Authorized staff update companies" ON companies
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management', 'sales')
  );

-- Admin can delete companies
CREATE POLICY "Admin deletes companies" ON companies
  FOR DELETE USING (is_admin());

-- ============================================
-- BRANCHES POLICIES
-- ============================================

-- Staff can view all branches
CREATE POLICY "Staff view all branches" ON branches
  FOR SELECT USING (is_staff());

-- Company managers can view all branches in their company
CREATE POLICY "Company managers view branches" ON branches
  FOR SELECT USING (belongs_to_company(company_id));

-- Branch managers can view their own branch
CREATE POLICY "Branch managers view own branch" ON branches
  FOR SELECT USING (belongs_to_branch(id));

-- Onboarding, Sales, Management, Admin can create branches
CREATE POLICY "Authorized staff create branches" ON branches
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'sales', 'onboarding')
  );

-- Sales, Scheduler, Management, Admin can update branches
CREATE POLICY "Authorized staff update branches" ON branches
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management', 'sales', 'scheduler')
  );

-- Admin can delete branches
CREATE POLICY "Admin deletes branches" ON branches
  FOR DELETE USING (is_admin());

-- ============================================
-- EQUIPMENT POLICIES
-- ============================================

-- Staff can view all equipment
CREATE POLICY "Staff view all equipment" ON equipment
  FOR SELECT USING (is_staff());

-- Clients can view equipment in their branches
CREATE POLICY "Clients view own equipment" ON equipment
  FOR SELECT USING (
    belongs_to_branch(branch_id)
  );

-- Onboarding, Sales, Technician, Management, Admin can create equipment
CREATE POLICY "Authorized staff create equipment" ON equipment
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'sales', 'onboarding', 'technician')
  );

-- Technician (assigned), Sales, Management, Admin can update equipment
CREATE POLICY "Authorized staff update equipment" ON equipment
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management', 'sales', 'onboarding', 'technician')
  );

-- Admin can delete equipment
CREATE POLICY "Admin deletes equipment" ON equipment
  FOR DELETE USING (is_admin());

-- ============================================
-- SERVICES (CATALOGUE) POLICIES
-- ============================================

-- Everyone can view active services
CREATE POLICY "Everyone views services" ON services
  FOR SELECT USING (is_active = true OR is_staff());

-- Management, Admin can manage services
CREATE POLICY "Management manages services" ON services
  FOR ALL USING (is_management_or_admin());

-- ============================================
-- QUOTES POLICIES
-- ============================================

-- Staff can view all quotes
CREATE POLICY "Staff view all quotes" ON quotes
  FOR SELECT USING (is_staff());

-- Clients can view quotes for their branches
CREATE POLICY "Clients view own quotes" ON quotes
  FOR SELECT USING (
    belongs_to_branch(branch_id)
  );

-- Sales, Management, Admin can create quotes
CREATE POLICY "Authorized staff create quotes" ON quotes
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'sales')
  );

-- Sales (own), Management, Admin can update quotes
CREATE POLICY "Authorized staff update quotes" ON quotes
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management') OR
    (get_staff_role() = 'sales' AND created_by = auth.uid())
  );

-- Admin can delete quotes
CREATE POLICY "Admin deletes quotes" ON quotes
  FOR DELETE USING (is_admin());

-- ============================================
-- QUOTE LINE ITEMS POLICIES
-- ============================================

-- Inherit from parent quote
CREATE POLICY "View quote line items" ON quote_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM quotes 
      WHERE quotes.id = quote_line_items.quote_id 
      AND (is_staff() OR belongs_to_branch(quotes.branch_id))
    )
  );

CREATE POLICY "Manage quote line items" ON quote_line_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM quotes 
      WHERE quotes.id = quote_line_items.quote_id 
      AND (
        get_staff_role() IN ('admin', 'management') OR
        (get_staff_role() = 'sales' AND quotes.created_by = auth.uid())
      )
    )
  );

-- ============================================
-- JOBS POLICIES
-- ============================================

-- Staff can view all jobs
CREATE POLICY "Staff view all jobs" ON jobs
  FOR SELECT USING (is_staff());

-- Technicians can only see their assigned jobs
CREATE POLICY "Technicians view assigned jobs" ON jobs
  FOR SELECT USING (
    get_staff_role() = 'technician' AND assigned_to = auth.uid()
  );

-- Clients can view jobs for their branches
CREATE POLICY "Clients view own jobs" ON jobs
  FOR SELECT USING (
    belongs_to_branch(branch_id)
  );

-- Sales, Scheduler, Management, Admin can create jobs
CREATE POLICY "Authorized staff create jobs" ON jobs
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'scheduler', 'sales')
  );

-- Technician (assigned), Scheduler, Management, Admin can update jobs
CREATE POLICY "Authorized staff update jobs" ON jobs
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management', 'scheduler') OR
    (get_staff_role() = 'technician' AND assigned_to = auth.uid())
  );

-- Admin can delete jobs
CREATE POLICY "Admin deletes jobs" ON jobs
  FOR DELETE USING (is_admin());

-- ============================================
-- JOB EQUIPMENT POLICIES
-- ============================================

CREATE POLICY "View job equipment" ON job_equipment
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = job_equipment.job_id 
      AND (
        is_staff() OR 
        belongs_to_branch(jobs.branch_id) OR
        (get_staff_role() = 'technician' AND jobs.assigned_to = auth.uid())
      )
    )
  );

CREATE POLICY "Manage job equipment" ON job_equipment
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM jobs 
      WHERE jobs.id = job_equipment.job_id 
      AND (
        get_staff_role() IN ('admin', 'management', 'scheduler') OR
        (get_staff_role() = 'technician' AND jobs.assigned_to = auth.uid())
      )
    )
  );

-- ============================================
-- CERTIFICATES POLICIES
-- ============================================

-- Staff can view all certificates
CREATE POLICY "Staff view all certificates" ON certificates
  FOR SELECT USING (is_staff());

-- Clients can view approved certificates for their equipment
CREATE POLICY "Clients view approved certificates" ON certificates
  FOR SELECT USING (
    status = 'approved' AND
    EXISTS (
      SELECT 1 FROM equipment 
      WHERE equipment.id = certificates.equipment_id 
      AND belongs_to_branch(equipment.branch_id)
    )
  );

-- Technician (assigned job), Management, Admin can create certificates
CREATE POLICY "Authorized staff create certificates" ON certificates
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management') OR
    (get_staff_role() = 'technician' AND EXISTS (
      SELECT 1 FROM jobs WHERE jobs.id = certificates.job_id AND jobs.assigned_to = auth.uid()
    ))
  );

-- Technician (own, unlocked), Management, Admin can update certificates
CREATE POLICY "Authorized staff update certificates" ON certificates
  FOR UPDATE USING (
    locked_at IS NULL AND (
      get_staff_role() IN ('admin', 'management') OR
      (get_staff_role() = 'technician' AND created_by = auth.uid())
    )
  );

-- Admin can delete certificates
CREATE POLICY "Admin deletes certificates" ON certificates
  FOR DELETE USING (is_admin());

-- ============================================
-- TASKS POLICIES
-- ============================================

-- Staff can view all tasks
CREATE POLICY "Staff view all tasks" ON tasks
  FOR SELECT USING (is_staff());

-- Users can view tasks assigned to them
CREATE POLICY "Users view assigned tasks" ON tasks
  FOR SELECT USING (assigned_to = auth.uid());

-- All staff can create tasks
CREATE POLICY "Staff create tasks" ON tasks
  FOR INSERT WITH CHECK (is_staff());

-- Assigned user or Management/Admin can update tasks
CREATE POLICY "Authorized update tasks" ON tasks
  FOR UPDATE USING (
    assigned_to = auth.uid() OR
    get_staff_role() IN ('admin', 'management')
  );

-- Admin can delete tasks
CREATE POLICY "Admin deletes tasks" ON tasks
  FOR DELETE USING (is_admin());

-- ============================================
-- ACTIVITY LOG POLICIES
-- ============================================

-- Staff can view activity logs
CREATE POLICY "Staff view activity" ON activity_log
  FOR SELECT USING (is_staff());

-- System can insert activity (via functions)
CREATE POLICY "System inserts activity" ON activity_log
  FOR INSERT WITH CHECK (true);

-- No updates or deletes allowed
-- (Activity log is immutable)

-- ============================================
-- DOCUMENTS POLICIES
-- ============================================

-- Staff can view all documents
CREATE POLICY "Staff view documents" ON documents
  FOR SELECT USING (is_staff());

-- Clients can view documents for their entities
CREATE POLICY "Clients view own documents" ON documents
  FOR SELECT USING (
    (entity_type = 'company' AND belongs_to_company(entity_id)) OR
    (entity_type = 'branch' AND belongs_to_branch(entity_id)) OR
    (entity_type = 'certificate' AND EXISTS (
      SELECT 1 FROM certificates c
      JOIN equipment e ON e.id = c.equipment_id
      WHERE c.id = documents.entity_id AND belongs_to_branch(e.branch_id)
    ))
  );

-- Staff can upload documents
CREATE POLICY "Staff upload documents" ON documents
  FOR INSERT WITH CHECK (is_staff());

-- Uploader or Admin can delete documents
CREATE POLICY "Delete documents" ON documents
  FOR DELETE USING (uploaded_by = auth.uid() OR is_admin());

-- ============================================
-- SETTINGS POLICIES
-- ============================================

-- Everyone can view settings
CREATE POLICY "View settings" ON settings
  FOR SELECT USING (true);

-- Admin can manage settings
CREATE POLICY "Admin manages settings" ON settings
  FOR ALL USING (is_admin());

-- ============================================
-- REALTIME SUBSCRIPTIONS
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE certificates;
ALTER PUBLICATION supabase_realtime ADD TABLE equipment;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;

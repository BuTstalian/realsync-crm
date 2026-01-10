# RealSync CRM - Security Audit & Fix

## Phase 1: Security Foundation

Run these SQL scripts in Supabase SQL Editor in order.

---

## STEP 1: Audit Current State

Run this first to see what's actually configured:

```sql
-- ============================================
-- AUDIT QUERY: Current RLS Status
-- ============================================

-- Check RLS enabled status for all tables
SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY tablename;

-- List all policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check helper functions exist
SELECT 
  routine_name,
  routine_type,
  security_type
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('is_staff', 'is_admin', 'is_management_or_admin', 'get_staff_role', 'belongs_to_company', 'belongs_to_branch', 'auth_is_staff')
ORDER BY routine_name;
```

---

## STEP 2: Fix Helper Functions

The helper functions must use SECURITY DEFINER to avoid RLS recursion:

```sql
-- ============================================
-- FIXED HELPER FUNCTIONS (Non-recursive)
-- ============================================

-- Drop old functions first
DROP FUNCTION IF EXISTS is_staff();
DROP FUNCTION IF EXISTS is_admin();
DROP FUNCTION IF EXISTS is_management_or_admin();
DROP FUNCTION IF EXISTS get_staff_role();
DROP FUNCTION IF EXISTS belongs_to_company(UUID);
DROP FUNCTION IF EXISTS belongs_to_branch(UUID);
DROP FUNCTION IF EXISTS auth_is_staff();
DROP FUNCTION IF EXISTS get_user_company_id();
DROP FUNCTION IF EXISTS get_user_branch_id();

-- Check if user is active staff member
CREATE OR REPLACE FUNCTION is_staff()
RETURNS BOOLEAN AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SELECT (is_staff = true AND is_active = true) INTO v_result
  FROM profiles WHERE id = auth.uid();
  RETURN COALESCE(v_result, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SELECT (staff_role = 'admin' AND is_active = true) INTO v_result
  FROM profiles WHERE id = auth.uid();
  RETURN COALESCE(v_result, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is management or admin
CREATE OR REPLACE FUNCTION is_management_or_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SELECT (staff_role IN ('admin', 'management') AND is_active = true) INTO v_result
  FROM profiles WHERE id = auth.uid();
  RETURN COALESCE(v_result, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get user's staff role
CREATE OR REPLACE FUNCTION get_staff_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT staff_role::TEXT INTO v_role
  FROM profiles WHERE id = auth.uid() AND is_active = true;
  RETURN v_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get user's company ID
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS UUID AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id
  FROM profiles WHERE id = auth.uid();
  RETURN v_company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get user's branch ID  
CREATE OR REPLACE FUNCTION get_user_branch_id()
RETURNS UUID AS $$
DECLARE
  v_branch_id UUID;
BEGIN
  SELECT branch_id INTO v_branch_id
  FROM profiles WHERE id = auth.uid();
  RETURN v_branch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user belongs to company (for client users)
CREATE OR REPLACE FUNCTION belongs_to_company(p_company_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_result BOOLEAN;
BEGIN
  SELECT (company_id = p_company_id AND is_active = true) INTO v_result
  FROM profiles WHERE id = auth.uid();
  RETURN COALESCE(v_result, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user belongs to branch (company-wide or specific branch)
CREATE OR REPLACE FUNCTION belongs_to_branch(p_branch_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_company_id UUID;
  v_user_branch_id UUID;
  v_branch_company_id UUID;
BEGIN
  -- Get user's company and branch
  SELECT company_id, branch_id INTO v_user_company_id, v_user_branch_id
  FROM profiles WHERE id = auth.uid() AND is_active = true;
  
  IF v_user_company_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get branch's company
  SELECT company_id INTO v_branch_company_id
  FROM branches WHERE id = p_branch_id;
  
  -- User belongs if: same company (company admin) or same branch
  RETURN v_user_company_id = v_branch_company_id OR v_user_branch_id = p_branch_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Verify functions were created
SELECT routine_name, security_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('is_staff', 'is_admin', 'belongs_to_company');
```

---

## STEP 3: Fix Profile Policies

Profiles are critical - they had recursion issues. This fixes them:

```sql
-- ============================================
-- PROFILES POLICIES (Fixed)
-- ============================================

-- Drop existing profile policies
DROP POLICY IF EXISTS "Staff can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Staff view all profiles" ON profiles;
DROP POLICY IF EXISTS "Clients view company profiles" ON profiles;
DROP POLICY IF EXISTS "Users view own profile" ON profiles;
DROP POLICY IF EXISTS "Users update own profile" ON profiles;
DROP POLICY IF EXISTS "Admin updates all profiles" ON profiles;
DROP POLICY IF EXISTS "Admin creates profiles" ON profiles;
DROP POLICY IF EXISTS "Anyone can view profiles" ON profiles;

-- Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can always view their own profile
CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Policy 2: Staff can view all profiles
CREATE POLICY "profiles_select_staff" ON profiles
  FOR SELECT USING (is_staff());

-- Policy 3: Clients can view profiles in their company
CREATE POLICY "profiles_select_company" ON profiles
  FOR SELECT USING (
    company_id IS NOT NULL 
    AND company_id = get_user_company_id()
  );

-- Policy 4: Users can update their own profile (limited)
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Policy 5: Admin can update any profile
CREATE POLICY "profiles_update_admin" ON profiles
  FOR UPDATE USING (is_admin());

-- Policy 6: Admin can create profiles
CREATE POLICY "profiles_insert_admin" ON profiles
  FOR INSERT WITH CHECK (is_admin());

-- Policy 7: Handle new user signup (Supabase Auth trigger needs this)
CREATE POLICY "profiles_insert_self" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Verify
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles';
```

---

## STEP 4: Fix Company/Branch/Equipment Policies

```sql
-- ============================================
-- COMPANIES POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "Staff view all companies" ON companies;
DROP POLICY IF EXISTS "Clients view own company" ON companies;
DROP POLICY IF EXISTS "Authorized staff create companies" ON companies;
DROP POLICY IF EXISTS "Authorized staff update companies" ON companies;
DROP POLICY IF EXISTS "Admin deletes companies" ON companies;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

-- Staff see all
CREATE POLICY "companies_select_staff" ON companies
  FOR SELECT USING (is_staff());

-- Clients see their company only
CREATE POLICY "companies_select_client" ON companies
  FOR SELECT USING (id = get_user_company_id());

-- Create: admin, management, sales, onboarding
CREATE POLICY "companies_insert" ON companies
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'sales', 'onboarding')
  );

-- Update: admin, management, sales
CREATE POLICY "companies_update" ON companies
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management', 'sales')
  );

-- Delete: admin only
CREATE POLICY "companies_delete" ON companies
  FOR DELETE USING (is_admin());

-- ============================================
-- BRANCHES POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "Staff view all branches" ON branches;
DROP POLICY IF EXISTS "Company managers view branches" ON branches;
DROP POLICY IF EXISTS "Branch managers view own branch" ON branches;
DROP POLICY IF EXISTS "Authorized staff create branches" ON branches;
DROP POLICY IF EXISTS "Authorized staff update branches" ON branches;
DROP POLICY IF EXISTS "Admin deletes branches" ON branches;

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Staff see all
CREATE POLICY "branches_select_staff" ON branches
  FOR SELECT USING (is_staff());

-- Clients see branches in their company
CREATE POLICY "branches_select_client" ON branches
  FOR SELECT USING (company_id = get_user_company_id());

-- Create: admin, management, sales, onboarding
CREATE POLICY "branches_insert" ON branches
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'sales', 'onboarding')
  );

-- Update: admin, management, sales, scheduler
CREATE POLICY "branches_update" ON branches
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management', 'sales', 'scheduler')
  );

-- Delete: admin only
CREATE POLICY "branches_delete" ON branches
  FOR DELETE USING (is_admin());

-- ============================================
-- EQUIPMENT POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "Staff view all equipment" ON equipment;
DROP POLICY IF EXISTS "Clients view own equipment" ON equipment;
DROP POLICY IF EXISTS "Authorized staff create equipment" ON equipment;
DROP POLICY IF EXISTS "Authorized staff update equipment" ON equipment;
DROP POLICY IF EXISTS "Admin deletes equipment" ON equipment;

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Staff see all
CREATE POLICY "equipment_select_staff" ON equipment
  FOR SELECT USING (is_staff());

-- Clients see equipment in their branches
CREATE POLICY "equipment_select_client" ON equipment
  FOR SELECT USING (belongs_to_branch(branch_id));

-- Create: admin, management, sales, onboarding, technician
CREATE POLICY "equipment_insert" ON equipment
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'sales', 'onboarding', 'technician')
  );

-- Update: admin, management, sales, onboarding, technician
CREATE POLICY "equipment_update" ON equipment
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management', 'sales', 'onboarding', 'technician')
  );

-- Delete: admin only
CREATE POLICY "equipment_delete" ON equipment
  FOR DELETE USING (is_admin());
```

---

## STEP 5: Fix Job Policies (Technician Scope)

```sql
-- ============================================
-- JOBS POLICIES (Fixed - Technician scoping)
-- ============================================

DROP POLICY IF EXISTS "Staff view all jobs" ON jobs;
DROP POLICY IF EXISTS "Technicians view assigned jobs" ON jobs;
DROP POLICY IF EXISTS "Clients view own jobs" ON jobs;
DROP POLICY IF EXISTS "Authorized staff create jobs" ON jobs;
DROP POLICY IF EXISTS "Authorized staff update jobs" ON jobs;
DROP POLICY IF EXISTS "Admin deletes jobs" ON jobs;

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Admin, Management, Scheduler, Sales see all jobs
CREATE POLICY "jobs_select_office" ON jobs
  FOR SELECT USING (
    get_staff_role() IN ('admin', 'management', 'scheduler', 'sales', 'onboarding')
  );

-- Technicians see only assigned jobs
CREATE POLICY "jobs_select_technician" ON jobs
  FOR SELECT USING (
    get_staff_role() = 'technician' AND assigned_to = auth.uid()
  );

-- Clients see jobs for their branches
CREATE POLICY "jobs_select_client" ON jobs
  FOR SELECT USING (belongs_to_branch(branch_id));

-- Create: admin, management, scheduler, sales
CREATE POLICY "jobs_insert" ON jobs
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'scheduler', 'sales')
  );

-- Update: office staff or assigned technician
CREATE POLICY "jobs_update" ON jobs
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management', 'scheduler') OR
    (get_staff_role() = 'technician' AND assigned_to = auth.uid())
  );

-- Delete: admin only
CREATE POLICY "jobs_delete" ON jobs
  FOR DELETE USING (is_admin());
```

---

## STEP 6: Fix Certificate Policies

```sql
-- ============================================
-- CERTIFICATES POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "Staff view all certificates" ON certificates;
DROP POLICY IF EXISTS "Clients view approved certificates" ON certificates;
DROP POLICY IF EXISTS "Authorized staff create certificates" ON certificates;
DROP POLICY IF EXISTS "Authorized staff update certificates" ON certificates;
DROP POLICY IF EXISTS "Admin deletes certificates" ON certificates;

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- Office staff see all
CREATE POLICY "certificates_select_office" ON certificates
  FOR SELECT USING (
    get_staff_role() IN ('admin', 'management', 'scheduler', 'sales', 'onboarding')
  );

-- Technicians see certificates for their jobs
CREATE POLICY "certificates_select_technician" ON certificates
  FOR SELECT USING (
    get_staff_role() = 'technician' AND 
    EXISTS (SELECT 1 FROM jobs WHERE jobs.id = certificates.job_id AND jobs.assigned_to = auth.uid())
  );

-- Clients see approved certificates for their equipment
CREATE POLICY "certificates_select_client" ON certificates
  FOR SELECT USING (
    status = 'approved' AND
    EXISTS (
      SELECT 1 FROM equipment e 
      WHERE e.id = certificates.equipment_id 
      AND belongs_to_branch(e.branch_id)
    )
  );

-- Create: admin, management, or assigned technician
CREATE POLICY "certificates_insert" ON certificates
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management') OR
    (get_staff_role() = 'technician' AND EXISTS (
      SELECT 1 FROM jobs WHERE jobs.id = job_id AND jobs.assigned_to = auth.uid()
    ))
  );

-- Update: unlocked certificates only, by creator or admin
CREATE POLICY "certificates_update" ON certificates
  FOR UPDATE USING (
    locked_at IS NULL AND (
      is_admin() OR
      (get_staff_role() = 'management') OR
      (get_staff_role() = 'technician' AND issued_by = auth.uid())
    )
  );

-- Delete: admin only
CREATE POLICY "certificates_delete" ON certificates
  FOR DELETE USING (is_admin());
```

---

## STEP 7: Fix Remaining Tables

```sql
-- ============================================
-- TASKS POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "Staff view all tasks" ON tasks;
DROP POLICY IF EXISTS "Users view assigned tasks" ON tasks;
DROP POLICY IF EXISTS "Staff create tasks" ON tasks;
DROP POLICY IF EXISTS "Authorized update tasks" ON tasks;
DROP POLICY IF EXISTS "Admin deletes tasks" ON tasks;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Office staff see all tasks
CREATE POLICY "tasks_select_office" ON tasks
  FOR SELECT USING (
    get_staff_role() IN ('admin', 'management', 'scheduler', 'sales', 'onboarding')
  );

-- Users see tasks assigned to them
CREATE POLICY "tasks_select_assigned" ON tasks
  FOR SELECT USING (assigned_to = auth.uid());

-- Staff can create tasks
CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT WITH CHECK (is_staff());

-- Assigned user or management can update
CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE USING (
    assigned_to = auth.uid() OR
    get_staff_role() IN ('admin', 'management')
  );

-- Admin can delete
CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE USING (is_admin());

-- ============================================
-- QUOTES POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "Staff view all quotes" ON quotes;
DROP POLICY IF EXISTS "Clients view own quotes" ON quotes;
DROP POLICY IF EXISTS "Authorized staff create quotes" ON quotes;
DROP POLICY IF EXISTS "Authorized staff update quotes" ON quotes;
DROP POLICY IF EXISTS "Admin deletes quotes" ON quotes;

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quotes_select_staff" ON quotes
  FOR SELECT USING (is_staff());

CREATE POLICY "quotes_select_client" ON quotes
  FOR SELECT USING (belongs_to_branch(branch_id));

CREATE POLICY "quotes_insert" ON quotes
  FOR INSERT WITH CHECK (
    get_staff_role() IN ('admin', 'management', 'sales')
  );

CREATE POLICY "quotes_update" ON quotes
  FOR UPDATE USING (
    get_staff_role() IN ('admin', 'management') OR
    (get_staff_role() = 'sales' AND created_by = auth.uid())
  );

CREATE POLICY "quotes_delete" ON quotes
  FOR DELETE USING (is_admin());

-- ============================================
-- SERVICES POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "Everyone views services" ON services;
DROP POLICY IF EXISTS "Management manages services" ON services;

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_select" ON services
  FOR SELECT USING (is_active = true OR is_staff());

CREATE POLICY "services_manage" ON services
  FOR ALL USING (is_management_or_admin());

-- ============================================
-- SETTINGS POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "View settings" ON settings;
DROP POLICY IF EXISTS "Admin manages settings" ON settings;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_select" ON settings
  FOR SELECT USING (true);

CREATE POLICY "settings_manage" ON settings
  FOR ALL USING (is_admin());

-- ============================================
-- ACTIVITY LOG POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "Staff view activity" ON activity_log;
DROP POLICY IF EXISTS "System inserts activity" ON activity_log;

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_select_staff" ON activity_log
  FOR SELECT USING (is_staff());

-- Clients can see activity on their entities
CREATE POLICY "activity_select_client" ON activity_log
  FOR SELECT USING (
    (entity_type = 'company' AND entity_id = get_user_company_id()) OR
    (entity_type = 'branch' AND belongs_to_branch(entity_id))
  );

-- All authenticated users can insert (via app functions)
CREATE POLICY "activity_insert" ON activity_log
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================
-- DOCUMENTS POLICIES (Fixed)
-- ============================================

DROP POLICY IF EXISTS "Staff view documents" ON documents;
DROP POLICY IF EXISTS "Clients view own documents" ON documents;
DROP POLICY IF EXISTS "Staff upload documents" ON documents;
DROP POLICY IF EXISTS "Delete documents" ON documents;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select_staff" ON documents
  FOR SELECT USING (is_staff());

CREATE POLICY "documents_select_client" ON documents
  FOR SELECT USING (
    (entity_type = 'company' AND belongs_to_company(entity_id)) OR
    (entity_type = 'branch' AND belongs_to_branch(entity_id))
  );

CREATE POLICY "documents_insert" ON documents
  FOR INSERT WITH CHECK (is_staff());

CREATE POLICY "documents_delete" ON documents
  FOR DELETE USING (uploaded_by = auth.uid() OR is_admin());

-- ============================================
-- RECORD LOCKS POLICIES (Already done but verify)
-- ============================================

ALTER TABLE record_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View all locks" ON record_locks;
DROP POLICY IF EXISTS "Insert own locks" ON record_locks;
DROP POLICY IF EXISTS "Update own locks" ON record_locks;
DROP POLICY IF EXISTS "Delete own locks" ON record_locks;

CREATE POLICY "locks_select" ON record_locks
  FOR SELECT USING (true);

CREATE POLICY "locks_insert" ON record_locks
  FOR INSERT WITH CHECK (locked_by = auth.uid());

CREATE POLICY "locks_update" ON record_locks
  FOR UPDATE USING (locked_by = auth.uid());

CREATE POLICY "locks_delete" ON record_locks
  FOR DELETE USING (locked_by = auth.uid());

-- ============================================
-- USER PRESENCE POLICIES
-- ============================================

ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View all presence" ON user_presence;
DROP POLICY IF EXISTS "Manage own presence" ON user_presence;

CREATE POLICY "presence_select" ON user_presence
  FOR SELECT USING (true);

CREATE POLICY "presence_insert" ON user_presence
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "presence_update" ON user_presence
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "presence_delete" ON user_presence
  FOR DELETE USING (user_id = auth.uid());
```

---

## STEP 8: Verify All Policies

```sql
-- ============================================
-- FINAL VERIFICATION
-- ============================================

-- Check all tables have RLS enabled
SELECT 
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  COUNT(p.policyname) as policy_count
FROM pg_class c
LEFT JOIN pg_policies p ON c.relname = p.tablename
WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND c.relkind = 'r'
AND c.relname NOT LIKE 'pg_%'
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;

-- List all policies by table
SELECT 
  tablename,
  policyname,
  cmd,
  permissive
FROM pg_policies 
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
```

---

## Next: Run Test Cases

After applying all fixes, proceed to the test cases document to verify each role works correctly.

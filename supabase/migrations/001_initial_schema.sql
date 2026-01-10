-- Calibration Services CRM Database Schema
-- Run this in Supabase SQL Editor to set up your database
-- Based on TTRPG system architecture patterns

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- CUSTOM TYPES (ENUMS)
-- ============================================

-- Staff roles
CREATE TYPE staff_role AS ENUM (
  'admin',
  'management', 
  'scheduler',
  'sales',
  'onboarding',
  'technician'
);

-- Client roles
CREATE TYPE client_role AS ENUM (
  'company_manager',
  'branch_manager'
);

-- Job status workflow
CREATE TYPE job_status AS ENUM (
  'new',
  'quoted',
  'accepted',
  'scheduled',
  'in_progress',
  'pending_review',
  'completed',
  'invoiced',
  'cancelled'
);

-- Quote status
CREATE TYPE quote_status AS ENUM (
  'draft',
  'sent',
  'accepted',
  'declined',
  'expired'
);

-- Task status
CREATE TYPE task_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'cancelled'
);

-- Task priority
CREATE TYPE task_priority AS ENUM (
  'low',
  'normal',
  'high',
  'urgent'
);

-- Certificate status
CREATE TYPE certificate_status AS ENUM (
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'superseded'
);

-- Service unit types
CREATE TYPE service_unit AS ENUM (
  'per_item',
  'per_hour',
  'flat_rate'
);

-- Activity types for audit log
CREATE TYPE activity_type AS ENUM (
  'created',
  'updated',
  'deleted',
  'status_changed',
  'assigned',
  'commented',
  'uploaded',
  'emailed',
  'approved',
  'rejected'
);

-- ============================================
-- PROFILES (extends Supabase auth.users)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  
  -- Staff-specific fields (NULL for clients)
  staff_role staff_role,
  is_staff BOOLEAN DEFAULT false,
  
  -- Client-specific fields (NULL for staff)
  client_role client_role,
  company_id UUID, -- FK added after companies table
  branch_id UUID,  -- FK added after branches table (for branch managers)
  
  -- 2FA requirement
  requires_2fa BOOLEAN DEFAULT false,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- COMPANIES (Client Organizations)
-- ============================================
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Unique identifier (random 16-char alphanumeric)
  company_code TEXT UNIQUE NOT NULL DEFAULT upper(encode(gen_random_bytes(8), 'hex')),
  
  -- Basic info
  name TEXT NOT NULL,
  trading_name TEXT,
  abn TEXT, -- Australian Business Number
  
  -- Primary contact
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  primary_contact_phone TEXT,
  
  -- Billing address
  billing_address_line1 TEXT,
  billing_address_line2 TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_postcode TEXT,
  billing_country TEXT DEFAULT 'Australia',
  
  -- Settings
  default_calibration_interval_months INTEGER DEFAULT 12,
  payment_terms_days INTEGER DEFAULT 30,
  
  -- Notes
  notes TEXT,
  
  -- Tags for filtering
  tags TEXT[] DEFAULT '{}',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- BRANCHES (Company Locations)
-- ============================================
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Unique identifier
  branch_code TEXT UNIQUE NOT NULL DEFAULT upper(encode(gen_random_bytes(8), 'hex')),
  
  -- Basic info
  name TEXT NOT NULL,
  
  -- Contact
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  
  -- Physical address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postcode TEXT,
  country TEXT DEFAULT 'Australia',
  
  -- Location for scheduling
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  region TEXT, -- For technician assignment
  
  -- Operating hours (JSON: {"mon": {"open": "08:00", "close": "17:00"}, ...})
  operating_hours JSONB DEFAULT '{}',
  
  -- Site requirements
  site_requirements TEXT, -- Special access, PPE, etc.
  
  -- Notes
  notes TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FKs to profiles after branches exists
ALTER TABLE profiles 
  ADD CONSTRAINT profiles_company_fk 
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE profiles 
  ADD CONSTRAINT profiles_branch_fk 
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- ============================================
-- SERVICE CATALOGUE
-- ============================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Identifiers
  service_code TEXT UNIQUE NOT NULL,
  model_number TEXT,
  
  -- Details
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  
  -- Pricing
  base_price DECIMAL(10, 2) NOT NULL,
  price_min DECIMAL(10, 2),
  price_max DECIMAL(10, 2),
  unit service_unit DEFAULT 'per_item',
  
  -- Time estimate
  estimated_minutes INTEGER DEFAULT 30,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  last_price_update TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- EQUIPMENT (Items to Calibrate)
-- ============================================
CREATE TABLE equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  
  -- Unique identifier
  equipment_code TEXT UNIQUE NOT NULL DEFAULT upper(encode(gen_random_bytes(8), 'hex')),
  
  -- Equipment details
  description TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  asset_number TEXT, -- Client's internal asset number
  
  -- Categorization
  category TEXT NOT NULL,
  sub_category TEXT,
  
  -- Calibration settings
  calibration_interval_months INTEGER DEFAULT 12,
  last_calibration_date DATE,
  next_calibration_due DATE,
  
  -- Service association
  primary_service_id UUID REFERENCES services(id),
  
  -- Location within branch
  location_description TEXT,
  
  -- Specifications (flexible JSON)
  specifications JSONB DEFAULT '{}',
  
  -- Notes
  notes TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- QUOTES
-- ============================================
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  
  -- Unique identifier
  quote_number TEXT UNIQUE NOT NULL,
  
  -- Status
  status quote_status DEFAULT 'draft',
  
  -- Validity
  valid_until DATE,
  
  -- Totals (calculated, stored for performance)
  subtotal DECIMAL(10, 2) DEFAULT 0,
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  tax_rate DECIMAL(5, 2) DEFAULT 10, -- GST
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) DEFAULT 0,
  
  -- Notes
  notes TEXT,
  terms TEXT,
  
  -- Converted job reference
  converted_to_job_id UUID, -- FK added after jobs table
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- QUOTE LINE ITEMS
-- ============================================
CREATE TABLE quote_line_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  
  -- Service reference (optional - can be custom)
  service_id UUID REFERENCES services(id),
  
  -- Line item details
  description TEXT NOT NULL,
  quantity DECIMAL(10, 2) DEFAULT 1,
  unit_price DECIMAL(10, 2) NOT NULL,
  line_total DECIMAL(10, 2) NOT NULL,
  
  -- Ordering
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- JOBS (Calibration Work Orders)
-- ============================================
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  
  -- Unique identifier
  job_number TEXT UNIQUE NOT NULL,
  
  -- Status workflow
  status job_status DEFAULT 'new',
  
  -- Source
  quote_id UUID REFERENCES quotes(id),
  
  -- Assignment
  assigned_to UUID REFERENCES profiles(id),
  
  -- Scheduling
  scheduled_date DATE,
  scheduled_time_start TIME,
  scheduled_time_end TIME,
  
  -- Completion
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),
  
  -- Notes
  internal_notes TEXT,
  client_notes TEXT,
  
  -- Priority
  priority task_priority DEFAULT 'normal',
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK from quotes to jobs
ALTER TABLE quotes 
  ADD CONSTRAINT quotes_converted_job_fk 
  FOREIGN KEY (converted_to_job_id) REFERENCES jobs(id) ON DELETE SET NULL;

-- ============================================
-- JOB EQUIPMENT (Many-to-Many)
-- ============================================
CREATE TABLE job_equipment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  
  -- Service performed
  service_id UUID REFERENCES services(id),
  
  -- Result
  passed BOOLEAN,
  
  -- Notes for this specific item
  notes TEXT,
  
  UNIQUE(job_id, equipment_id)
);

-- ============================================
-- CERTIFICATES
-- ============================================
CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  equipment_id UUID NOT NULL REFERENCES equipment(id),
  
  -- Unique identifier
  certificate_number TEXT UNIQUE NOT NULL,
  
  -- Status
  status certificate_status DEFAULT 'draft',
  
  -- Certificate data
  calibration_date DATE NOT NULL,
  expiry_date DATE,
  
  -- Results (flexible JSON for different test types)
  results JSONB DEFAULT '{}',
  
  -- Pass/Fail
  passed BOOLEAN,
  
  -- PDF storage
  pdf_url TEXT,
  
  -- Signature/Approval
  issued_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  
  -- Edit lock (24 hours after approval)
  locked_at TIMESTAMPTZ,
  
  -- Superseded by (for re-issues)
  superseded_by UUID REFERENCES certificates(id),
  
  -- Audit
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TASKS (Internal Workflow)
-- ============================================
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Related entities (all optional, at least one should be set)
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  
  -- Task details
  title TEXT NOT NULL,
  description TEXT,
  
  -- Status and priority
  status task_status DEFAULT 'pending',
  priority task_priority DEFAULT 'normal',
  
  -- Assignment
  assigned_to UUID REFERENCES profiles(id),
  assigned_by UUID REFERENCES profiles(id),
  
  -- Due date
  due_date TIMESTAMPTZ,
  
  -- Completion
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),
  
  -- Auto-generated flag
  is_system_generated BOOLEAN DEFAULT false,
  
  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- ACTIVITY LOG (Audit Trail)
-- ============================================
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Actor
  user_id UUID REFERENCES profiles(id),
  
  -- Target entity
  entity_type TEXT NOT NULL, -- 'company', 'branch', 'job', etc.
  entity_id UUID NOT NULL,
  
  -- Action
  activity_type activity_type NOT NULL,
  
  -- Details
  description TEXT,
  changes JSONB, -- {field: {old: x, new: y}}
  
  -- Timestamp (immutable)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- DOCUMENTS (File Attachments)
-- ============================================
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Related entity
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  
  -- File info
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  storage_path TEXT NOT NULL, -- Supabase Storage path
  
  -- Metadata
  description TEXT,
  
  -- Audit
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SETTINGS (System Configuration)
-- ============================================
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
  ('tax_rate', '10', 'GST rate percentage'),
  ('annual_price_increase', '1.2', 'Annual price increase percentage'),
  ('default_calibration_months', '12', 'Default calibration interval'),
  ('quote_validity_days', '30', 'Default quote validity period'),
  ('certificate_lock_hours', '24', 'Hours after approval before certificate is locked');

-- ============================================
-- INDEXES
-- ============================================

-- Companies
CREATE INDEX idx_companies_code ON companies(company_code);
CREATE INDEX idx_companies_name ON companies(name);
CREATE INDEX idx_companies_active ON companies(is_active);

-- Branches
CREATE INDEX idx_branches_company ON branches(company_id);
CREATE INDEX idx_branches_code ON branches(branch_code);
CREATE INDEX idx_branches_region ON branches(region);

-- Equipment
CREATE INDEX idx_equipment_branch ON equipment(branch_id);
CREATE INDEX idx_equipment_code ON equipment(equipment_code);
CREATE INDEX idx_equipment_next_due ON equipment(next_calibration_due);
CREATE INDEX idx_equipment_category ON equipment(category);

-- Jobs
CREATE INDEX idx_jobs_branch ON jobs(branch_id);
CREATE INDEX idx_jobs_number ON jobs(job_number);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_assigned ON jobs(assigned_to);
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_date);

-- Certificates
CREATE INDEX idx_certificates_job ON certificates(job_id);
CREATE INDEX idx_certificates_equipment ON certificates(equipment_id);
CREATE INDEX idx_certificates_number ON certificates(certificate_number);
CREATE INDEX idx_certificates_status ON certificates(status);

-- Tasks
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_tasks_company ON tasks(company_id);
CREATE INDEX idx_tasks_job ON tasks(job_id);

-- Activity Log
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_user ON activity_log(user_id);
CREATE INDEX idx_activity_created ON activity_log(created_at DESC);

-- Profiles
CREATE INDEX idx_profiles_staff ON profiles(is_staff);
CREATE INDEX idx_profiles_company ON profiles(company_id);
CREATE INDEX idx_profiles_role ON profiles(staff_role);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Generate sequential job number: JOB-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TEXT AS $$
DECLARE
  today_prefix TEXT;
  today_count INTEGER;
  new_number TEXT;
BEGIN
  today_prefix := 'JOB-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-';
  
  SELECT COUNT(*) + 1 INTO today_count
  FROM jobs
  WHERE job_number LIKE today_prefix || '%';
  
  new_number := today_prefix || lpad(today_count::text, 4, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Generate sequential quote number: QTE-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TEXT AS $$
DECLARE
  today_prefix TEXT;
  today_count INTEGER;
  new_number TEXT;
BEGIN
  today_prefix := 'QTE-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-';
  
  SELECT COUNT(*) + 1 INTO today_count
  FROM quotes
  WHERE quote_number LIKE today_prefix || '%';
  
  new_number := today_prefix || lpad(today_count::text, 4, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Generate sequential certificate number: CERT-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION generate_certificate_number()
RETURNS TEXT AS $$
DECLARE
  today_prefix TEXT;
  today_count INTEGER;
  new_number TEXT;
BEGIN
  today_prefix := 'CERT-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-';
  
  SELECT COUNT(*) + 1 INTO today_count
  FROM certificates
  WHERE certificate_number LIKE today_prefix || '%';
  
  new_number := today_prefix || lpad(today_count::text, 4, '0');
  
  RETURN new_number;
END;
$$ LANGUAGE plpgsql;

-- Calculate quote totals
CREATE OR REPLACE FUNCTION calculate_quote_totals(quote_uuid UUID)
RETURNS void AS $$
DECLARE
  calc_subtotal DECIMAL(10, 2);
  calc_discount DECIMAL(10, 2);
  calc_tax DECIMAL(10, 2);
  calc_total DECIMAL(10, 2);
  disc_percent DECIMAL(5, 2);
  tax_rate_val DECIMAL(5, 2);
BEGIN
  -- Get subtotal from line items
  SELECT COALESCE(SUM(line_total), 0) INTO calc_subtotal
  FROM quote_line_items
  WHERE quote_id = quote_uuid;
  
  -- Get discount percent and tax rate from quote
  SELECT discount_percent, tax_rate INTO disc_percent, tax_rate_val
  FROM quotes
  WHERE id = quote_uuid;
  
  -- Calculate discount
  calc_discount := calc_subtotal * (disc_percent / 100);
  
  -- Calculate tax on discounted amount
  calc_tax := (calc_subtotal - calc_discount) * (tax_rate_val / 100);
  
  -- Calculate total
  calc_total := calc_subtotal - calc_discount + calc_tax;
  
  -- Update quote
  UPDATE quotes
  SET subtotal = calc_subtotal,
      discount_amount = calc_discount,
      tax_amount = calc_tax,
      total = calc_total,
      updated_at = NOW()
  WHERE id = quote_uuid;
END;
$$ LANGUAGE plpgsql;

-- Update equipment calibration dates after certificate approval
CREATE OR REPLACE FUNCTION update_equipment_calibration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    UPDATE equipment
    SET last_calibration_date = NEW.calibration_date,
        next_calibration_due = NEW.expiry_date,
        updated_at = NOW()
    WHERE id = NEW.equipment_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_certificate_approved
  AFTER UPDATE ON certificates
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION update_equipment_calibration();

-- Log activity on updates
CREATE OR REPLACE FUNCTION log_activity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_log (user_id, entity_type, entity_id, activity_type, description)
  VALUES (
    auth.uid(),
    TG_ARGV[0],
    COALESCE(NEW.id, OLD.id),
    CASE 
      WHEN TG_OP = 'INSERT' THEN 'created'
      WHEN TG_OP = 'UPDATE' THEN 'updated'
      WHEN TG_OP = 'DELETE' THEN 'deleted'
    END::activity_type,
    TG_OP || ' ' || TG_ARGV[0]
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- UPDATED_AT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_equipment_updated_at BEFORE UPDATE ON equipment FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_quotes_updated_at BEFORE UPDATE ON quotes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_certificates_updated_at BEFORE UPDATE ON certificates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();

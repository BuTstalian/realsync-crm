-- RealSync CRM - Large Scale Test Data Seeder
-- Generates 10,000 companies with ~1M equipment
-- WARNING: Takes 5-10 minutes to run, uses ~100-200MB storage
-- Run in Supabase SQL Editor

-- First, clear existing test data
TRUNCATE companies CASCADE;

DO $$
DECLARE
  v_num_companies INTEGER := 10000;
  v_branches_per_company INTEGER := 3;    -- 30,000 branches
  v_equipment_per_branch INTEGER := 10;   -- 300,000 equipment (reduced for free tier)
  v_jobs_count INTEGER := 5000;
  v_tasks_count INTEGER := 10000;
  
  v_company_id UUID;
  v_branch_id UUID;
  v_job_id UUID;
  v_staff_ids UUID[];
  v_random_staff UUID;
  v_batch_size INTEGER := 100;
  v_i INTEGER;
  v_j INTEGER;
  v_k INTEGER;
  
  -- Arrays for random data
  v_company_prefixes TEXT[] := ARRAY['Acme', 'Global', 'Pacific', 'Northern', 'Southern', 'Eastern', 'Western', 'Central', 'United', 'National', 'Premier', 'Elite', 'Superior', 'Advanced', 'Modern', 'Classic', 'Dynamic', 'Precision', 'Quality', 'Alpha'];
  v_company_suffixes TEXT[] := ARRAY['Industries', 'Manufacturing', 'Engineering', 'Services', 'Solutions', 'Systems', 'Technologies', 'Enterprises', 'Holdings', 'Corp', 'Group', 'Partners', 'Associates', 'International', 'Australia'];
  v_cities TEXT[] := ARRAY['Brisbane', 'Sydney', 'Melbourne', 'Perth', 'Adelaide', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns', 'Toowoomba', 'Newcastle', 'Wollongong', 'Geelong', 'Hobart', 'Darwin', 'Canberra'];
  v_states TEXT[] := ARRAY['QLD', 'NSW', 'VIC', 'WA', 'SA', 'TAS', 'NT', 'ACT'];
  v_equipment_types TEXT[] := ARRAY['Digital Multimeter', 'Insulation Tester', 'Earth Tester', 'RCD Tester', 'Loop Tester', 'PAT Tester', 'Thermal Imager', 'Power Analyser', 'Oscilloscope', 'Clamp Meter', 'High Voltage Tester', 'Cable Locator', 'Phase Rotation Meter', 'Power Quality Analyser', 'Battery Tester'];
  v_manufacturers TEXT[] := ARRAY['Fluke', 'Megger', 'Kyoritsu', 'Hioki', 'Kewtech', 'Seaward', 'Metrel', 'Amprobe', 'Extech', 'Klein'];
  v_categories TEXT[] := ARRAY['multimeter', 'insulation_tester', 'earth_tester', 'rcd_tester', 'pat_tester', 'thermal', 'power_analyser', 'other'];
BEGIN
  -- Get staff user IDs
  SELECT ARRAY_AGG(id) INTO v_staff_ids 
  FROM profiles 
  WHERE is_staff = true AND is_active = true;
  
  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) = 0 THEN
    v_staff_ids := ARRAY[NULL::UUID];
  END IF;

  RAISE NOTICE 'Starting large-scale data generation...';
  RAISE NOTICE 'Target: % companies, % branches, % equipment', 
    v_num_companies, 
    v_num_companies * v_branches_per_company,
    v_num_companies * v_branches_per_company * v_equipment_per_branch;

  -- ============================================
  -- GENERATE COMPANIES & BRANCHES & EQUIPMENT
  -- ============================================
  FOR v_i IN 1..v_num_companies LOOP
    INSERT INTO companies (
      company_code, name, trading_name, abn,
      billing_address_line1, billing_city, billing_state, billing_postcode, billing_country,
      primary_contact_name, primary_contact_email, primary_contact_phone,
      default_calibration_interval_months, payment_terms_days, is_active, tags
    ) VALUES (
      'CMP-' || LPAD(v_i::TEXT, 6, '0'),
      v_company_prefixes[1 + (v_i % 20)] || ' ' || v_company_suffixes[1 + ((v_i / 20) % 15)] || ' ' || v_i::TEXT,
      CASE WHEN v_i % 3 = 0 THEN v_company_prefixes[1 + (v_i % 20)] || ' Trading' ELSE NULL END,
      LPAD((10000000000 + v_i)::TEXT, 11, '0'),
      (v_i % 500 + 1)::TEXT || ' ' || CASE v_i % 10 WHEN 0 THEN 'Smith' WHEN 1 THEN 'King' WHEN 2 THEN 'Queen' WHEN 3 THEN 'Park' WHEN 4 THEN 'George' WHEN 5 THEN 'Elizabeth' WHEN 6 THEN 'Victoria' WHEN 7 THEN 'Albert' WHEN 8 THEN 'Edward' ELSE 'William' END || ' Street',
      v_cities[1 + (v_i % 16)],
      v_states[1 + (v_i % 8)],
      LPAD((1000 + (v_i % 9000))::TEXT, 4, '0'),
      'Australia',
      'Contact ' || v_i::TEXT,
      'contact' || v_i::TEXT || '@example.com',
      '04' || LPAD((v_i % 100000000)::TEXT, 8, '0'),
      CASE v_i % 3 WHEN 0 THEN 6 WHEN 1 THEN 12 ELSE 24 END,
      CASE v_i % 4 WHEN 0 THEN 7 WHEN 1 THEN 14 WHEN 2 THEN 30 ELSE 60 END,
      v_i % 20 != 0, -- 95% active
      CASE v_i % 5 WHEN 0 THEN ARRAY['priority'] WHEN 1 THEN ARRAY['large-account'] WHEN 2 THEN ARRAY['new-client'] ELSE ARRAY[]::TEXT[] END
    )
    RETURNING id INTO v_company_id;

    -- Generate branches for this company
    FOR v_j IN 1..v_branches_per_company LOOP
      INSERT INTO branches (
        branch_code, company_id, name,
        address_line1, city, state, postcode, country,
        contact_name, contact_email, contact_phone,
        region, latitude, longitude, operating_hours, site_requirements, is_active
      ) VALUES (
        'BRN-' || LPAD(((v_i - 1) * v_branches_per_company + v_j)::TEXT, 7, '0'),
        v_company_id,
        CASE v_j WHEN 1 THEN 'Head Office' WHEN 2 THEN 'Warehouse' ELSE 'Branch ' || v_j END,
        ((v_i * v_j) % 500 + 1)::TEXT || ' Industrial Drive',
        v_cities[1 + ((v_i + v_j) % 16)],
        v_states[1 + ((v_i + v_j) % 8)],
        LPAD((1000 + ((v_i * v_j) % 9000))::TEXT, 4, '0'),
        'Australia',
        'Site Manager ' || v_j,
        'site' || v_j || '.c' || v_i || '@example.com',
        '04' || LPAD(((v_i * 10 + v_j) % 100000000)::TEXT, 8, '0'),
        CASE (v_i + v_j) % 7 WHEN 0 THEN 'North' WHEN 1 THEN 'South' WHEN 2 THEN 'East' WHEN 3 THEN 'West' WHEN 4 THEN 'Central' WHEN 5 THEN 'Metro' ELSE 'Regional' END,
        -27.4698 + ((v_i % 100) - 50) * 0.1,
        153.0251 + ((v_j % 100) - 50) * 0.1,
        '{"monday": "07:00-17:00", "friday": "07:00-15:00"}'::jsonb,
        CASE v_j % 3 WHEN 0 THEN 'PPE required' WHEN 1 THEN 'Induction required' ELSE NULL END,
        v_j != 3 OR v_i % 50 != 0 -- 99% active
      )
      RETURNING id INTO v_branch_id;

      -- Generate equipment for this branch
      FOR v_k IN 1..v_equipment_per_branch LOOP
        INSERT INTO equipment (
          equipment_code, branch_id, description, manufacturer, model, serial_number,
          category, calibration_interval_months, last_calibration_date, next_calibration_due,
          specifications, notes, is_active
        ) VALUES (
          'EQP-' || LPAD((((v_i - 1) * v_branches_per_company + v_j - 1) * v_equipment_per_branch + v_k)::TEXT, 8, '0'),
          v_branch_id,
          v_equipment_types[1 + ((v_i + v_j + v_k) % 15)],
          v_manufacturers[1 + ((v_i + v_k) % 10)],
          'Model-' || (1000 + ((v_i * v_k) % 9000))::TEXT,
          'SN-' || LPAD(((v_i * 1000000 + v_j * 1000 + v_k))::TEXT, 12, '0'),
          v_categories[1 + ((v_i + v_j + v_k) % 8)],
          CASE (v_i + v_k) % 3 WHEN 0 THEN 6 WHEN 1 THEN 12 ELSE 24 END,
          CURRENT_DATE - ((v_i + v_k) % 365 + 1),
          CURRENT_DATE + ((v_i + v_k) % 365 - 30),
          jsonb_build_object('voltage_range', CASE v_k % 3 WHEN 0 THEN '600V' WHEN 1 THEN '1000V' ELSE '1500V' END),
          CASE WHEN (v_i + v_k) % 10 = 0 THEN 'Special handling required' ELSE NULL END,
          (v_i + v_k) % 50 != 0 -- 98% active
        );
      END LOOP;
    END LOOP;

    -- Progress every 500 companies
    IF v_i % 500 = 0 THEN
      RAISE NOTICE 'Created % companies...', v_i;
    END IF;
  END LOOP;

  -- ============================================
  -- GENERATE JOBS (batch insert for speed)
  -- ============================================
  RAISE NOTICE 'Generating % jobs...', v_jobs_count;
  
  INSERT INTO jobs (job_number, branch_id, status, assigned_to, scheduled_date, scheduled_time_start, priority, internal_notes)
  SELECT 
    'JOB-' || to_char(CURRENT_DATE - (i % 60), 'YYYYMMDD') || '-' || LPAD(i::TEXT, 5, '0'),
    (SELECT id FROM branches ORDER BY random() LIMIT 1),
    (ARRAY['new', 'quoted', 'accepted', 'scheduled', 'in_progress', 'pending_review', 'completed', 'invoiced'])[1 + (i % 8)]::job_status,
    v_staff_ids[1 + (i % COALESCE(array_length(v_staff_ids, 1), 1))],
    CURRENT_DATE + (i % 60 - 30),
    (ARRAY['08:00', '09:00', '10:00', '13:00', '14:00'])[1 + (i % 5)]::time,
    (ARRAY['normal', 'high', 'urgent'])[1 + (i % 3)]::task_priority,
    CASE WHEN i % 5 = 0 THEN 'Internal note for job ' || i ELSE NULL END
  FROM generate_series(1, v_jobs_count) i;

  -- ============================================
  -- GENERATE TASKS (batch insert for speed)
  -- ============================================
  RAISE NOTICE 'Generating % tasks...', v_tasks_count;
  
  INSERT INTO tasks (company_id, title, description, status, priority, assigned_to, due_date, is_system_generated)
  SELECT 
    (SELECT id FROM companies ORDER BY random() LIMIT 1),
    (ARRAY['Follow up on quote', 'Schedule calibration', 'Send certificate', 'Review equipment', 'Update contacts', 'Process invoice', 'Arrange induction', 'Order parts', 'Complete report', 'Call for feedback'])[1 + (i % 10)],
    CASE WHEN i % 3 = 0 THEN 'Additional details...' ELSE NULL END,
    (ARRAY['pending', 'in_progress', 'completed', 'cancelled'])[CASE WHEN i % 10 < 5 THEN 1 WHEN i % 10 < 7 THEN 2 WHEN i % 10 < 9 THEN 3 ELSE 4 END]::task_status,
    (ARRAY['low', 'normal', 'high', 'urgent'])[CASE WHEN i % 10 < 2 THEN 1 WHEN i % 10 < 7 THEN 2 WHEN i % 10 < 9 THEN 3 ELSE 4 END]::task_priority,
    v_staff_ids[1 + (i % COALESCE(array_length(v_staff_ids, 1), 1))],
    CASE WHEN i % 3 != 0 THEN CURRENT_DATE + (i % 30 - 5) ELSE NULL END,
    i % 5 = 0
  FROM generate_series(1, v_tasks_count) i;

  RAISE NOTICE 'Data generation complete!';
END $$;

-- Update statistics for query planner
ANALYZE companies;
ANALYZE branches;
ANALYZE equipment;
ANALYZE jobs;
ANALYZE tasks;

-- Verify counts
SELECT 'companies' as table_name, COUNT(*) as count FROM companies
UNION ALL SELECT 'branches', COUNT(*) FROM branches
UNION ALL SELECT 'equipment', COUNT(*) FROM equipment
UNION ALL SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL SELECT 'tasks', COUNT(*) FROM tasks;

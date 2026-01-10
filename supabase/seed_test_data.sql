-- RealSync CRM - Test Data Seeder
-- Generates realistic test data for stress testing
-- Run this in Supabase SQL Editor

DO $$
DECLARE
  v_num_companies INTEGER := 100;
  v_branches_per_company INTEGER := 5;
  v_equipment_per_branch INTEGER := 20;
  v_jobs_count INTEGER := 500;
  v_tasks_count INTEGER := 1000;
  
  v_company_id UUID;
  v_branch_id UUID;
  v_job_id UUID;
  v_staff_ids UUID[];
  v_random_staff UUID;
  v_i INTEGER;
  v_j INTEGER;
  v_k INTEGER;
BEGIN
  -- Get staff user IDs for assignment
  SELECT ARRAY_AGG(id) INTO v_staff_ids 
  FROM profiles 
  WHERE is_staff = true AND is_active = true;
  
  IF v_staff_ids IS NULL OR array_length(v_staff_ids, 1) = 0 THEN
    RAISE NOTICE 'No staff users found. Creating jobs/tasks without assignments.';
    v_staff_ids := ARRAY[NULL::UUID];
  END IF;

  RAISE NOTICE 'Starting data generation...';
  RAISE NOTICE 'Staff IDs found: %', array_length(v_staff_ids, 1);

  -- ============================================
  -- GENERATE COMPANIES
  -- ============================================
  RAISE NOTICE 'Generating % companies...', v_num_companies;
  
  FOR v_i IN 1..v_num_companies LOOP
    INSERT INTO companies (
      company_code,
      name,
      trading_name,
      abn,
      billing_address_line1,
      billing_city,
      billing_state,
      billing_postcode,
      billing_country,
      primary_contact_name,
      primary_contact_email,
      primary_contact_phone,
      default_calibration_interval_months,
      payment_terms_days,
      is_active,
      tags
    ) VALUES (
      'CMP-' || LPAD(v_i::TEXT, 5, '0'),
      (ARRAY['Acme', 'Global', 'Pacific', 'Northern', 'Southern', 'Eastern', 'Western', 'Central', 'United', 'National'])[floor(random() * 10 + 1)::int] || ' ' ||
      (ARRAY['Industries', 'Manufacturing', 'Engineering', 'Services', 'Solutions', 'Systems', 'Technologies', 'Enterprises', 'Holdings', 'Corp'])[floor(random() * 10 + 1)::int] || ' ' ||
      v_i::TEXT,
      CASE WHEN random() > 0.7 THEN 
        (ARRAY['Acme', 'Global', 'Pacific'])[floor(random() * 3 + 1)::int] || ' Trading'
      ELSE NULL END,
      LPAD((floor(random() * 90000000000) + 10000000000)::BIGINT::TEXT, 11, '0'),
      (floor(random() * 500) + 1)::TEXT || ' ' || 
      (ARRAY['Smith', 'King', 'Queen', 'Park', 'George', 'Elizabeth', 'Victoria', 'Albert', 'Edward', 'William'])[floor(random() * 10 + 1)::int] || ' Street',
      (ARRAY['Brisbane', 'Sydney', 'Melbourne', 'Perth', 'Adelaide', 'Hobart', 'Darwin', 'Canberra', 'Gold Coast', 'Newcastle'])[floor(random() * 10 + 1)::int],
      (ARRAY['QLD', 'NSW', 'VIC', 'WA', 'SA', 'TAS', 'NT', 'ACT'])[floor(random() * 8 + 1)::int],
      LPAD((floor(random() * 9000) + 1000)::TEXT, 4, '0'),
      'Australia',
      'Contact ' || v_i::TEXT,
      'contact' || v_i::TEXT || '@example.com',
      '04' || LPAD((floor(random() * 100000000))::TEXT, 8, '0'),
      (ARRAY[6, 12, 24])[floor(random() * 3 + 1)::int],
      (ARRAY[7, 14, 30, 60])[floor(random() * 4 + 1)::int],
      random() > 0.1,
      CASE floor(random() * 4)::int
        WHEN 0 THEN ARRAY['priority']
        WHEN 1 THEN ARRAY['large-account']
        WHEN 2 THEN ARRAY['new-client']
        ELSE ARRAY[]::TEXT[]
      END
    )
    RETURNING id INTO v_company_id;

    -- ============================================
    -- GENERATE BRANCHES FOR EACH COMPANY
    -- ============================================
    FOR v_j IN 1..v_branches_per_company LOOP
      INSERT INTO branches (
        branch_code,
        company_id,
        name,
        address_line1,
        city,
        state,
        postcode,
        country,
        contact_name,
        contact_email,
        contact_phone,
        region,
        latitude,
        longitude,
        operating_hours,
        site_requirements,
        is_active
      ) VALUES (
        'BRN-' || LPAD(((v_i - 1) * v_branches_per_company + v_j)::TEXT, 6, '0'),
        v_company_id,
        CASE v_j
          WHEN 1 THEN 'Head Office'
          WHEN 2 THEN 'Warehouse'
          WHEN 3 THEN 'Factory'
          WHEN 4 THEN 'Distribution Centre'
          ELSE 'Branch ' || v_j::TEXT
        END,
        (floor(random() * 500) + 1)::TEXT || ' ' || 
        (ARRAY['Industrial', 'Commerce', 'Business', 'Enterprise', 'Corporate'])[floor(random() * 5 + 1)::int] || ' Drive',
        (ARRAY['Brisbane', 'Sydney', 'Melbourne', 'Perth', 'Adelaide', 'Gold Coast', 'Sunshine Coast', 'Townsville', 'Cairns', 'Toowoomba'])[floor(random() * 10 + 1)::int],
        (ARRAY['QLD', 'NSW', 'VIC', 'WA', 'SA'])[floor(random() * 5 + 1)::int],
        LPAD((floor(random() * 9000) + 1000)::TEXT, 4, '0'),
        'Australia',
        'Site Manager ' || v_j::TEXT,
        'site' || v_j::TEXT || '.c' || v_i::TEXT || '@example.com',
        '04' || LPAD((floor(random() * 100000000))::TEXT, 8, '0'),
        (ARRAY['North', 'South', 'East', 'West', 'Central', 'Metro', 'Regional'])[floor(random() * 7 + 1)::int],
        -27.4698 + (random() - 0.5) * 10,
        153.0251 + (random() - 0.5) * 10,
        '{"monday": "07:00-17:00", "tuesday": "07:00-17:00", "wednesday": "07:00-17:00", "thursday": "07:00-17:00", "friday": "07:00-15:00"}'::jsonb,
        CASE floor(random() * 3)::int
          WHEN 0 THEN 'PPE required, sign in at reception'
          WHEN 1 THEN 'Induction required for first visit'
          ELSE NULL
        END,
        random() > 0.05
      )
      RETURNING id INTO v_branch_id;

      -- ============================================
      -- GENERATE EQUIPMENT FOR EACH BRANCH
      -- ============================================
      FOR v_k IN 1..v_equipment_per_branch LOOP
        INSERT INTO equipment (
          equipment_code,
          branch_id,
          description,
          manufacturer,
          model,
          serial_number,
          category,
          calibration_interval_months,
          last_calibration_date,
          next_calibration_due,
          specifications,
          notes,
          is_active
        ) VALUES (
          'EQP-' || LPAD((((v_i - 1) * v_branches_per_company + v_j - 1) * v_equipment_per_branch + v_k)::TEXT, 8, '0'),
          v_branch_id,
          (ARRAY['Digital Multimeter', 'Insulation Tester', 'Earth Tester', 'RCD Tester', 'Loop Tester', 'PAT Tester', 'Thermal Imager', 'Power Analyser', 'Oscilloscope', 'Clamp Meter', 'High Voltage Tester', 'Cable Locator', 'Phase Rotation Meter', 'Power Quality Analyser', 'Battery Tester'])[floor(random() * 15 + 1)::int],
          (ARRAY['Fluke', 'Megger', 'Kyoritsu', 'Hioki', 'Kewtech', 'Seaward', 'Metrel', 'Amprobe', 'Extech', 'Klein'])[floor(random() * 10 + 1)::int],
          'Model-' || (floor(random() * 9000) + 1000)::TEXT,
          'SN-' || encode(gen_random_bytes(6), 'hex'),
          (ARRAY['multimeter', 'insulation_tester', 'earth_tester', 'rcd_tester', 'pat_tester', 'thermal', 'power_analyser', 'other'])[floor(random() * 8 + 1)::int],
          (ARRAY[6, 12, 24])[floor(random() * 3 + 1)::int],
          CURRENT_DATE - (floor(random() * 365) + 1)::int,
          CURRENT_DATE + (floor(random() * 365) - 30)::int,
          jsonb_build_object(
            'voltage_range', (ARRAY['600V', '1000V', '1500V'])[floor(random() * 3 + 1)::int],
            'accuracy', (random() * 0.5 + 0.1)::numeric(3,2)::text || '%'
          ),
          CASE WHEN random() > 0.8 THEN 'Requires special handling' ELSE NULL END,
          random() > 0.02
        );
      END LOOP;
    END LOOP;

    IF v_i % 10 = 0 THEN
      RAISE NOTICE 'Created % companies with branches and equipment...', v_i;
    END IF;
  END LOOP;

  -- ============================================
  -- GENERATE JOBS
  -- ============================================
  RAISE NOTICE 'Generating % jobs...', v_jobs_count;
  
  FOR v_i IN 1..v_jobs_count LOOP
    SELECT id INTO v_branch_id 
    FROM branches 
    ORDER BY random() 
    LIMIT 1;
    
    v_random_staff := v_staff_ids[floor(random() * array_length(v_staff_ids, 1) + 1)::int];
    
    INSERT INTO jobs (
      job_number,
      branch_id,
      status,
      assigned_to,
      scheduled_date,
      scheduled_time_start,
      scheduled_time_end,
      priority,
      internal_notes,
      client_notes
    ) VALUES (
      'JOB-' || to_char(CURRENT_DATE - (floor(random() * 60))::int, 'YYYYMMDD') || '-' || LPAD(v_i::TEXT, 4, '0'),
      v_branch_id,
      (ARRAY['new', 'quoted', 'accepted', 'scheduled', 'in_progress', 'pending_review', 'completed', 'invoiced'])[floor(random() * 8 + 1)::int]::job_status,
      v_random_staff,
      CURRENT_DATE + (floor(random() * 60) - 30)::int,
      (ARRAY['08:00', '09:00', '10:00', '11:00', '13:00', '14:00'])[floor(random() * 6 + 1)::int]::time,
      (ARRAY['10:00', '12:00', '14:00', '16:00', '17:00'])[floor(random() * 5 + 1)::int]::time,
      (ARRAY['normal', 'high', 'urgent'])[floor(random() * 3 + 1)::int]::task_priority,
      CASE WHEN random() > 0.7 THEN 'Internal note for job ' || v_i ELSE NULL END,
      CASE WHEN random() > 0.8 THEN 'Client requested morning visit' ELSE NULL END
    );
  END LOOP;

  -- ============================================
  -- GENERATE TASKS
  -- ============================================
  RAISE NOTICE 'Generating % tasks...', v_tasks_count;
  
  FOR v_i IN 1..v_tasks_count LOOP
    SELECT id INTO v_company_id 
    FROM companies 
    ORDER BY random() 
    LIMIT 1;
    
    IF random() > 0.5 THEN
      SELECT id INTO v_job_id FROM jobs ORDER BY random() LIMIT 1;
    ELSE
      v_job_id := NULL;
    END IF;
    
    v_random_staff := v_staff_ids[floor(random() * array_length(v_staff_ids, 1) + 1)::int];
    
    INSERT INTO tasks (
      company_id,
      job_id,
      title,
      description,
      status,
      priority,
      assigned_to,
      due_date,
      is_system_generated
    ) VALUES (
      v_company_id,
      v_job_id,
      (ARRAY[
        'Follow up on quote',
        'Schedule calibration visit',
        'Send certificate to client',
        'Review equipment list',
        'Update contact details',
        'Process invoice',
        'Arrange site induction',
        'Order replacement parts',
        'Complete job report',
        'Call client for feedback'
      ])[floor(random() * 10 + 1)::int],
      CASE WHEN random() > 0.6 THEN 'Additional details for this task...' ELSE NULL END,
      (ARRAY['pending', 'in_progress', 'completed', 'cancelled'])[
        CASE 
          WHEN random() < 0.5 THEN 1
          WHEN random() < 0.7 THEN 2
          WHEN random() < 0.95 THEN 3
          ELSE 4
        END
      ]::task_status,
      (ARRAY['low', 'normal', 'high', 'urgent'])[
        CASE 
          WHEN random() < 0.2 THEN 1
          WHEN random() < 0.7 THEN 2
          WHEN random() < 0.9 THEN 3
          ELSE 4
        END
      ]::task_priority,
      v_random_staff,
      CASE WHEN random() > 0.3 THEN CURRENT_DATE + (floor(random() * 30) - 5)::int ELSE NULL END,
      random() > 0.8
    );
  END LOOP;

  RAISE NOTICE 'Data generation complete!';

END $$;

-- ============================================
-- VERIFY DATA
-- ============================================
SELECT 'companies' as table_name, COUNT(*) as count FROM companies
UNION ALL
SELECT 'branches', COUNT(*) FROM branches
UNION ALL
SELECT 'equipment', COUNT(*) FROM equipment
UNION ALL
SELECT 'jobs', COUNT(*) FROM jobs
UNION ALL
SELECT 'tasks', COUNT(*) FROM tasks;

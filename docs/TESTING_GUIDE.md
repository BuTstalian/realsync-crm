# RealSync CRM - Testing Guide

## 1. Stress Testing with Large Datasets

### Data Volumes (within Supabase free tier)

The seed script generates:
| Table | Records | ~Size |
|-------|---------|-------|
| Companies | 100 | ~50KB |
| Branches | 500 | ~100KB |
| Equipment | 10,000 | ~2MB |
| Jobs | 500 | ~100KB |
| Tasks | 1,000 | ~150KB |
| **Total** | **~12,100** | **~2.5MB** |

Supabase free tier allows 500MB, so you're well within limits.

### Running the Seed Script

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Create a **New query**
3. Copy entire contents of `supabase/seed_test_data.sql`
4. Click **Run**
5. Wait ~30-60 seconds for data generation
6. You should see a summary like:
   ```
   companies: 100
   branches: 500
   equipment: 10000
   jobs: 500
   tasks: 1000
   ```

### Scaling Up (Optional)

To test with more data, edit the variables at the top of the script:
```sql
v_num_companies INTEGER := 500;        -- 500 companies
v_branches_per_company INTEGER := 10;  -- 5,000 branches total
v_equipment_per_branch INTEGER := 50;  -- 250,000 equipment total
```

**Warning**: 250k records will take several minutes to generate and use ~50MB of storage.

### What to Test

After seeding data:

1. **List Performance**
   - Open Companies page - should load instantly (cached)
   - Search for "Pacific" - should filter quickly
   - Scroll through pages - pagination should be smooth

2. **Equipment Pagination**
   - Open Equipment page with 10k records
   - Scroll down - should load more via infinite scroll
   - Filter by "due in 30 days" - should return subset quickly

3. **Dashboard Stats**
   - Dashboard should show aggregated stats
   - Stats come from materialized views (pre-computed)

---

## 2. Real-Time Sync Testing (Two Users)

### Step 1: Create a Second User

1. Go to **Supabase Dashboard** → **Authentication** → **Users**
2. Click **Add user** → **Create new user**
3. Enter:
   - Email: `testuser2@example.com`
   - Password: `testpassword123`
4. Click **Create user**

5. Go to **Table Editor** → **profiles**
6. Find the new user row and set:
   - `is_staff`: `true`
   - `staff_role`: `technician` (or any role)
   - `full_name`: `Test User 2`
7. Click **Save**

### Step 2: Open Two Browser Sessions

**Session 1 - Your main user:**
- Open Chrome normally
- Go to `http://localhost:5173`
- Sign in with your admin account

**Session 2 - Second user:**
- Open Chrome Incognito window (Ctrl+Shift+N / Cmd+Shift+N)
- Go to `http://localhost:5173`
- Sign in with `testuser2@example.com`

### Step 3: Test Presence (Who's Viewing)

Once we build the detail pages, you'll see:
- When both users view the same record (e.g., Company #5)
- User avatars showing "Also viewing: [JD]"
- Status indicators (online, editing, idle)

### Step 4: Test Record Locking

1. **User 1**: Open a company detail page, click "Edit"
   - Lock is acquired
   - Status shows "editing"

2. **User 2**: Open the same company
   - Sees warning: "This record is being edited by [User 1]"
   - Edit button is disabled

3. **User 1**: Save or cancel
   - Lock is released
   - User 2 can now edit

### Step 5: Test Real-Time Updates

1. **User 1**: Edit a company name and save
2. **User 2**: Should see the name update within seconds (no refresh needed)

---

## 3. Monitoring Performance

### React Query DevTools

In development, a flower icon appears bottom-left. Click it to see:
- All cached queries
- Cache hit/miss rates
- Stale vs fresh data
- Refetch timing

### Supabase Dashboard

Go to **Reports** → **Database** to see:
- Query performance
- Slow queries
- Connection count
- Bandwidth usage

### Browser DevTools

1. Open DevTools (F12)
2. Go to **Network** tab
3. Filter by "Fetch/XHR"
4. Watch request timing:
   - Should be <200ms for cached data
   - <500ms for fresh fetches

---

## 4. Free Tier Limits Reference

### Supabase Free Tier
| Resource | Limit | Our Usage |
|----------|-------|-----------|
| Database | 500MB | ~3-50MB with seed data |
| Bandwidth | 2GB/month | Varies with testing |
| File Storage | 1GB | Not used yet |
| Edge Functions | 500k invocations | Not used yet |
| Realtime Connections | 200 concurrent | ~2 for testing |

### Vercel Free Tier (when deployed)
| Resource | Limit |
|----------|-------|
| Bandwidth | 100GB/month |
| Serverless Functions | 100GB-hours |
| Builds | 6000 minutes/month |

---

## 5. Clearing Test Data

If you want to start fresh:

```sql
-- WARNING: This deletes ALL data
TRUNCATE 
  activity_log,
  tasks,
  certificates,
  job_equipment,
  jobs,
  quotes,
  quote_line_items,
  documents,
  equipment,
  branches,
  companies
CASCADE;

-- Reset sequences
ALTER SEQUENCE companies_id_seq RESTART;
ALTER SEQUENCE branches_id_seq RESTART;
-- etc.

-- Refresh materialized views
REFRESH MATERIALIZED VIEW mv_company_stats;
REFRESH MATERIALIZED VIEW mv_staff_dashboard;
REFRESH MATERIALIZED VIEW mv_system_stats;
```

---

## 6. Common Issues

### "No data showing"
- Did you run the seed script?
- Check browser console for errors
- Verify RLS policies aren't blocking (check user has `is_staff = true`)

### "Real-time not working"
- Check Supabase Dashboard → Database → Replication
- Ensure tables are in the `supabase_realtime` publication
- Check browser console for WebSocket errors

### "Slow queries"
- Run `004_performance.sql` to add indexes
- Check if materialized views exist
- Look at Supabase query performance dashboard

### "Can't sign in as second user"
- Make sure you created a profile row
- Check `is_active = true` on the profile
- Verify email confirmation is disabled (Auth → Settings)

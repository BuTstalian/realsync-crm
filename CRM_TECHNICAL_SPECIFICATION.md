# Calibration Services CRM - Technical Specification

## Architecture Overview

Building on your TTRPG system patterns:
- **Frontend**: React 18 + TypeScript + Vite
- **State**: Zustand stores
- **Backend**: Supabase (Postgres + Auth + Realtime + Storage)
- **Styling**: Tailwind CSS
- **Hosting**: Vercel
- **Icons**: Lucide React

## Project Structure

```
crm/
├── src/
│   ├── components/
│   │   ├── common/          # Shared UI components
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Select.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── Badge.tsx
│   │   │   ├── Tabs.tsx
│   │   │   └── index.ts
│   │   ├── company/         # Company/Branch management
│   │   │   ├── CompanyCard.tsx
│   │   │   ├── CompanyForm.tsx
│   │   │   ├── BranchList.tsx
│   │   │   ├── CompanySearch.tsx
│   │   │   └── index.ts
│   │   ├── equipment/       # Equipment tracking
│   │   │   ├── EquipmentCard.tsx
│   │   │   ├── EquipmentForm.tsx
│   │   │   ├── EquipmentList.tsx
│   │   │   ├── CalibrationHistory.tsx
│   │   │   └── index.ts
│   │   ├── jobs/            # Job management
│   │   │   ├── JobCard.tsx
│   │   │   ├── JobForm.tsx
│   │   │   ├── JobList.tsx
│   │   │   ├── JobTimeline.tsx
│   │   │   └── index.ts
│   │   ├── certificates/    # Certificate management
│   │   │   ├── CertificateCard.tsx
│   │   │   ├── CertificateForm.tsx
│   │   │   ├── CertificatePreview.tsx
│   │   │   └── index.ts
│   │   ├── tasks/           # Task management
│   │   │   ├── TaskCard.tsx
│   │   │   ├── TaskList.tsx
│   │   │   ├── TaskBoard.tsx
│   │   │   └── index.ts
│   │   ├── quotes/          # Quoting system
│   │   │   ├── QuoteBuilder.tsx
│   │   │   ├── QuoteLineItems.tsx
│   │   │   ├── QuotePreview.tsx
│   │   │   └── index.ts
│   │   ├── services/        # Service catalogue
│   │   │   ├── ServiceCard.tsx
│   │   │   ├── ServiceList.tsx
│   │   │   ├── ServiceSelector.tsx
│   │   │   └── index.ts
│   │   └── dashboard/       # Role-specific dashboards
│   │       ├── OnboardingDashboard.tsx
│   │       ├── SalesDashboard.tsx
│   │       ├── SchedulerDashboard.tsx
│   │       ├── TechnicianDashboard.tsx
│   │       ├── ManagementDashboard.tsx
│   │       ├── CompanyManagerDashboard.tsx
│   │       └── index.ts
│   ├── pages/
│   │   ├── AuthPage.tsx
│   │   ├── AuthCallback.tsx
│   │   ├── Dashboard.tsx
│   │   ├── Companies.tsx
│   │   ├── CompanyView.tsx
│   │   ├── Equipment.tsx
│   │   ├── Jobs.tsx
│   │   ├── JobView.tsx
│   │   ├── Certificates.tsx
│   │   ├── Quotes.tsx
│   │   ├── Services.tsx
│   │   ├── Tasks.tsx
│   │   ├── Reports.tsx
│   │   ├── Settings.tsx
│   │   └── index.ts
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── companyStore.ts
│   │   ├── equipmentStore.ts
│   │   ├── jobStore.ts
│   │   ├── certificateStore.ts
│   │   ├── taskStore.ts
│   │   ├── quoteStore.ts
│   │   ├── serviceStore.ts
│   │   ├── userStore.ts
│   │   └── index.ts
│   ├── services/
│   │   ├── supabase.ts
│   │   ├── database.ts
│   │   ├── pdf.ts           # Certificate PDF generation
│   │   ├── email.ts         # Email triggers
│   │   └── index.ts
│   ├── types/
│   │   ├── supabase.ts      # Generated from schema
│   │   ├── company.ts
│   │   ├── equipment.ts
│   │   ├── job.ts
│   │   ├── certificate.ts
│   │   ├── task.ts
│   │   ├── quote.ts
│   │   ├── service.ts
│   │   ├── user.ts
│   │   └── index.ts
│   ├── hooks/
│   │   ├── usePermissions.ts
│   │   ├── useCompanyAccess.ts
│   │   ├── useSearch.ts
│   │   ├── usePagination.ts
│   │   └── index.ts
│   ├── utils/
│   │   ├── generateId.ts
│   │   ├── formatters.ts
│   │   ├── validators.ts
│   │   ├── calculations.ts
│   │   └── index.ts
│   ├── data/
│   │   ├── services.ts      # Default service catalogue
│   │   ├── categories.ts    # Equipment categories
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       ├── 002_rls_policies.sql
│       └── 003_functions.sql
├── public/
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── vercel.json
```

## Data Model

### Core Hierarchy
```
Company (client organization)
  └── Branch (physical location)
       └── Equipment (items to calibrate)
            └── Jobs (calibration work)
                 └── Certificates (results)
```

### User Roles (Staff)
| Role | Access Level |
|------|--------------|
| Admin | Full system access |
| Management | All data, reports, approvals |
| Scheduler | Jobs, scheduling, branches |
| Sales | Companies, quotes, equipment |
| Onboarding | New companies, branches, equipment |
| Technician | Assigned jobs, certificates |

### Client Roles
| Role | Access Level |
|------|--------------|
| Company Manager | All branches for their company |
| Branch Manager | Single branch only |

## Supabase Schema

See `001_initial_schema.sql` for complete schema.

### Key Tables
- `profiles` - User profiles (extends auth.users)
- `companies` - Client companies
- `branches` - Company locations
- `equipment` - Items to calibrate
- `jobs` - Calibration work orders
- `certificates` - Calibration certificates
- `tasks` - Internal workflow tasks
- `quotes` - Price quotes
- `quote_line_items` - Quote details
- `services` - Service catalogue
- `activity_log` - Audit trail
- `documents` - File attachments

## Role-Based Access Control

### Row Level Security Pattern
```sql
-- Example: Technicians see only assigned jobs
CREATE POLICY "Technicians see assigned jobs" ON jobs
  FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM profiles WHERE role = 'technician'
    ) AND assigned_to = auth.uid()
  );
```

### Client Isolation Pattern
```sql
-- Company managers see only their company
CREATE POLICY "Company managers see their company" ON companies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM company_users 
      WHERE company_users.company_id = companies.id 
      AND company_users.user_id = auth.uid()
    )
  );
```

## Workflow States

### Job Status Flow
```
new → quoted → accepted → scheduled → in_progress → 
  pending_review → completed → invoiced
  
  (can also: cancelled at any point)
```

### Quote Status Flow
```
draft → sent → accepted | declined | expired
        ↓
      (becomes job when accepted)
```

### Task Status Flow
```
pending → in_progress → completed | cancelled
```

## Key Features by Phase

### Phase 1 (MVP)
- [ ] Authentication (email/password + 2FA for managers)
- [ ] Company/Branch CRUD
- [ ] Equipment management
- [ ] Job creation and tracking
- [ ] Basic certificate upload
- [ ] Task management
- [ ] Role-based dashboards

### Phase 2
- [ ] Quote builder
- [ ] Service catalogue management
- [ ] Certificate PDF generation
- [ ] Email notifications
- [ ] Calibration reminder system
- [ ] Reports and analytics

### Phase 3
- [ ] Google Calendar integration
- [ ] Xero accounting integration
- [ ] Mobile-optimized views
- [ ] Offline support (Dexie)
- [ ] Bulk operations

## Cost Comparison

### React/Supabase Stack
| Item | Cost |
|------|------|
| Supabase Pro | $25/mo |
| Vercel Pro | $20/mo |
| Domain | ~$15/yr |
| **Total** | **~$550/year** |

### vs WordPress/Toolset
| Item | Cost |
|------|------|
| Toolset | $115/yr |
| Hosting | $400/yr |
| Plugins | ~$100/yr |
| **Total** | **~$615/year** |

### Advantages of Custom Stack
- Full control over code
- No plugin dependency/compatibility issues
- Proper relational database (Postgres)
- Native mobile potential (React Native)
- Realtime updates built-in
- Better performance
- Type safety throughout
- Easier testing/CI
- Version control everything

### Disadvantages
- More initial development time
- Need to build everything (no drag-drop)
- Self-maintained (though simpler)

## Getting Started

```bash
# Create project
npm create vite@latest crm -- --template react-ts

# Install dependencies
npm install @supabase/supabase-js zustand react-router-dom \
  lucide-react clsx immer nanoid

# Install dev dependencies
npm install -D tailwindcss postcss autoprefixer @types/node

# Initialize Tailwind
npx tailwindcss init -p

# Create Supabase project at supabase.com
# Run migrations in Supabase SQL editor
```

## Environment Variables

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Next Steps

1. Set up Supabase project
2. Run database migrations
3. Scaffold React project
4. Implement auth flow
5. Build company management first
6. Add equipment tracking
7. Implement job workflows
8. Build certificate system

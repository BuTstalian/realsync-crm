# Calibration Services CRM

A custom CRM system for managing calibration and testing services, built with React, TypeScript, and Supabase.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **State Management**: Zustand
- **Backend**: Supabase (PostgreSQL + Auth + Realtime + Storage)
- **Styling**: Tailwind CSS
- **Hosting**: Vercel
- **Icons**: Lucide React

## Features

### Core Functionality
- 🏢 Company & Branch management (multi-tier hierarchy)
- 🔧 Equipment tracking with calibration schedules
- 📋 Job workflow management
- 📄 Certificate generation and management
- 📝 Quote builder with service catalogue
- ✅ Task management system
- 📊 Role-based dashboards

### User Roles

**Staff Roles:**
- Admin - Full system access
- Management - All data, reports, approvals
- Scheduler - Jobs, scheduling
- Sales - Companies, quotes, equipment
- Onboarding - New client setup
- Technician - Assigned jobs only

**Client Roles:**
- Company Manager - All branches
- Branch Manager - Single branch

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account (free tier works)

### 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from Settings > API

### 2. Set Up Database

Run the SQL migrations in order in the Supabase SQL Editor:

```bash
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
```

### 3. Clone and Install

```bash
git clone <your-repo>
cd calibration-crm
npm install
```

### 4. Configure Environment

Create a `.env` file:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Run Development Server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

## Project Structure

```
src/
├── components/       # React components by feature
│   ├── common/      # Shared UI components
│   ├── company/     # Company/Branch management
│   ├── equipment/   # Equipment tracking
│   ├── jobs/        # Job management
│   ├── certificates/# Certificate system
│   ├── quotes/      # Quoting system
│   ├── tasks/       # Task management
│   └── dashboard/   # Role-specific dashboards
├── pages/           # Route pages
├── stores/          # Zustand state stores
├── services/        # API and external services
├── types/           # TypeScript type definitions
├── hooks/           # Custom React hooks
├── utils/           # Utility functions
└── data/            # Static data (service catalogue)
```

## Database Schema

### Core Tables
- `profiles` - User profiles (extends Supabase auth)
- `companies` - Client organizations
- `branches` - Company locations
- `equipment` - Items to calibrate
- `services` - Service catalogue
- `jobs` - Calibration work orders
- `certificates` - Calibration certificates
- `quotes` - Price quotes
- `tasks` - Internal workflow tasks
- `activity_log` - Audit trail

### Key Relationships
```
Company → Branch → Equipment → Job → Certificate
              ↓
           Quote → Job (when accepted)
```

## Deployment

### Vercel

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

## Cost Estimate

| Service | Cost |
|---------|------|
| Supabase Pro | $25/mo |
| Vercel Pro | $20/mo |
| Domain | ~$15/yr |
| **Total** | **~$550/year** |

(Free tiers available for development/testing)

## Development Phases

### Phase 1 (MVP)
- [ ] Authentication with role-based access
- [ ] Company/Branch CRUD
- [ ] Equipment management
- [ ] Job creation and tracking
- [ ] Basic certificate upload
- [ ] Task management

### Phase 2
- [ ] Quote builder
- [ ] Service catalogue management
- [ ] Certificate PDF generation
- [ ] Email notifications
- [ ] Calibration reminder system
- [ ] Reports and analytics

### Phase 3
- [ ] Google Calendar integration
- [ ] Accounting integration (Xero)
- [ ] Mobile-optimized views
- [ ] Offline support

## License

Private - All rights reserved

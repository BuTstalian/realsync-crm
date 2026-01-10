// Staff Dashboard - For internal staff members
import { useAuthStore } from '../stores/authStore';
import { useMyTasks, useMyJobs, useMyDashboardStats, useDashboardStats } from '../hooks/useData';
import {
  CheckSquare,
  ClipboardList,
  AlertTriangle,
  Clock,
  Building2,
  Wrench,
  TrendingUp,
  Calendar,
  Users,
  FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { format, isToday, isTomorrow, isPast } from 'date-fns';

export default function StaffDashboard() {
  const { profile } = useAuthStore();
  const { data: tasks = [], isLoading: tasksLoading } = useMyTasks(profile?.id || null);
  const { data: jobs = [], isLoading: jobsLoading } = useMyJobs(profile?.id || null);
  const { data: myStats } = useMyDashboardStats(profile?.id || null);
  const { data: globalStats } = useDashboardStats();

  const greeting = getGreeting();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const isManager = profile?.staff_role && ['admin', 'management'].includes(profile.staff_role);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-primary-100">
          {greeting}, {firstName}
        </h1>
        <p className="text-primary-400 mt-1">
          Here's what's happening today
        </p>
      </div>

      {/* Personal Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<CheckSquare className="text-accent-gold" />}
          label="My Pending Tasks"
          value={myStats?.pending_tasks ?? tasks.filter(t => t.status === 'pending').length}
          trend={myStats?.overdue_tasks ? `${myStats.overdue_tasks} overdue` : undefined}
          trendType={myStats?.overdue_tasks ? 'warning' : 'neutral'}
        />
        <StatCard
          icon={<ClipboardList className="text-blue-400" />}
          label="My Active Jobs"
          value={myStats?.active_jobs ?? jobs.length}
        />
        <StatCard
          icon={<Calendar className="text-green-400" />}
          label="Scheduled Today"
          value={jobs.filter(j => j.scheduled_date && isToday(new Date(j.scheduled_date))).length}
        />
        <StatCard
          icon={<TrendingUp className="text-purple-400" />}
          label="Completed This Week"
          value={myStats?.jobs_completed_7d ?? 0}
        />
      </div>

      {/* Global Stats for Managers */}
      {isManager && globalStats && (
        <div className="bg-primary-800/50 border border-primary-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-primary-400 mb-3">Company Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MiniStat 
              icon={<Building2 size={16} />} 
              label="Companies" 
              value={globalStats.total_companies || 0} 
            />
            <MiniStat 
              icon={<Wrench size={16} />} 
              label="Equipment" 
              value={globalStats.total_equipment || 0} 
            />
            <MiniStat 
              icon={<ClipboardList size={16} />} 
              label="Open Jobs" 
              value={globalStats.open_jobs || 0} 
            />
            <MiniStat 
              icon={<AlertTriangle size={16} />} 
              label="Due 30 Days" 
              value={globalStats.equipment_due_30_days || 0} 
            />
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Tasks */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg">
          <div className="px-4 py-3 border-b border-primary-700 flex items-center justify-between">
            <h2 className="font-semibold text-primary-100 flex items-center gap-2">
              <CheckSquare size={18} />
              My Tasks
            </h2>
            <span className="text-sm text-primary-400">
              {tasks.length} pending
            </span>
          </div>
          <div className="divide-y divide-primary-700">
            {tasksLoading ? (
              <div className="p-4 text-center text-primary-400">Loading...</div>
            ) : tasks.length === 0 ? (
              <div className="p-4 text-center text-primary-400">
                No pending tasks
              </div>
            ) : (
              tasks.slice(0, 5).map((task: any) => (
                <TaskItem key={task.id} task={task} />
              ))
            )}
          </div>
          {tasks.length > 5 && (
            <div className="px-4 py-3 border-t border-primary-700">
              <a
                href="/tasks"
                className="text-sm text-accent-gold hover:text-accent-amber transition-colors"
              >
                View all {tasks.length} tasks →
              </a>
            </div>
          )}
        </div>

        {/* My Jobs */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg">
          <div className="px-4 py-3 border-b border-primary-700 flex items-center justify-between">
            <h2 className="font-semibold text-primary-100 flex items-center gap-2">
              <ClipboardList size={18} />
              My Jobs
            </h2>
            <span className="text-sm text-primary-400">
              {jobs.length} active
            </span>
          </div>
          <div className="divide-y divide-primary-700">
            {jobsLoading ? (
              <div className="p-4 text-center text-primary-400">Loading...</div>
            ) : jobs.length === 0 ? (
              <div className="p-4 text-center text-primary-400">
                No active jobs assigned
              </div>
            ) : (
              jobs.slice(0, 5).map((job: any) => (
                <JobItem key={job.id} job={job} />
              ))
            )}
          </div>
          {jobs.length > 5 && (
            <div className="px-4 py-3 border-t border-primary-700">
              <a
                href="/jobs"
                className="text-sm text-accent-gold hover:text-accent-amber transition-colors"
              >
                View all {jobs.length} jobs →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions - Role Based */}
      {profile?.staff_role && ['admin', 'management', 'scheduler', 'sales', 'onboarding'].includes(profile.staff_role) && (
        <div className="bg-primary-800 border border-primary-700 rounded-lg p-4">
          <h2 className="font-semibold text-primary-100 mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            {['admin', 'management', 'sales', 'onboarding'].includes(profile.staff_role) && (
              <QuickAction
                href="/companies/new"
                icon={<Building2 size={18} />}
                label="New Company"
              />
            )}
            {['admin', 'management', 'scheduler'].includes(profile.staff_role) && (
              <QuickAction
                href="/jobs/new"
                icon={<ClipboardList size={18} />}
                label="New Job"
              />
            )}
            {['admin', 'management', 'sales'].includes(profile.staff_role) && (
              <QuickAction
                href="/quotes/new"
                icon={<FileText size={18} />}
                label="New Quote"
              />
            )}
            {['admin', 'management'].includes(profile.staff_role) && (
              <QuickAction
                href="/reports"
                icon={<TrendingUp size={18} />}
                label="Reports"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper Components

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  trend?: string;
  trendType?: 'positive' | 'negative' | 'warning' | 'neutral';
}

function StatCard({ icon, label, value, trend, trendType = 'neutral' }: StatCardProps) {
  return (
    <div className="bg-primary-800 border border-primary-700 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="w-10 h-10 rounded-lg bg-primary-700 flex items-center justify-center">
          {icon}
        </div>
        {trend && (
          <span
            className={clsx(
              'text-xs px-2 py-1 rounded-full',
              trendType === 'positive' && 'bg-green-500/20 text-green-400',
              trendType === 'negative' && 'bg-red-500/20 text-red-400',
              trendType === 'warning' && 'bg-yellow-500/20 text-yellow-400',
              trendType === 'neutral' && 'bg-primary-700 text-primary-400'
            )}
          >
            {trend}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-primary-100 mt-3">{value}</p>
      <p className="text-sm text-primary-400">{label}</p>
    </div>
  );
}

interface MiniStatProps {
  icon: React.ReactNode;
  label: string;
  value: number;
}

function MiniStat({ icon, label, value }: MiniStatProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-primary-400">{icon}</div>
      <div>
        <p className="text-lg font-semibold text-primary-100">{value.toLocaleString()}</p>
        <p className="text-xs text-primary-400">{label}</p>
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: {
    id: string;
    title: string;
    priority: string;
    due_date: string | null;
    company?: { name: string } | null;
  };
}

function TaskItem({ task }: TaskItemProps) {
  const isOverdue = task.due_date && isPast(new Date(task.due_date));

  return (
    <a
      href={`/tasks?id=${task.id}`}
      className="block px-4 py-3 hover:bg-primary-700/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <div
          className={clsx(
            'w-2 h-2 rounded-full mt-2',
            task.priority === 'urgent' && 'bg-red-500',
            task.priority === 'high' && 'bg-orange-500',
            task.priority === 'normal' && 'bg-blue-500',
            task.priority === 'low' && 'bg-gray-500'
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-primary-100 truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-1">
            {task.company && (
              <span className="text-xs text-primary-400">{task.company.name}</span>
            )}
            {task.due_date && (
              <span
                className={clsx(
                  'text-xs flex items-center gap-1',
                  isOverdue ? 'text-red-400' : 'text-primary-400'
                )}
              >
                <Clock size={12} />
                {formatDueDate(task.due_date)}
              </span>
            )}
          </div>
        </div>
        {isOverdue && <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />}
      </div>
    </a>
  );
}

interface JobItemProps {
  job: {
    id: string;
    job_number: string;
    status: string;
    scheduled_date: string | null;
    branch?: {
      name: string;
      city?: string;
      company?: { name: string } | null;
    } | null;
  };
}

function JobItem({ job }: JobItemProps) {
  const isTodays = job.scheduled_date && isToday(new Date(job.scheduled_date));
  const isTomorrows = job.scheduled_date && isTomorrow(new Date(job.scheduled_date));

  return (
    <a
      href={`/jobs/${job.id}`}
      className="block px-4 py-3 hover:bg-primary-700/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary-100">{job.job_number}</p>
          <p className="text-xs text-primary-400 truncate">
            {job.branch?.company?.name} - {job.branch?.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {job.scheduled_date && (
            <span
              className={clsx(
                'text-xs px-2 py-1 rounded',
                isTodays && 'bg-green-500/20 text-green-400',
                isTomorrows && 'bg-blue-500/20 text-blue-400',
                !isTodays && !isTomorrows && 'bg-primary-700 text-primary-400'
              )}
            >
              {isTodays ? 'Today' : isTomorrows ? 'Tomorrow' : format(new Date(job.scheduled_date), 'MMM d')}
            </span>
          )}
          <span
            className={clsx(
              'text-xs px-2 py-1 rounded capitalize',
              job.status === 'scheduled' && 'bg-cyan-500/20 text-cyan-400',
              job.status === 'in_progress' && 'bg-amber-500/20 text-amber-400'
            )}
          >
            {job.status.replace('_', ' ')}
          </span>
        </div>
      </div>
    </a>
  );
}

interface QuickActionProps {
  href: string;
  icon: React.ReactNode;
  label: string;
}

function QuickAction({ href, icon, label }: QuickActionProps) {
  return (
    <a
      href={href}
      className="flex items-center gap-2 px-4 py-2 bg-primary-700 hover:bg-primary-600 text-primary-100 rounded-lg transition-colors"
    >
      {icon}
      <span className="text-sm">{label}</span>
    </a>
  );
}

// Helper functions

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatDueDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isPast(date)) return `Overdue (${format(date, 'MMM d')})`;
  return format(date, 'MMM d');
}

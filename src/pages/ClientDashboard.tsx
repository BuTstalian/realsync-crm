// Client Dashboard - For company_manager and branch_manager users
import { useAuthStore } from '../stores/authStore';
import { useClientDashboardData } from '../hooks/useClientData';
import {
  Building2,
  MapPin,
  Wrench,
  FileCheck,
  AlertTriangle,
  Calendar,
  Clock,
  CheckCircle,
  Download,
  ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { format, differenceInDays, isPast } from 'date-fns';

export default function ClientDashboard() {
  const { profile } = useAuthStore();
  const { 
    company, 
    stats, 
    equipmentDue, 
    recentCertificates, 
    upcomingJobs,
    isLoading 
  } = useClientDashboardData(profile?.company_id || null);

  const greeting = getGreeting();
  const firstName = profile?.full_name?.split(' ')[0] || 'there';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-gold"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary-100">
            {greeting}, {firstName}
          </h1>
          <p className="text-primary-400 mt-1">
            Welcome to your {company?.name || 'company'} portal
          </p>
        </div>
        {company && (
          <div className="text-right">
            <p className="text-sm text-primary-400">Account</p>
            <p className="text-lg font-semibold text-primary-100">{company.company_code}</p>
          </div>
        )}
      </div>

      {/* Company Overview */}
      <div className="bg-primary-800 border border-primary-700 rounded-lg p-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg bg-accent-gold/20 flex items-center justify-center">
            <Building2 className="text-accent-gold" size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-primary-100">{company?.name}</h2>
            {company?.trading_name && company.trading_name !== company.name && (
              <p className="text-sm text-primary-400">Trading as: {company.trading_name}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-primary-100">{stats?.branchCount || 0}</p>
            <p className="text-sm text-primary-400">
              {stats?.branchCount === 1 ? 'Location' : 'Locations'}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Wrench className="text-blue-400" />}
          label="Total Equipment"
          value={stats?.totalEquipment || 0}
        />
        <StatCard
          icon={<AlertTriangle className="text-amber-400" />}
          label="Due for Calibration"
          value={stats?.equipmentDue30Days || 0}
          trend={stats?.equipmentDue30Days ? 'Within 30 days' : undefined}
          trendType={stats?.equipmentDue30Days ? 'warning' : 'neutral'}
        />
        <StatCard
          icon={<Calendar className="text-cyan-400" />}
          label="Scheduled Jobs"
          value={stats?.scheduledJobs || 0}
        />
        <StatCard
          icon={<FileCheck className="text-green-400" />}
          label="Certificates"
          value={stats?.totalCertificates || 0}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equipment Due Soon */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg">
          <div className="px-4 py-3 border-b border-primary-700 flex items-center justify-between">
            <h2 className="font-semibold text-primary-100 flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-400" />
              Equipment Due for Calibration
            </h2>
            <span className="text-sm text-primary-400">
              Next 30 days
            </span>
          </div>
          <div className="divide-y divide-primary-700">
            {equipmentDue.length === 0 ? (
              <div className="p-4 text-center text-primary-400">
                <CheckCircle size={24} className="mx-auto mb-2 text-green-400" />
                No equipment due for calibration
              </div>
            ) : (
              equipmentDue.slice(0, 5).map((equipment) => (
                <EquipmentDueItem key={equipment.id} equipment={equipment} />
              ))
            )}
          </div>
          {equipmentDue.length > 5 && (
            <div className="px-4 py-3 border-t border-primary-700">
              <a
                href="/equipment?filter=due"
                className="text-sm text-accent-gold hover:text-accent-amber transition-colors flex items-center gap-1"
              >
                View all {equipmentDue.length} items
                <ChevronRight size={16} />
              </a>
            </div>
          )}
        </div>

        {/* Recent Certificates */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg">
          <div className="px-4 py-3 border-b border-primary-700 flex items-center justify-between">
            <h2 className="font-semibold text-primary-100 flex items-center gap-2">
              <FileCheck size={18} className="text-green-400" />
              Recent Certificates
            </h2>
          </div>
          <div className="divide-y divide-primary-700">
            {recentCertificates.length === 0 ? (
              <div className="p-4 text-center text-primary-400">
                No certificates yet
              </div>
            ) : (
              recentCertificates.slice(0, 5).map((cert) => (
                <CertificateItem key={cert.id} certificate={cert} />
              ))
            )}
          </div>
          {recentCertificates.length > 5 && (
            <div className="px-4 py-3 border-t border-primary-700">
              <a
                href="/certificates"
                className="text-sm text-accent-gold hover:text-accent-amber transition-colors flex items-center gap-1"
              >
                View all certificates
                <ChevronRight size={16} />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Jobs */}
      <div className="bg-primary-800 border border-primary-700 rounded-lg">
        <div className="px-4 py-3 border-b border-primary-700 flex items-center justify-between">
          <h2 className="font-semibold text-primary-100 flex items-center gap-2">
            <Calendar size={18} className="text-cyan-400" />
            Scheduled Visits
          </h2>
        </div>
        <div className="divide-y divide-primary-700">
          {upcomingJobs.length === 0 ? (
            <div className="p-4 text-center text-primary-400">
              No scheduled visits
            </div>
          ) : (
            upcomingJobs.slice(0, 5).map((job) => (
              <JobItem key={job.id} job={job} />
            ))
          )}
        </div>
        {upcomingJobs.length > 5 && (
          <div className="px-4 py-3 border-t border-primary-700">
            <a
              href="/jobs"
              className="text-sm text-accent-gold hover:text-accent-amber transition-colors flex items-center gap-1"
            >
              View all scheduled visits
              <ChevronRight size={16} />
            </a>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-primary-800 border border-primary-700 rounded-lg p-4">
        <h2 className="font-semibold text-primary-100 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <QuickAction
            href="/equipment"
            icon={<Wrench size={18} />}
            label="View Equipment"
          />
          <QuickAction
            href="/certificates"
            icon={<FileCheck size={18} />}
            label="Download Certificates"
          />
          <QuickAction
            href="/jobs"
            icon={<Calendar size={18} />}
            label="View Schedule"
          />
        </div>
      </div>
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
              trendType === 'warning' && 'bg-amber-500/20 text-amber-400',
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

interface EquipmentDueItemProps {
  equipment: {
    id: string;
    equipment_code: string;
    description: string | null;
    next_calibration_due: string | null;
    branch?: { name: string } | null;
  };
}

function EquipmentDueItem({ equipment }: EquipmentDueItemProps) {
  const dueDate = equipment.next_calibration_due 
    ? new Date(equipment.next_calibration_due) 
    : null;
  const daysUntilDue = dueDate ? differenceInDays(dueDate, new Date()) : null;
  const isOverdue = dueDate && isPast(dueDate);

  return (
    <a
      href={`/equipment/${equipment.id}`}
      className="block px-4 py-3 hover:bg-primary-700/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary-100">{equipment.equipment_code}</p>
          <p className="text-xs text-primary-400 truncate">
            {equipment.description || 'No description'}
          </p>
          {equipment.branch && (
            <p className="text-xs text-primary-500 flex items-center gap-1 mt-1">
              <MapPin size={10} />
              {equipment.branch.name}
            </p>
          )}
        </div>
        <div className="text-right flex-shrink-0 ml-4">
          {dueDate && (
            <span
              className={clsx(
                'text-xs px-2 py-1 rounded',
                isOverdue && 'bg-red-500/20 text-red-400',
                !isOverdue && daysUntilDue !== null && daysUntilDue <= 7 && 'bg-amber-500/20 text-amber-400',
                !isOverdue && daysUntilDue !== null && daysUntilDue > 7 && 'bg-cyan-500/20 text-cyan-400'
              )}
            >
              {isOverdue 
                ? 'Overdue' 
                : daysUntilDue === 0 
                  ? 'Due today'
                  : `${daysUntilDue} days`
              }
            </span>
          )}
        </div>
      </div>
    </a>
  );
}

interface CertificateItemProps {
  certificate: {
    id: string;
    certificate_number: string;
    calibration_date: string;
    result: string;
    pdf_url: string | null;
    equipment?: {
      equipment_code: string;
      description: string | null;
    } | null;
  };
}

function CertificateItem({ certificate }: CertificateItemProps) {
  return (
    <div className="px-4 py-3 hover:bg-primary-700/50 transition-colors flex items-center justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary-100">{certificate.certificate_number}</p>
        <p className="text-xs text-primary-400 truncate">
          {certificate.equipment?.equipment_code} - {certificate.equipment?.description || 'Equipment'}
        </p>
        <p className="text-xs text-primary-500 mt-1">
          Issued: {format(new Date(certificate.calibration_date), 'MMM d, yyyy')}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            'text-xs px-2 py-1 rounded',
            certificate.result === 'pass' && 'bg-green-500/20 text-green-400',
            certificate.result === 'fail' && 'bg-red-500/20 text-red-400'
          )}
        >
          {certificate.result === 'pass' ? 'Passed' : 'Failed'}
        </span>
        {certificate.pdf_url && (
          <a
            href={certificate.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-primary-600 rounded transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <Download size={16} className="text-primary-400" />
          </a>
        )}
      </div>
    </div>
  );
}

interface JobItemProps {
  job: {
    id: string;
    job_number: string;
    status: string;
    scheduled_date: string | null;
    branch?: { name: string } | null;
  };
}

function JobItem({ job }: JobItemProps) {
  return (
    <a
      href={`/jobs/${job.id}`}
      className="block px-4 py-3 hover:bg-primary-700/50 transition-colors"
    >
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary-100">{job.job_number}</p>
          {job.branch && (
            <p className="text-xs text-primary-400 flex items-center gap-1">
              <MapPin size={10} />
              {job.branch.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {job.scheduled_date && (
            <span className="text-xs px-2 py-1 rounded bg-cyan-500/20 text-cyan-400">
              {format(new Date(job.scheduled_date), 'MMM d, yyyy')}
            </span>
          )}
          <span
            className={clsx(
              'text-xs px-2 py-1 rounded capitalize',
              job.status === 'scheduled' && 'bg-blue-500/20 text-blue-400',
              job.status === 'in_progress' && 'bg-amber-500/20 text-amber-400',
              job.status === 'completed' && 'bg-green-500/20 text-green-400'
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

// Helper function
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

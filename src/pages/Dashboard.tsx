// Dashboard Router - Routes to Staff or Client dashboard based on user role
import { useAuthStore } from '../stores/authStore';
import StaffDashboard from './StaffDashboard';
import ClientDashboard from './ClientDashboard';

export default function Dashboard() {
  const { profile, isStaff } = useAuthStore();

  // Show loading state if profile not loaded
  if (!profile) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-gold"></div>
      </div>
    );
  }

  // Route to appropriate dashboard
  if (isStaff) {
    return <StaffDashboard />;
  }

  return <ClientDashboard />;
}

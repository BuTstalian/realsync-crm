import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import {
  LayoutDashboard,
  Building2,
  Wrench,
  ClipboardList,
  FileText,
  Award,
  CheckSquare,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  ChevronDown,
  User,
} from 'lucide-react';
import clsx from 'clsx';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
  roles?: string[]; // If specified, only these roles see this item
}

const navItems: NavItem[] = [
  { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
  { to: '/companies', icon: <Building2 size={20} />, label: 'Companies' },
  { to: '/equipment', icon: <Wrench size={20} />, label: 'Equipment' },
  { to: '/jobs', icon: <ClipboardList size={20} />, label: 'Jobs' },
  { to: '/quotes', icon: <FileText size={20} />, label: 'Quotes', roles: ['admin', 'management', 'sales'] },
  { to: '/certificates', icon: <Award size={20} />, label: 'Certificates' },
  { to: '/tasks', icon: <CheckSquare size={20} />, label: 'Tasks' },
  { to: '/reports', icon: <BarChart3 size={20} />, label: 'Reports', roles: ['admin', 'management'] },
  { to: '/settings', icon: <Settings size={20} />, label: 'Settings', roles: ['admin'] },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { profile, signOut } = useAuthStore();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Filter nav items based on user role
  const visibleNavItems = navItems.filter((item) => {
    if (!item.roles) return true;
    return profile?.staff_role && item.roles.includes(profile.staff_role);
  });

  return (
    <div className="min-h-screen bg-primary-900 flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-primary-800 border-r border-primary-700 transform transition-transform duration-200 lg:transform-none',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-primary-700">
          <h1 className="text-xl font-bold text-primary-100">RealSync CRM</h1>
          <button
            className="lg:hidden text-primary-400 hover:text-primary-100"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={24} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                  isActive
                    ? 'bg-accent-gold/20 text-accent-gold'
                    : 'text-primary-300 hover:bg-primary-700 hover:text-primary-100'
                )
              }
            >
              {item.icon}
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User info at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-primary-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-accent-gold/20 flex items-center justify-center text-accent-gold font-medium">
              {profile?.full_name
                ?.split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase()
                .slice(0, 2) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-primary-100 truncate">
                {profile?.full_name || 'User'}
              </p>
              <p className="text-xs text-primary-400 capitalize">
                {profile?.staff_role || 'Staff'}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-primary-800 border-b border-primary-700 flex items-center justify-between px-4">
          {/* Mobile menu button */}
          <button
            className="lg:hidden text-primary-400 hover:text-primary-100"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={24} />
          </button>

          {/* Spacer for desktop */}
          <div className="hidden lg:block" />

          {/* Right side */}
          <div className="flex items-center gap-4">
            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 text-primary-300 hover:text-primary-100 transition-colors"
              >
                <User size={20} />
                <span className="hidden sm:inline">{profile?.full_name || 'User'}</span>
                <ChevronDown size={16} />
              </button>

              {userMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setUserMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-48 bg-primary-800 border border-primary-700 rounded-lg shadow-lg z-50">
                    <div className="p-2">
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-primary-300 hover:bg-primary-700 hover:text-primary-100 rounded-lg transition-colors"
                      >
                        <LogOut size={16} />
                        Sign Out
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';

// Layout
import Layout from './components/Layout';

// Pages
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import TestRealtime from './pages/TestRealtime';
import StressTest from './pages/StressTest';

// Temporary placeholder for pages not yet built
const Placeholder = ({ title }: { title: string }) => (
  <div className="text-center py-12">
    <h1 className="text-2xl font-bold text-primary-100 mb-2">{title}</h1>
    <p className="text-primary-400">This page is under construction</p>
  </div>
);

const Companies = () => <Placeholder title="Companies" />;
const CompanyView = () => <Placeholder title="Company Details" />;
const Equipment = () => <Placeholder title="Equipment" />;
const Jobs = () => <Placeholder title="Jobs" />;
const JobView = () => <Placeholder title="Job Details" />;
const Quotes = () => <Placeholder title="Quotes" />;
const Certificates = () => <Placeholder title="Certificates" />;
const Tasks = () => <Placeholder title="Tasks" />;
const Reports = () => <Placeholder title="Reports" />;
const Settings = () => <Placeholder title="Settings" />;

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isInitialized, isLoading } = useAuthStore();

  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen bg-primary-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent-gold"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

// Public route wrapper (redirect to dashboard if already logged in)
const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isInitialized, isLoading } = useAuthStore();

  if (!isInitialized || isLoading) {
    return (
      <div className="min-h-screen bg-primary-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent-gold"></div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

function App() {
  const { initialize, isInitialized } = useAuthStore();

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [initialize, isInitialized]);

  return (
    <Routes>
      {/* Auth routes (no layout) */}
      <Route
        path="/auth"
        element={
          <PublicRoute>
            <AuthPage />
          </PublicRoute>
        }
      />

      {/* Protected routes (with layout) */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="companies" element={<Companies />} />
        <Route path="companies/:id" element={<CompanyView />} />
        <Route path="equipment" element={<Equipment />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:id" element={<JobView />} />
        <Route path="quotes" element={<Quotes />} />
        <Route path="certificates" element={<Certificates />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="test-realtime" element={<TestRealtime />} />
        <Route path="stress-test" element={<StressTest />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

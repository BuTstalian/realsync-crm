import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signIn } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      await signIn(email, password);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-100">RealSync CRM</h1>
          <p className="text-primary-400 mt-2">Calibration Services Management</p>
        </div>

        {/* Sign In Card */}
        <div className="bg-primary-800 border border-primary-700 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-primary-100 mb-6">Sign In</h2>

          {error && (
            <div className="mb-4 p-3 bg-status-error/20 border border-status-error/30 rounded-lg text-status-error text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-primary-300 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-primary-900 border border-primary-600 rounded-lg px-4 py-2 text-primary-100 placeholder-primary-500 focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-primary-300 mb-1">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-primary-900 border border-primary-600 rounded-lg px-4 py-2 text-primary-100 placeholder-primary-500 focus:border-accent-gold focus:ring-1 focus:ring-accent-gold focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent-gold text-primary-900 font-semibold px-4 py-2 rounded-lg hover:bg-accent-amber transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        </div>

        <p className="text-center text-primary-500 text-sm mt-6">
          © 2026 RealSync CRM
        </p>
      </div>
    </div>
  );
}

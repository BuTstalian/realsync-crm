/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary palette - professional blue/slate
        primary: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        // Accent - professional gold/amber
        accent: {
          gold: '#f59e0b',
          amber: '#d97706',
          light: '#fcd34d',
        },
        // Status colors
        status: {
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444',
          info: '#3b82f6',
        },
        // Job status colors
        job: {
          new: '#3b82f6',
          quoted: '#8b5cf6',
          accepted: '#22c55e',
          scheduled: '#06b6d4',
          'in-progress': '#f59e0b',
          'pending-review': '#f97316',
          completed: '#10b981',
          invoiced: '#6b7280',
          cancelled: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

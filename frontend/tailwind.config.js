/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bosun: {
          'bg-950': '#0a0f1a',
          'bg-900': '#0f172a',
          'bg-800': '#1e293b',
          'accent-blue': '#3b82f6',
          'accent-green': '#22c55e',
          'accent-red': '#ef4444',
          'accent-yellow': '#eab308',
        }
      },
      backgroundColor: {
        'slate-750': '#273549',
      }
    },
  },
  plugins: [],
}

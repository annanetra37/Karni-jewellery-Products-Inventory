import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        karni: {
          50:  '#fbf9f6',
          100: '#f3eee5',
          200: '#e7ddc8',
          300: '#d3c0a0',
          400: '#b89a73',
          500: '#9d7a51',
          600: '#83613d',
          700: '#664a2e',
          800: '#3f2e1e',
          900: '#1f1812',
        },
        ink: {
          DEFAULT: '#18181b',
          soft: '#52525b',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'Noto Sans Armenian', 'sans-serif'],
        display: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(15, 12, 8, 0.04), 0 1px 3px rgba(15, 12, 8, 0.05)',
        lift: '0 6px 18px rgba(15, 12, 8, 0.08), 0 2px 6px rgba(15, 12, 8, 0.05)',
        pop: '0 16px 40px rgba(15, 12, 8, 0.12), 0 4px 12px rgba(15, 12, 8, 0.06)',
      },
    },
  },
  plugins: [],
};
export default config;

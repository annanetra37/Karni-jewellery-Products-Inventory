import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — deep forest green from the Karni logo, with dusty
        // rose accents and warm beige neutrals. Light-mode only.
        karni: {
          50:  '#fbf6ec',
          100: '#f4ecd9',
          200: '#e6d6b1',
          300: '#cdb482',
          400: '#a18b5e',
          500: '#7a6b46',
          600: '#5d5337',
          700: '#3f3a28',
          800: '#26241a',
          900: '#161513',
        },
        forest: {
          50:  '#eef3ef',
          100: '#d6e2d9',
          200: '#a8c1ac',
          300: '#7aa180',
          400: '#4f8159',
          500: '#3a6646',
          600: '#2d4a3d',
          700: '#244038',
          800: '#1a2f28',
          900: '#11201a',
        },
        rose: {
          50:  '#fdf3f1',
          100: '#f9dfdc',
          200: '#f3bfba',
          300: '#ec9c95',
          400: '#e07d75',
          500: '#cc645c',
          600: '#a84a44',
          700: '#83373a',
          800: '#5f262a',
          900: '#3a1719',
        },
        ink: {
          DEFAULT: '#1a2620',
          soft: '#5d6b5f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'Noto Sans Armenian', 'sans-serif'],
        display: ['"Playfair Display"', 'Georgia', 'ui-serif', 'serif'],
      },
      borderRadius: {
        xl: '14px',
        '2xl': '18px',
        '3xl': '24px',
      },
      boxShadow: {
        soft: '0 1px 2px rgba(26, 47, 40, 0.04), 0 1px 3px rgba(26, 47, 40, 0.05)',
        lift: '0 6px 18px rgba(26, 47, 40, 0.08), 0 2px 6px rgba(26, 47, 40, 0.05)',
        pop:  '0 16px 40px rgba(26, 47, 40, 0.14), 0 4px 12px rgba(26, 47, 40, 0.07)',
      },
    },
  },
  plugins: [],
};
export default config;

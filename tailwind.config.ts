import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        karni: { 50: '#fdf6f0', 100: '#f8e6d3', 500: '#b8865f', 600: '#9a6a45', 700: '#7a522f', 900: '#3a2412' },
      },
    },
  },
  plugins: [],
};
export default config;

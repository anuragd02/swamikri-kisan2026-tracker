/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Extracted from the Swamikri Labs logo
        forest: { DEFAULT: '#265022', 50: '#EEF4EC', 100: '#DCE8D8', 200: '#B7CFB0', 600: '#2F6229', 700: '#265022', 800: '#1D3E1A', 900: '#152C13' },
        leaf: { DEFAULT: '#94C750', 50: '#F3F9EA', 100: '#E4F1D0', 300: '#B9DB8C', 500: '#94C750', 700: '#5E8A26' },
        // Supporting palette (agricultural fallback, A10)
        ochre: { DEFAULT: '#B7791F', 50: '#FBF4E6', 100: '#F5E3BF', 700: '#8A5A14' },
        soil: { DEFAULT: '#6B4A2B' },
        paper: '#F6F5EF',
        ink: { DEFAULT: '#1B2118', muted: '#525A4E', faint: '#7A8175' },
        line: '#E3E2D9',
        danger: { DEFAULT: '#B42318', 50: '#FEF3F2', 100: '#FEE4E2' },
        info: { DEFAULT: '#1D5FA8', 50: '#EFF5FC' },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(27,33,24,0.06), 0 1px 1px rgba(27,33,24,0.04)',
        pop: '0 12px 32px rgba(27,33,24,0.16), 0 2px 6px rgba(27,33,24,0.08)',
      },
    },
  },
  plugins: [],
};

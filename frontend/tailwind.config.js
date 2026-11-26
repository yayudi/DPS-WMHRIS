const DARK_THEMES = ['gelap', 'darah', 'hutan', 'lautan', 'sunset', 'retro']
const DARK_MODE_SELECTOR = [
  '.dark, .dark *',
  ...DARK_THEMES.map(theme => `[data-theme="${theme}"], [data-theme="${theme}"] *`)
].join(', ')

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['variant', `&:where(${DARK_MODE_SELECTOR})`],
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      // Daftarkan nama warna semantik yang akan kita gunakan di seluruh aplikasi
      colors: {
        text: 'hsl(var(--color-text) / <alpha-value>)',
        background: 'hsl(var(--color-background) / <alpha-value>)',
        primary: 'hsl(var(--color-primary) / <alpha-value>)',
        secondary: 'hsl(var(--color-secondary) / <alpha-value>)',
        accent: 'hsl(var(--color-accent) / <alpha-value>)',
        success: 'hsl(var(--color-success) / <alpha-value>)',
        warning: 'hsl(var(--color-warning) / <alpha-value>)',
        danger: 'hsl(var(--color-danger) / <alpha-value>)'
      },
      keyframes: {
        'fade-in-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      },
      animation: {
        'fade-in-down': 'fade-in-down 0.3s ease-out'
      }
    }
  },
  plugins: []
}

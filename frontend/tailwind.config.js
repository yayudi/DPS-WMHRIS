/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Daftarkan nama warna semantik yang akan kita gunakan di seluruh aplikasi
      colors: {
        'text': 'hsl(var(--color-text) / <alpha-value>)',
        'background': 'hsl(var(--color-background) / <alpha-value>)',
        'primary': 'hsl(var(--color-primary) / <alpha-value>)',
        'secondary': 'hsl(var(--color-secondary) / <alpha-value>)',
        'accent': 'hsl(var(--color-accent) / <alpha-value>)',
      }
    },
  },
  plugins: [],
}

// src/composables/useTheme.js
import { ref } from 'vue'

// State ditaruh di luar agar persistensi terjaga antar komponen
const currentTheme = ref(localStorage.getItem('theme') || 'terang')

const themes = [
  'terang',
  'gelap',
  'sepia',
  'gurun',
  'darah',
  'hutan',
  'lautan',
  'pantai',
  'sunset',
  'permen',
  'retro',
]

export function useTheme() {
  // Fungsi inti untuk apply ke DOM & Storage
  const applyTheme = (themeName) => {
    currentTheme.value = themeName
    document.documentElement.setAttribute('data-theme', themeName)
    localStorage.setItem('theme', themeName)
  }

  // Fungsi inisialisasi (dipanggil sekali saat App start)
  const initTheme = () => {
    applyTheme(currentTheme.value)
  }

  return {
    themes,
    currentTheme,
    applyTheme,
    initTheme,
  }
}

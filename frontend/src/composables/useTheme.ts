import { ref, computed, onMounted, onUnmounted } from 'vue'

const currentTheme = ref('terang')
if (typeof window !== 'undefined') {
  currentTheme.value = localStorage.getItem('theme') || 'terang'
}

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

/**
 * State warna tema global.
 */
const themeColors = ref({
  primary: '#3b82f6',
  secondary: '#64748b',
  accent: '#a855f7',
  success: '#22c55e',
  warning: '#eab308',
  danger: '#ef4444',
  text: '#1f2937',
  background: '#ffffff'
})

let observer = null
let instanceCount = 0

const isThemeChanging = ref(false)

let updateTimer = null
const updateThemeColors = () => {
  if (typeof window === 'undefined') return
  
  if (updateTimer) clearTimeout(updateTimer)
  updateTimer = setTimeout(() => {
    const style = getComputedStyle(document.documentElement)
    const getHex = (varName) => {
      let val = style.getPropertyValue(varName).trim()
      if (!val) return '#888888'
      const parts = val.replace(/%/g, '').split(/\s+/)
      if (parts.length < 3) return '#888888'

      let h = parseFloat(parts[0])
      let s = parseFloat(parts[1]) / 100
      let l = parseFloat(parts[2]) / 100

      let a = s * Math.min(l, 1 - l)
      let f = (n, k = (n + h / 30) % 12) => l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)

      const toHex = x => {
        const hex = Math.round(x * 255).toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }
      return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
    }

    const newColors = {
      primary: getHex('--color-primary'),
      secondary: getHex('--color-secondary'),
      accent: getHex('--color-accent'),
      success: getHex('--color-success'),
      warning: getHex('--color-warning'),
      danger: getHex('--color-danger'),
      text: getHex('--color-text'),
      background: getHex('--color-background')
    }

    let changed = false
    for (const key in newColors) {
      if (newColors[key] !== themeColors.value[key]) {
        changed = true
        break
      }
    }

    if (changed) {
      // Unmount charts
      isThemeChanging.value = true
      
      setTimeout(() => {
        // Update options while charts are unmounted
        themeColors.value = newColors
        
        // Update HTML meta theme-color
        const metaThemeColor = document.querySelector('meta[name="theme-color"]')
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', newColors.background)
        }
        
        // Remount charts
        setTimeout(() => {
          isThemeChanging.value = false
        }, 50)
      }, 50)
    }
  }, 100) // Debounce delay
}

const getBrightness = (hex) => {
  if (!hex || hex.length < 7) return 255
  let r = parseInt(hex.slice(1, 3), 16)
  let g = parseInt(hex.slice(3, 5), 16)
  let b = parseInt(hex.slice(5, 7), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return 255
  return (r * 299 + g * 587 + b * 114) / 1000
}

const isDarkTheme = computed(() => getBrightness(themeColors.value.background) < 128)

export function useTheme() {
  const applyTheme = (themeName) => {
    currentTheme.value = themeName
    if (typeof window !== 'undefined') {
      document.documentElement.setAttribute('data-theme', themeName)
      localStorage.setItem('theme', themeName)
      updateThemeColors()
    }
  }

  const initTheme = () => {
    applyTheme(currentTheme.value)
  }

  onMounted(() => {
    instanceCount++
    if (instanceCount === 1 && typeof window !== 'undefined') {
      updateThemeColors()
      observer = new MutationObserver(() => updateThemeColors())
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] })
    }
  })

  onUnmounted(() => {
    instanceCount--
    if (instanceCount === 0 && observer) {
      observer.disconnect()
      observer = null
    }
  })

  return {
    themes,
    currentTheme,
    applyTheme,
    initTheme,
    themeColors,
    isDarkTheme,
    isThemeChanging
  }
}

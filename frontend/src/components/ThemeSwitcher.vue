<script setup>
import { ref, watch, onMounted } from 'vue'

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
const currentTheme = ref(localStorage.getItem('theme') || 'terang')

watch(
  () => currentTheme.value,
  (newTheme, oldTheme) => {
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
  },
)

onMounted(() => {
  document.documentElement.setAttribute('data-theme', currentTheme.value)
})
</script>

<template>
  <div>
    <label for="theme-select" class="text-sm font-medium text-text/80">Pilih Tema:</label>
    <select
      id="theme-select"
      v-model="currentTheme"
      class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-secondary bg-background text-text border rounded-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
    >
      <option v-for="theme in themes" :key="theme" :value="theme">
        {{ theme.charAt(0).toUpperCase() + theme.slice(1) }}
      </option>
    </select>
  </div>
</template>

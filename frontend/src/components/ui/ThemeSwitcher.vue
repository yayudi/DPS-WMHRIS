<!-- frontend\src\components\ui\ThemeSwitcher.vue -->
<script setup>
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme' // Sesuaikan path

const { themes, currentTheme, applyTheme } = useTheme()

// Proxy computed agar v-model bisa mentrigger fungsi applyTheme
const themeProxy = computed({
  get: () => currentTheme.value,
  set: (val) => applyTheme(val),
})
</script>

<template>
  <div>
    <label for="theme-select" class="text-sm font-medium text-text/80">Pilih Tema:</label>
    <select
      id="theme-select"
      v-model="themeProxy"
      class="mt-1 block w-full pl-3 pr-10 py-2 text-base border-secondary bg-background text-text border rounded-md focus:outline-none focus:ring-primary focus:border-primary sm:text-sm"
    >
      <option v-for="theme in themes" :key="theme" :value="theme">
        {{ theme.charAt(0).toUpperCase() + theme.slice(1) }}
      </option>
    </select>
  </div>
</template>

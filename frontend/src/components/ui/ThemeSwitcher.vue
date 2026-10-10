<script setup>
import { computed } from 'vue'
import { useTheme } from '@/composables/useTheme'
import BaseSelect from '@/components/ui/BaseSelect.vue'

const { themes, currentTheme, applyTheme } = useTheme()
const themeOptions = computed(() => {
  return themes.map(theme => ({
    id: theme,
    label: theme.charAt(0).toUpperCase() + theme.slice(1)
  }))
})

// Proxy computed agar v-model bisa mentrigger fungsi applyTheme
const themeProxy = computed({
  get: () => currentTheme.value,
  set: (val) => applyTheme(val),
})
</script>

<template>
  <div>
    <label for="theme-select" class="text-sm font-medium text-text/80 mb-1 block">Pilih Tema:</label>
    <div class="w-full">
      <BaseSelect id="theme-select" v-model="themeProxy" :options="themeOptions" :emitValue="true" trackBy="id"
        label="label" :searchable="false" placeholder="Pilih tema..." />
    </div>
  </div>
</template>

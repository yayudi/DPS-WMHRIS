<script setup>
import { computed } from 'vue'
import { useTheme } from '@/core/presentation/composables/useTheme'
import BaseSelect from '@/core/presentation/components/ui/BaseSelect.vue'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { t } = useI18n()
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
    <label for="theme-select" class="text-sm font-medium text-text/80 mb-1 block">{{ t('core.theme.select_theme') }}</label>
    <div class="w-full">
      <BaseSelect id="theme-select" v-model="themeProxy" :options="themeOptions" :emitValue="true" trackBy="id"
        label="label" :searchable="false" :placeholder="t('core.theme.placeholder')" />
    </div>
  </div>
</template>

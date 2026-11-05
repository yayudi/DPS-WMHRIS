<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from '@/core/presentation/composables/useI18n'

const props = withDefaults(
  defineProps<{
    compact?: boolean
  }>(),
  {
    compact: false
  }
)

const { currentLocale, availableLocales, setLocale, isLoading } = useI18n()
const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

function toggleDropdown() {
  isOpen.value = !isOpen.value
}

function selectLocale(code: string) {
  setLocale(code)
  isOpen.value = false
}

function handleClickOutside(event: MouseEvent) {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside)
})
</script>

<template>
  <div class="relative inline-block text-left" ref="dropdownRef">
    <!-- Trigger Button -->
    <button
      type="button"
      @click="toggleDropdown"
      class="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm font-medium text-text/80 hover:text-primary hover:bg-secondary/10 transition-colors focus:outline-none"
      :title="`Pilih Bahasa (Saat ini: ${currentLocale})`"
      :disabled="isLoading"
    >
      <font-awesome-icon icon="fa-solid fa-language" class="text-base text-primary" />
      <span v-if="!compact" class="text-xs font-semibold tracking-wider uppercase">
        {{ currentLocale === 'id-ID' ? 'ID' : 'EN' }}
      </span>
      <font-awesome-icon
        icon="fa-solid fa-chevron-down"
        class="text-[10px] text-text/40 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <!-- Dropdown Menu -->
    <div
      v-if="isOpen"
      class="absolute right-0 mt-1.5 w-44 bg-background border border-secondary/20 rounded-lg shadow-xl py-1 z-50 text-xs font-medium focus:outline-none"
    >
      <div class="px-3 py-1.5 text-[11px] font-semibold text-text/50 uppercase tracking-wider border-b border-secondary/10">
        Pilih Bahasa / Language
      </div>
      <button
        v-for="loc in availableLocales"
        :key="loc.code"
        type="button"
        @click="selectLocale(loc.code)"
        class="w-full text-left px-3 py-2 flex items-center justify-between hover:bg-secondary/15 transition-colors"
        :class="{ 'text-primary font-bold bg-primary/5': currentLocale === loc.code, 'text-text/80': currentLocale !== loc.code }"
      >
        <span class="flex items-center gap-2">
          <span class="w-5 text-center font-bold text-[10px] px-1 py-0.5 rounded bg-secondary/20 text-text/90 uppercase">
            {{ loc.code === 'id-ID' ? 'ID' : 'EN' }}
          </span>
          <span>{{ loc.name }}</span>
        </span>
        <font-awesome-icon
          v-if="currentLocale === loc.code"
          icon="fa-solid fa-check"
          class="text-primary text-xs"
        />
      </button>
    </div>
  </div>
</template>


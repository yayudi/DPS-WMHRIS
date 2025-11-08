<script setup>
import { computed } from 'vue'

// Komponen ini menggunakan v-model
// Menerima prop 'modelValue' dan emit 'update:modelValue'
const props = defineProps({
  modelValue: {
    type: String,
    default: '',
  },
  placeholder: {
    type: String,
    default: 'Cari...',
  },
})

const emit = defineEmits(['update:modelValue'])

// Computed property untuk mempermudah binding
const value = computed({
  get() {
    return props.modelValue
  },
  set(val) {
    emit('update:modelValue', val)
  },
})

// Fungsi untuk membersihkan input
function clearInput() {
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="relative w-full">
    <!-- Ikon pencarian di kiri (opsional) -->
    <div class="absolute left-3 top-1/2 -translate-y-1/2 text-text/40">
      <font-awesome-icon icon="fa-solid fa-search" />
    </div>

    <!-- Input utama -->
    <input
      v-model="value"
      :placeholder="placeholder"
      type="text"
      class="w-full rounded-lg border border-secondary/30 bg-background py-2 pl-10 pr-10 text-sm text-text focus:border-primary focus:ring-1 focus:ring-primary"
    />

    <!-- Tombol 'x' (Clear) di kanan -->
    <button
      v-if="value"
      @click="clearInput"
      type="button"
      class="absolute right-3 top-1/2 -translate-y-1/2 text-text/40 hover:text-text"
      title="Bersihkan"
    >
      <font-awesome-icon icon="fa-solid fa-times-circle" />
    </button>
  </div>
</template>

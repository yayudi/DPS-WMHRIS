<!-- frontend/src/components/products/ExportModal.vue -->
<script setup>
import { ref } from 'vue'

const props = defineProps({
  isOpen: Boolean,
  isLoading: Boolean,
})

const emit = defineEmits(['close', 'export'])

const format = ref('xlsx')

const handleExport = () => {
  emit('export', { format: format.value })
  emit('close')
}
</script>

<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
  >
    <div
      class="bg-[hsl(var(--color-background))] text-[hsl(var(--color-text))] rounded-xl shadow-2xl w-full max-w-md p-6 transform transition-all border border-[hsl(var(--color-secondary))/0.3]"
    >
      <div class="flex justify-between items-center mb-6">
        <h3 class="text-xl font-bold">Export Produk</h3>
        <button
          @click="$emit('close')"
          class="text-[hsl(var(--color-text))] opacity-50 hover:opacity-100 transition-opacity text-2xl leading-none"
        >
          &times;
        </button>
      </div>

      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2 opacity-80">Pilih Format File</label>
          <div class="grid grid-cols-2 gap-4">
            <label
              class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all hover:bg-[hsl(var(--color-secondary))/0.1]"
              :class="
                format === 'xlsx'
                  ? 'border-[hsl(var(--color-success))] bg-[hsl(var(--color-success))/0.05]'
                  : 'border-[hsl(var(--color-secondary))/0.3]'
              "
            >
              <input type="radio" v-model="format" value="xlsx" class="hidden" />
              <font-awesome-icon
                icon="fa-solid fa-file-excel"
                class="text-2xl text-[hsl(var(--color-success))]"
              />
              <div>
                <div class="font-bold">Excel (.xlsx)</div>
                <div class="text-xs opacity-60">Format standar</div>
              </div>
            </label>

            <label
              class="flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-all hover:bg-[hsl(var(--color-secondary))/0.1]"
              :class="
                format === 'csv'
                  ? 'border-[hsl(var(--color-primary))] bg-[hsl(var(--color-primary))/0.05]'
                  : 'border-[hsl(var(--color-secondary))/0.3]'
              "
            >
              <input type="radio" v-model="format" value="csv" class="hidden" />
              <font-awesome-icon
                icon="fa-solid fa-file-csv"
                class="text-2xl text-[hsl(var(--color-primary))]"
              />
              <div>
                <div class="font-bold">CSV (.csv)</div>
                <div class="text-xs opacity-60">Kompatibilitas tinggi</div>
              </div>
            </label>
          </div>
        </div>

        <div
          class="bg-[hsl(var(--color-warning))/0.1] text-[hsl(var(--color-warning))] p-3 rounded-lg text-sm flex gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-circle-info" class="mt-0.5" />
          <p>
            Export akan berjalan di latar belakang (Background Job). Anda akan menerima notifikasi
            dan file dapat diunduh di menu <b>Laporan Saya</b>.
          </p>
        </div>
      </div>

      <div class="mt-6 flex justify-end gap-3">
        <button
          @click="$emit('close')"
          class="px-5 py-2.5 rounded-lg font-medium opacity-70 hover:opacity-100 hover:bg-[hsl(var(--color-secondary))/0.1]"
        >
          Batal
        </button>
        <button
          @click="handleExport"
          :disabled="isLoading"
          class="px-5 py-2.5 bg-[hsl(var(--color-primary))] text-white rounded-lg shadow-lg font-bold hover:bg-[hsl(var(--color-primary))/0.9] flex items-center gap-2 disabled:opacity-50"
        >
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" spin />
          <span>Mulai Export</span>
        </button>
      </div>
    </div>
  </div>
</template>

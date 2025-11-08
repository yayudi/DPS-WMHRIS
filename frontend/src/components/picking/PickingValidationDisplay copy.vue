<script setup>
import { ref, computed, watch } from 'vue'

// Props: Menerima hasil validasi dan status loading
const props = defineProps({
  validationResults: {
    type: Object,
    required: true,
    // Default value to prevent errors before data arrives
    default: () => ({ pickingListId: null, validItems: [], invalidSkus: [] }),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  // Pesan loading opsional
  loadingMessage: {
    type: String,
    default: 'Memproses...',
  },
})

// Emits: Memberi tahu parent tentang aksi user
const emit = defineEmits(['cancel', 'confirm'])

// State Internal: Mengelola item mana yang dicentang
const selectedItems = ref({}) // Format: { sku: true/false }

// Watcher untuk mereset/menginisialisasi checkbox saat validationResults berubah
watch(
  () => props.validationResults,
  (newResults) => {
    selectedItems.value = {} // Reset dulu
    if (newResults?.validItems) {
      // Secara default, pilih semua item yang stoknya cukup (atau semua item)
      newResults.validItems.forEach((item) => {
        // Anda bisa tambahkan logika di sini jika ingin hanya memilih item
        // yang stoknya cukup secara default: if (item.current_stock >= item.qty)
        selectedItems.value[item.sku] = true
      })
    }
  },
  { immediate: true, deep: true }, // immediate: jalankan saat awal; deep: perhatikan perubahan dalam objek
)

// Computed: Logika untuk checkbox "Select All"
const allValidItemsSelected = computed({
  get() {
    if (!props.validationResults?.validItems || props.validationResults.validItems.length === 0) {
      return false
    }
    // True jika semua item valid ada di selectedItems dan nilainya true
    return props.validationResults.validItems.every((item) => selectedItems.value[item.sku])
  },
  set(value) {
    if (!props.validationResults?.validItems) return
    props.validationResults.validItems.forEach((item) => {
      selectedItems.value[item.sku] = value
    })
  },
})

// Computed: Menghitung item yang dicentang untuk dikirim
const itemsToConfirm = computed(() => {
  if (!props.validationResults?.validItems) {
    return []
  }
  // Filter validItems berdasarkan state checkbox selectedItems
  return props.validationResults.validItems
    .filter((item) => selectedItems.value[item.sku])
    .map((item) => ({ sku: item.sku, qty: item.qty })) // Kirim hanya sku dan qty
})

// Computed: Status disable tombol konfirmasi
const isConfirmDisabled = computed(() => {
  return props.isLoading || itemsToConfirm.value.length === 0
})

// Method: Emit event saat tombol diklik
function handleCancel() {
  emit('cancel')
}

function handleConfirm() {
  // Emit array item yang dipilih (hanya sku & qty)
  emit('confirm', itemsToConfirm.value)
}
</script>

<template>
  <div class="border-t border-secondary/20 pt-6 space-y-4">
    <h3 class="text-lg font-semibold text-text">Validasi Data Picking List</h3>

    <!-- Peringatan SKU Tidak Valid -->
    <div
      v-if="validationResults.invalidSkus && validationResults.invalidSkus.length > 0"
      class="p-4 bg-accent/10 border border-accent/30 rounded-lg text-sm text-accent"
    >
      <h4 class="font-bold mb-1">
        <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="mr-2" />SKU Tidak
        Ditemukan!
      </h4>
      <p class="mb-2">SKU berikut tidak ada di database dan akan diabaikan:</p>
      <ul class="list-disc list-inside font-mono text-xs pl-2">
        <li v-for="sku in validationResults.invalidSkus" :key="sku">{{ sku }}</li>
      </ul>
    </div>

    <!-- Tabel Item Valid -->
    <div
      v-if="validationResults.validItems && validationResults.validItems.length > 0"
      class="max-h-[60vh] overflow-y-auto border border-secondary/20 rounded-lg"
    >
      <table class="min-w-full text-sm">
        <thead class="bg-secondary/10 sticky top-0 z-10">
          <tr>
            <th class="p-2 w-12">
              <input
                type="checkbox"
                :checked="allValidItemsSelected"
                @change="allValidItemsSelected = $event.target.checked"
                title="Pilih/Batal Pilih Semua"
                class="form-checkbox h-4 w-4 text-primary rounded border-secondary/50 focus:ring-primary/50"
              />
            </th>
            <th class="p-2 text-left">SKU</th>
            <th class="p-2 text-left">Nama Produk</th>
            <th class="p-2 text-center">Stok Display</th>
            <th class="p-2 text-center w-24">Qty Ambil</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/20">
          <template v-for="item in validationResults.validItems" :key="item.sku">
            <!-- Baris Utama (Paket atau Single) -->
            <tr
              :class="{
                'bg-accent/5': item.current_stock < item.qty, // Sorot jika stok kurang
                'hover:bg-primary/5': true, // Efek hover
                'opacity-50': !selectedItems[item.sku], // Redupkan jika tidak dipilih
              }"
            >
              <td class="p-2 text-center">
                <input
                  type="checkbox"
                  :value="item.sku"
                  v-model="selectedItems[item.sku]"
                  class="form-checkbox h-4 w-4 text-primary rounded border-secondary/50 focus:ring-primary/50"
                />
              </td>
              <td class="p-2 font-mono">{{ item.sku }}</td>
              <td class="p-2">{{ item.name }}</td>
              <td
                class="p-2 text-center font-semibold"
                :class="{
                  'text-accent': item.current_stock < item.qty,
                  'text-text/90': item.current_stock >= item.qty,
                }"
              >
                {{ item.current_stock }}
                <font-awesome-icon
                  v-if="item.current_stock < item.qty"
                  icon="fa-solid fa-triangle-exclamation"
                  class="ml-1 text-warning"
                  title="Stok display tidak mencukupi!"
                />
              </td>
              <td class="p-2 text-center">
                <span class="font-bold">{{ item.qty }}</span>
                <!-- Qty hanya ditampilkan, tidak bisa diedit -->
              </td>
            </tr>
            <!-- Baris Komponen -->
            <template v-if="item.is_package && item.components && item.components.length > 0">
              <tr
                v-for="(comp, index) in item.components"
                :key="`${item.sku}-${comp.component_sku}`"
                class="bg-secondary/5 text-xs text-text/80"
                :class="{ 'opacity-50': !selectedItems[item.sku] }"
              >
                <td class="py-1 px-2 text-right italic" colspan="2">
                  <font-awesome-icon
                    icon="fa-solid fa-level-up-alt"
                    rotation="90"
                    class="mr-2 opacity-50"
                  />
                  {{ index + 1 }} :
                </td>
                <td class="py-1 px-2 italic">
                  <span class="font-mono mr-1">[{{ comp.component_sku }}]</span>
                  {{ comp.component_name }}
                </td>
                <td class="py-1 px-2 text-center italic">
                  <span
                    v-if="comp.component_stock_display !== undefined"
                    :class="{
                      'text-accent':
                        comp.component_stock_display < item.qty * comp.quantity_per_package,
                    }"
                  >
                    {{ comp.component_stock_display }}
                  </span>
                </td>
                <td class="py-1 px-2 text-center italic">
                  {{ item.qty * comp.quantity_per_package }}
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>
    <div
      v-else-if="!validationResults.invalidSkus || validationResults.invalidSkus.length === 0"
      class="text-center py-6 text-text/60 italic"
    >
      Tidak ada item valid yang ditemukan dalam file ini.
    </div>

    <!-- Tombol Aksi Validasi -->
    <div
      v-if="validationResults.validItems && validationResults.validItems.length > 0"
      class="flex justify-between items-center pt-6 border-t border-secondary/20"
    >
      <span class="text-sm font-semibold text-text/80"
        >{{ itemsToConfirm.length }} item dipilih.</span
      >
      <div class="flex gap-4">
        <button
          @click="handleCancel"
          class="px-4 py-2 bg-secondary/30 text-text/90 rounded-lg text-sm font-semibold hover:bg-secondary/40"
          :disabled="isLoading"
        >
          Batal
        </button>
        <button
          @click="handleConfirm"
          :disabled="isConfirmDisabled"
          class="px-6 py-2 bg-accent text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-2"
        >
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
          <span>{{ isLoading ? loadingMessage : 'Konfirmasi & Kurangi Stok' }}</span>
        </button>
      </div>
    </div>
  </div>
  <!-- Tampilkan pesan jika validationResults null tapi tidak loading (misal setelah cancel) -->
  <div v-if="!isLoading" class="text-center py-6 text-text/60 italic">
    Silakan upload file untuk memulai validasi.
  </div>
</template>

<style scoped>
/* Targeting direct child rows for hover effect */
tbody > tr:not(.bg-secondary\/5):hover {
  background-color: rgba(var(--color-primary), 0.05);
}
</style>

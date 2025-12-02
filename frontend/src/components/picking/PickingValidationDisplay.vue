<!-- frontend\src\components\picking\PickingValidationDisplay.vue -->
<script setup>
import { ref, computed, watch } from 'vue'

// Props (Tidak berubah)
const props = defineProps({
  validationResults: {
    type: Object,
    required: true,
    default: () => ({ pickingListId: null, validItems: [], invalidSkus: [] }),
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  loadingMessage: {
    type: String,
    default: 'Memproses...',
  },
})

// Emits (Tidak berubah)
const emit = defineEmits(['cancel', 'confirm'])

// --- STATE INTERNAL DIUBAH ---
const selectedItems = ref({}) // Format: { [package_sku]: true/false } (Tetap)

// ✅ STATE DIUBAH: Key sekarang spesifik per item yang BISA dipilih lokasinya
// Format: { 'SKU-SINGLE': loc_id_1, 'PAKET-SKU-COMP-SKU': loc_id_2 }
const selectedLocations = ref({})

// Menginisialisasi state baru
watch(
  () => props.validationResults,
  (newResults) => {
    selectedItems.value = {}
    selectedLocations.value = {}

    if (newResults?.validItems) {
      newResults.validItems.forEach((item) => {
        let hasSufficientStock = true

        if (item.is_package) {
          // --- Logika untuk Paket ---
          if (item.components && item.components.length > 0) {
            item.components.forEach((comp) => {
              const key = `${item.sku}-${comp.component_sku}`
              // Set dropdown komponen ke saran backend
              selectedLocations.value[key] = comp.suggestedLocationId
              if (!comp.suggestedLocationId) {
                hasSufficientStock = false // Tandai jika 1 komponen saja stoknya kurang
              }
            })
          }
          // Centang paket secara default HANYA jika semua komponennya punya saran stok
          selectedItems.value[item.sku] = hasSufficientStock
        } else {
          // --- Logika untuk Item Single ---
          // Set dropdown item single ke saran backend
          selectedLocations.value[item.sku] = item.suggestedLocationId
          if (!item.suggestedLocationId) {
            hasSufficientStock = false // Tandai jika stok item single kurang
          }
          // Centang item single secara default HANYA jika punya saran stok
          selectedItems.value[item.sku] = hasSufficientStock
        }
      })
    }
  },
  { immediate: true, deep: true },
)

// Computed: Logika checkbox "Select All" (Tetap)
const allValidItemsSelected = computed({
  get() {
    if (!props.validationResults?.validItems || props.validationResults.validItems.length === 0) {
      return false
    }
    return props.validationResults.validItems.every((item) => selectedItems.value[item.sku])
  },
  set(value) {
    if (!props.validationResults?.validItems) return
    props.validationResults.validItems.forEach((item) => {
      selectedItems.value[item.sku] = value
    })
  },
})

// Membuat payload "datar" (FLAT)
const itemsToConfirm = computed(() => {
  const finalFlatItems = []
  if (!props.validationResults?.validItems) {
    return finalFlatItems
  }

  // Iterasi item yang divalidasi
  props.validationResults.validItems
    .filter((item) => selectedItems.value[item.sku]) // Filter yg dicentang
    .forEach((item) => {
      if (item.is_package) {
        // --- Jika PAKET ---
        // Jangan tambahkan baris paket. Tambahkan KOMPONEN-nya.
        if (item.components && item.components.length > 0) {
          item.components.forEach((comp) => {
            const key = `${item.sku}-${comp.component_sku}`
            const compQty = item.qty * comp.quantity_per_package
            finalFlatItems.push({
              sku: comp.component_sku, // SKU Komponen
              qty: compQty, // Qty Komponen
              fromLocationId: selectedLocations.value[key], // Lokasi yg dipilih u/ komponen
              invoiceNos: item.invoiceNos,
              customerNames: item.customerNames,
            })
          })
        }
      } else {
        // --- Jika ITEM SINGLE ---
        // Tambahkan item single seperti biasa.
        finalFlatItems.push({
          sku: item.sku,
          qty: item.qty,
          fromLocationId: selectedLocations.value[item.sku], // Lokasi yg dipilih u/ item
          invoiceNos: item.invoiceNos,
          customerNames: item.customerNames,
        })
      }
    })

  return finalFlatItems
})

// Validasi payload "datar"
const hasInvalidSelection = computed(() => {
  // Cek jika ada item di payload akhir yg tidak punya fromLocationId
  return itemsToConfirm.value.some((item) => !item.fromLocationId)
})

// Computed: Status disable tombol konfirmasi (Logika internal tetap valid)
const isConfirmDisabled = computed(() => {
  return props.isLoading || itemsToConfirm.value.length === 0 || hasInvalidSelection.value
})

// Method: Emit event saat tombol diklik (Tidak berubah)
function handleCancel() {
  emit('cancel')
}

// Method: Emit event saat tombol diklik (Tidak berubah)
// `itemsToConfirm` yg di-emit sekarang sudah "datar" secara otomatis
function handleConfirm() {
  if (hasInvalidSelection.value) {
    alert(
      'Gagal: Terdapat item atau komponen yang dicentang namun tidak memiliki lokasi pengambilan yang valid (stok tidak cukup atau belum dipilih).',
    )
    return
  }
  emit('confirm', itemsToConfirm.value)
}

// Helper untuk memformat dropdown (Tidak berubah)
function formatLocationOption(loc, itemQty) {
  const stockInfo =
    loc.quantity < itemQty ? `Stok: ${loc.quantity} (KURANG)` : `Stok: ${loc.quantity}`
  return `${loc.code} (${stockInfo})`
}
</script>

<template>
  <div class="border-t border-secondary/20 pt-6 space-y-4">
    <h3 class="text-lg font-semibold text-text">Validasi Data Picking List</h3>

    <div
      v-if="validationResults.invalidSkus && validationResults.invalidSkus.length > 0"
      class="p-4 bg-accent/10 border border-accent/30 rounded-lg text-sm text-accent"
    >
      <h4 class="font-bold mb-1">
        <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="mr-2" />SKU Tidak Valid!
      </h4>
      <p class="mb-2">SKU berikut bermasalah (stok/komponen tidak cukup) dan akan diabaikan:</p>
      <ul class="list-disc list-inside font-mono text-xs pl-2">
        <li v-for="sku in validationResults.invalidSkus" :key="sku">{{ sku }}</li>
      </ul>
    </div>

    <div
      v-if="validationResults.validItems && validationResults.validItems.length > 0"
      class="max-h-[60vh] overflow-y-auto border border-secondary/20 rounded-lg"
    >
      <table class="min-w-full text-sm">
        <thead class="bg-secondary/10 sticky top-0 z-10 uppercase text-xs text-text/70">
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
            <th class="p-2 text-center w-24">Qty Ambil</th>
            <th class="p-2 text-left w-56">Ambil Dari (Lokasi Disarankan)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/20">
          <template v-for="item in validationResults.validItems" :key="item.sku">
            <tr
              :class="{
                'hover:bg-primary/5': true,
                'opacity-50': !selectedItems[item.sku],
                // Sorot merah jika item dicentang tapi punya komponen yg tidak valid
                'bg-accent/10': selectedItems[item.sku] && hasInvalidSelection,
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
              <td class="p-2 text-center">
                <span class="font-bold">{{ item.qty }}</span>
              </td>

              <td class="p-2">
                <select
                  v-if="
                    !item.is_package &&
                    item.availableLocations &&
                    item.availableLocations.length > 0
                  "
                  v-model="selectedLocations[item.sku]"
                  class="w-full bg-background border border-secondary/30 text-text text-xs rounded-md focus:ring-primary/50 focus:border-primary block p-2 form-select"
                  :class="{ 'border-accent text-accent': !selectedLocations[item.sku] }"
                >
                  <option :value="null" disabled>-- Stok tidak cukup --</option>
                  <optgroup label="Stok Cukup (Disarankan)">
                    <option
                      v-for="loc in item.availableLocations.filter((l) => l.quantity >= item.qty)"
                      :key="loc.location_id"
                      :value="loc.location_id"
                    >
                      {{ formatLocationOption(loc, item.qty) }}
                    </option>
                  </optgroup>
                  <optgroup label="Stok Kurang">
                    <option
                      v-for="loc in item.availableLocations.filter((l) => l.quantity < item.qty)"
                      :key="loc.location_id"
                      :value="loc.location_id"
                      class="text-accent"
                    >
                      {{ formatLocationOption(loc, item.qty) }}
                    </option>
                  </optgroup>
                </select>

                <div v-else-if="item.is_package" class="text-xs text-text/70 p-2 italic">
                  -- Pilih lokasi per komponen --
                </div>

                <div v-else class="text-xs text-accent text-left p-2 font-semibold">
                  <font-awesome-icon icon="fa-solid fa-triangle-exclamation" class="mr-1" />
                  Stok 0 di semua lokasi DISPLAY.
                </div>
              </td>
            </tr>

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
                <td class="py-1 px-2 text-center italic font-semibold">
                  {{ item.qty * comp.quantity_per_package }}
                </td>

                <td class="py-1 px-2 text-left italic">
                  <select
                    v-if="comp.availableLocations.length > 0"
                    v-model="selectedLocations[`${item.sku}-${comp.component_sku}`]"
                    class="w-full bg-background border border-secondary/30 text-text text-xs rounded-md focus:ring-primary/50 focus:border-primary block p-2 form-select"
                    :class="{
                      'border-accent text-accent':
                        !selectedLocations[`${item.sku}-${comp.component_sku}`],
                    }"
                  >
                    <!-- <option v-if="!comp.suggestedLocationId" :value="null" disabled> -->
                    <option v-if="!selectedLocations[item.sku]" :value="null" disabled>
                      -- Pilih Lokasi (Stok Kurang) --
                    </option>
                    <optgroup label="Stok Cukup (Disarankan)">
                      <option
                        v-for="loc in comp.availableLocations.filter(
                          (l) => l.quantity >= item.qty * comp.quantity_per_package,
                        )"
                        :key="loc.location_id"
                        :value="loc.location_id"
                      >
                        {{ formatLocationOption(loc, item.qty * comp.quantity_per_package) }}
                      </option>
                    </optgroup>
                    <optgroup label="Stok Kurang">
                      <option
                        v-for="loc in comp.availableLocations.filter(
                          (l) => l.quantity < item.qty * comp.quantity_per_package,
                        )"
                        :key="loc.location_id"
                        :value="loc.location_id"
                        class="text-accent"
                      >
                        {{ formatLocationOption(loc, item.qty * comp.quantity_per_package) }}
                      </option>
                    </optgroup>
                  </select>

                  <div v-else class="text-accent font-semibold text-xs flex items-center gap-1">
                    <font-awesome-icon icon="fa-solid fa-triangle-exclamation" />
                    Stok Total:
                    {{ comp.component_stock_display || 0 }}
                    (Butuh: {{ item.qty * comp.quantity_per_package }})
                  </div>
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

    <div
      v-if="validationResults.validItems && validationResults.validItems.length > 0"
      class="flex justify-between items-center pt-6 border-t border-secondary/20"
    >
      <span class="text-sm font-semibold text-text/80"
        >{{ itemsToConfirm.length }} item/komponen unik akan diproses.</span
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
          :class="{
            'bg-warning/70 cursor-not-allowed': hasInvalidSelection,
            'hover:bg-accent/90': !hasInvalidSelection,
          }"
          :title="
            hasInvalidSelection
              ? 'Beberapa item/komponen terpilih tidak memiliki lokasi valid (stok 0 atau belum dipilih)'
              : 'Konfirmasi & Kurangi Stok'
          "
        >
          <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" class="animate-spin" />
          <span>{{ isLoading ? loadingMessage : 'Konfirmasi & Kurangi Stok' }}</span>
        </button>
      </div>
    </div>
  </div>

  <div
    vIf="!isLoading && (!validationResults.validItems || validationResults.validItems.length === 0)"
    class="text-center py-6 text-text/60 italic"
  >
    Silakan upload file untuk memulai validasi.
  </div>
</template>

<style scoped>
/* Targeting direct child rows for hover effect */
tbody > tr:not(.bg-secondary\/5):hover {
  background-color: rgba(var(--color-primary), 0.05);
}

.form-select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E");
  background-position: right 0.5rem center;
  background-repeat: no-repeat;
  background-size: 1.25em 1.25em;
  padding-right: 2rem; /* Beri ruang untuk panah */
}
</style>

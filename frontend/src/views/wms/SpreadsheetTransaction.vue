<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { swalConfirm } from '@/composables/useSweetAlert'
import SmartSpreadsheet from '@/components/wms/transfer/SmartSpreadsheet.vue'
import { useMasterDataStore } from '@/stores/masterData'
import { processBatchMovement } from '@/api/helpers/stock.js'
import HotkeyBanner from '@/components/ui/HotkeyBanner.vue'
import BaseTabs from '@/components/ui/BaseTabs.vue'

const { toast } = useToast()
const masterData = useMasterDataStore()
const spreadsheetRef = ref(null)
const allLocations = ref([])
const isLoading = ref(false)
const isSubmitting = ref(false)
const transactionType = ref('TRANSFER_MULTI')

const tabs = [
  { label: 'Inbound', value: 'INBOUND' },
  { label: 'Transfer', value: 'TRANSFER_MULTI' },
  { label: 'Outbound', value: 'OUTBOUND' }
]

async function loadLocations() {
  isLoading.value = true
  try {
    const locations = await masterData.getLocations(true)
    if (locations) {
      allLocations.value = locations.map(l => ({
        id: l.id,
        code: l.code,
        name: l.name,
        type: l.type
      }))
    }
  } catch (err) {
    toast('Gagal memuat daftar lokasi', 'error')
    console.error(err)
  } finally {
    isLoading.value = false
  }
}

// Global hotkeys (Alt+S for Submit, Alt+R for Reset)
const handleGlobalKeydown = async e => {
  if (e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault()
    if (!isSubmitting.value && spreadsheetRef.value) {
      spreadsheetRef.value.handleSubmit()
    }
  }
  if (e.altKey && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    if (spreadsheetRef.value) {
      const isConfirmed = await swalConfirm('Apakah Anda yakin ingin mereset/menghapus semua baris?')
      if (isConfirmed) {
        spreadsheetRef.value.resetRows()
      }
    }
  }
}

onMounted(() => {
  loadLocations()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
})

const submitTransaction = async validRows => {
  if (validRows.length === 0) return
  isSubmitting.value = true

  try {
    const payload = {
      type: transactionType.value,
      notes: 'Transaksi via Spreadsheet',
      movements: validRows.map(r => ({
        sku: r.sku,
        fromLocationId: transactionType.value === 'INBOUND' ? null : r.fromLocationId,
        toLocationId: transactionType.value === 'OUTBOUND' ? null : r.toLocationId,
        quantity: r.quantity,
        notes: r.notes || null
      }))
    }

    const response = await processBatchMovement(payload)
    if (response.success) {
      toast('Transaksi berhasil disimpan', 'success')
      if (spreadsheetRef.value) {
        spreadsheetRef.value.resetRows()
      }
    }
  } catch (error) {
    console.error(error)
  } finally {
    isSubmitting.value = false
  }
}

const handleReset = async () => {
  const isConfirmed = await swalConfirm('Apakah Anda yakin ingin mereset/menghapus semua baris?')
  if (isConfirmed) {
    spreadsheetRef.value?.resetRows()
  }
}
</script>

<template>
  <div class="h-full flex flex-col space-y-4 animate-fade-in relative">
    <BaseTabs :tabs="tabs" v-model:model-value="transactionType" />

    <!-- Spreadsheet Component -->
    <div class="flex-1 bg-background border border-secondary/20 rounded-xl p-4 shadow-sm flex flex-col relative z-20">
      <SmartSpreadsheet
        ref="spreadsheetRef"
        :mode="transactionType"
        :all-locations="allLocations"
        :is-loading-locations="isLoading"
        @submit="submitTransaction"
      />
    </div>

    <HotkeyBanner class="relative z-10" />

    <!-- Action Buttons Floating Overlay -->
    <div class="flex justify-end pt-4 pb-1 sticky bottom-4 z-30 gap-3">
      <button
        class="bg-danger text-secondary px-6 py-2.5 rounded-lg font-bold hover:bg-error/10 hover:text-error transition-all flex items-center gap-2"
        :disabled="isSubmitting"
        @click="handleReset"
      >
        <font-awesome-icon icon="fa-solid fa-trash" />
        <span>Reset (Alt+R)</span>
      </button>

      <button
        class="bg-primary text-background px-6 py-2.5 rounded-lg font-bold shadow-md hover:bg-primary/90 hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="isSubmitting"
        @click="spreadsheetRef?.handleSubmit()"
      >
        <font-awesome-icon v-if="isSubmitting" icon="fa-solid fa-spinner" class="animate-spin" />
        <font-awesome-icon v-else icon="fa-solid fa-save" />
        <span>{{ isSubmitting ? 'Menyimpan...' : 'Simpan Transaksi (Alt+S)' }}</span>
      </button>
    </div>
  </div>
</template>

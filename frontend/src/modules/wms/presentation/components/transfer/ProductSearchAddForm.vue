<script setup>
import { ref } from 'vue'
import { useToast } from '@/core/presentation/composables/useToast'
import { useI18n } from '@/core/presentation/composables/useI18n'
import ProductSearchSelector from '@/modules/wms/presentation/components/transfer/ProductSearchSelector.vue'
import ScannerToggle from '@/modules/wms/presentation/components/scanner/ScannerToggle.vue'
import BaseModal from '@/core/presentation/components/ui/BaseModal.vue'
import BaseQrScanner from '@/core/presentation/components/ui/BaseQrScanner.vue'
import { productApi } from '@/modules/master_data/infrastructure/product.api'

const props = defineProps({
  activeTab: { type: String, required: true },
  searchLocationId: { type: [Number, String], default: null },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits(['add-product'])
const { toast } = useToast()
const { t } = useI18n()

const selectedProduct = ref(null)
const quantityToAdd = ref(1)
const enableScanner = ref(false)
const searchSelectorRef = ref(null)

function onAddClick() {
  if (!selectedProduct.value) {
    toast(t('wms.product_search.please_select_product'), 'warning')
    return
  }

  emit('add-product', {
    product: selectedProduct.value,
    quantity: quantityToAdd.value
  })

  // Reset form lokal
  selectedProduct.value = null
  quantityToAdd.value = 1
}

function handleScannerMatch(item) {
  selectedProduct.value = item
  quantityToAdd.value = 1
  onAddClick()

  // Re-focus the input automatically for the next scan
  if (searchSelectorRef.value) {
    // Timeout needed to let Vue update DOM after selection reset
    setTimeout(() => {
      searchSelectorRef.value.focusInput()
    }, 50)
  }
}

const isCameraModalOpen = ref(false)
const isScannerPaused = ref(false)
const isSearchingCamera = ref(false)

async function handleCameraDetect(code) {
  if (isScannerPaused.value || isSearchingCamera.value) return
  isSearchingCamera.value = true
  isScannerPaused.value = true

  try {
    const results = await productApi.searchProducts({ q: code, location_id: props.searchLocationId, page: 1, limit: 1 })
    let match = null
    const data = Array.isArray(results) ? results : results.data || []

    match = data.find(p => p.sku.toLowerCase() === code.toLowerCase())

    if (match) {
      selectedProduct.value = match
      quantityToAdd.value = 1
      onAddClick()
      toast(t('wms.product_search.sku_added', { code }), 'success')
      // Resume scanner
      setTimeout(() => {
        isScannerPaused.value = false
        isSearchingCamera.value = false
      }, 1000)
    } else {
      toast(t('wms.product_search.sku_not_found', { code }), 'error')
      setTimeout(() => {
        isScannerPaused.value = false
        isSearchingCamera.value = false
      }, 2000)
    }
  } catch (error) {
    console.error(error)
    toast(t('wms.product_search.sku_search_failed', { code }), 'error')
    isScannerPaused.value = false
    isSearchingCamera.value = false
  }
}
</script>

<template>
  <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-2 w-full">
    <!-- Baris 1 (Mobile): Kamera & Manual -->
    <div class="flex items-center gap-2 w-full sm:w-auto shrink-0">
      <!-- Tombol Kamera (Mobile Scanner) -->
      <button
        type="button"
        @click="isCameraModalOpen = true"
        class="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border bg-secondary/10 border-secondary/20 text-text/50 hover:bg-secondary/30 h-[38px] sm:h-[42px]"
        :title="t('wms.product_search.scan_camera_title')"
      >
        <font-awesome-icon icon="fa-solid fa-camera" />
        <span>{{ t('wms.product_search.camera') }}</span>
      </button>

      <!-- Scanner Mode Toggle -->
      <ScannerToggle v-model="enableScanner" class="flex-1 sm:flex-none justify-center h-[38px] sm:h-[42px]" />
    </div>

    <!-- Selector Pencarian -->
    <div class="flex-grow w-full">
      <ProductSearchSelector
        v-model="selectedProduct"
        ref="searchSelectorRef"
        :location-id="searchLocationId"
        :disabled="disabled"
        :enable-scanner="enableScanner"
        @scanner-match="handleScannerMatch"
        :placeholder="t('common.placeholder.search_sku')"
      />
    </div>

    <!-- Container untuk Qty, Stok & Tombol -->
    <div class="flex items-center gap-2 w-full sm:w-auto">
      <!-- Info Stok Aktual -->
      <div
        v-if="(activeTab === 'TRANSFER' || activeTab === 'ADJUSTMENT') && selectedProduct"
        class="h-[42px] flex flex-col justify-center items-center px-3 bg-secondary/20 border border-secondary/20 shadow-sm rounded-lg min-w-[70px] shrink-0"
      >
        <span class="text-[10px] text-text/70 uppercase font-bold leading-none mb-1">{{ t('wms.product_search.stock') }}</span>
        <span
          class="font-bold text-sm leading-none"
          :class="{
            'text-accent': selectedProduct.current_stock < 0,
            'text-text': selectedProduct.current_stock >= 0
          }"
        >
          {{ selectedProduct.current_stock }}
        </span>
      </div>

      <!-- Input Jumlah -->
      <div class="w-1/3 sm:w-24 relative shrink-0">
        <input
          v-model.number="quantityToAdd"
          type="number"
          :placeholder="activeTab === 'ADJUSTMENT' ? '-5 / 5' : 'Qty'"
          class="w-full h-[42px] px-3 bg-background border border-secondary/30 rounded-lg text-sm text-text focus:outline-none focus:border-primary transition-all shadow-sm font-medium"
          :disabled="disabled || !selectedProduct"
          @keyup.enter="onAddClick"
        />
      </div>

      <!-- Tombol Tambah -->
      <button
        @click="onAddClick"
        class="flex-1 sm:flex-none h-[42px] px-4 bg-primary text-secondary rounded-lg font-bold shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 transition-all hover:bg-primary/90 active:scale-[0.98]"
        :disabled="disabled || !selectedProduct"
      >
        <font-awesome-icon icon="fa-solid fa-plus" />
        <span>{{ t('common.btn.add') }}</span>
      </button>
    </div>
  </div>

  <Teleport to="body">
    <BaseModal :show="isCameraModalOpen" :title="t('wms.product_search.camera_scanner_title')" @close="isCameraModalOpen = false">
      <div class="flex flex-col items-center justify-center min-h-[300px]">
        <BaseQrScanner
          v-if="isCameraModalOpen"
          :paused="isScannerPaused"
          :interval="400"
          @detect="handleCameraDetect"
        />

        <div v-if="isSearchingCamera" class="mt-4 text-primary font-bold animate-pulse">{{ t('wms.product_search.checking_sku') }}</div>
        <div v-else class="mt-4 text-sm text-text/60 text-center">
          {{ t('wms.product_search.camera_instructions') }}
        </div>
      </div>
    </BaseModal>
  </Teleport>
</template>

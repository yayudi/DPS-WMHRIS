<script setup>
import { ref, computed } from 'vue'
import { useToast } from '@/composables/useToast'
import axios from '@/core/infrastructure/http.client'
import BaseModal from '@/components/ui/BaseModal.vue'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import debounce from 'lodash/debounce'
import { formatCurrency } from '@/utils/formatters'
import { useMobile } from '@/composables/useMobile'

const { isMobile } = useMobile()

defineProps({
  show: Boolean
})

const emit = defineEmits(['close'])

const { toast } = useToast()

// STATE
const items = ref([]) // { product, quantity, price, weight }
const searchQuery = ref('')
const searchResults = ref([])
const isSearching = ref(false)
const showSearchResults = ref(false)

// OPTIONS
const includePpn = ref(false)
const weightUnit = ref('gr') // gr, kg, ton
const PPN_RATE = 0.11

const WEIGHT_UNITS = [
  { value: 'gr', label: 'Gram (gr)', divisor: 1 },
  { value: 'kg', label: 'Kilogram (kg)', divisor: 1000 },
  { value: 'ton', label: 'Ton', divisor: 1000000 }
]

const discountOptions = [
  { value: 'percent', label: '%' },
  { value: 'nominal', label: 'Rp' }
]

// COMPUTED
const totalWeightRaw = computed(() => {
  return items.value.reduce((sum, item) => sum + item.weight * item.quantity, 0)
})

const totalWeightDisplay = computed(() => {
  const unit = WEIGHT_UNITS.find(u => u.value === weightUnit.value)
  return totalWeightRaw.value / unit.divisor
})

const totalCbmRaw = computed(() => {
  return items.value.reduce((sum, item) => sum + item.total_cbm * item.quantity, 0)
})

const calculateSubtotal = item => {
  const base = item.price * item.quantity
  let discountAmount = 0

  if (item.discount.type === 'percent') {
    discountAmount = base * (item.discount.value / 100)
  } else {
    discountAmount = item.discount.value
  }

  return Math.max(0, base - discountAmount)
}

const totalPrice = computed(() => {
  const baseTotal = items.value.reduce((sum, item) => sum + calculateSubtotal(item), 0)
  return includePpn.value ? baseTotal * (1 + PPN_RATE) : baseTotal
})

// METHODS
const handleSearch = debounce(async () => {
  if (!searchQuery.value || searchQuery.value.length < 2) {
    searchResults.value = []
    return
  }

  isSearching.value = true
  try {
    const response = await axios.get('/products/search', {
      params: { q: searchQuery.value }
    })
    searchResults.value = response.data
    showSearchResults.value = true
  } catch (err) {
    console.error(err)
  } finally {
    isSearching.value = false
  }
}, 300)

const addItem = product => {
  const existing = items.value.find(i => i.product.id === product.id)
  if (existing) {
    existing.quantity++
  } else {
    items.value.push({
      product: product,
      quantity: 1,
      price: product.price || 0,
      weight: product.weight || 0,
      total_cbm: product.total_cbm || 0,
      discount: { type: 'percent', value: 0 }
    })
  }
  searchQuery.value = ''
  showSearchResults.value = false
  searchResults.value = []
  toast(`${product.name} ditambahkan ke simulasi`, 'success')
}

const removeItem = index => {
  items.value.splice(index, 1)
  toast('Item dihapus dari simulasi', 'info')
}

const resetSimulation = () => {
  items.value = []
  toast('Simulasi direset', 'info')
}

// formatCurrency removed (imported from utils)

const formatWeight = val => {
  const unit = WEIGHT_UNITS.find(u => u.value === weightUnit.value)
  return (val / unit.divisor).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

const formatCbm = val => {
  return val.toLocaleString('id-ID', { maximumFractionDigits: 4 })
}

const close = () => {
  emit('close')
  items.value = [] // Reset on close
  searchQuery.value = ''
}
</script>

<template>
  <BaseModal :show="show" title="Simulasi Penjualan" @close="close">
    <div class="p-6 space-y-6">
      <!-- Search Bar -->
      <div class="relative">
        <label class="block text-sm font-bold text-text mb-2">Cari Produk</label>
        <div class="relative">
          <input
            v-model="searchQuery"
            @input="handleSearch"
            type="text"
            placeholder="Ketik nama atau SKU"
            class="w-full pl-10 pr-4 py-3 bg-background border border-secondary/30 rounded-xl focus:ring-2 focus:ring-primary focus:border-primary transition-all"
          />
          <font-awesome-icon icon="fa-solid fa-search" class="absolute left-3 top-3.5 text-text/40" />
          <font-awesome-icon
            v-if="isSearching"
            icon="fa-solid fa-spinner"
            spin
            class="absolute right-3 top-3.5 text-primary"
          />
        </div>

        <!-- Search Results Dropdown -->
        <div
          v-if="showSearchResults && searchResults.length > 0"
          class="absolute z-50 mt-1 w-full bg-background border border-secondary/20 rounded-xl shadow-xl max-h-60 overflow-y-auto"
        >
          <div
            v-for="product in searchResults"
            :key="product.id"
            @click="addItem(product)"
            class="p-3 hover:bg-secondary/10 cursor-pointer border-b border-secondary/10 last:border-0 transition-colors"
          >
            <div class="flex justify-between items-center">
              <div>
                <div class="font-bold text-sm text-text">{{ product.name }}</div>
                <div class="text-xs text-text/60 font-mono">{{ product.sku }}</div>
              </div>
              <div class="text-right">
                <div class="font-bold text-primary text-sm">
                  {{ formatCurrency(product.price) }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Options Bar -->
      <div class="flex flex-wrap items-end gap-4 p-4 bg-secondary/5 rounded-xl border border-secondary/10">
        <!-- Weight Unit Selector -->
        <div class="flex-1 min-w-[200px]">
          <label class="block text-xs font-bold text-text/70 mb-1.5 uppercase tracking-wide">Satuan Berat</label>
          <BaseSelect
            v-model="weightUnit"
            :options="WEIGHT_UNITS"
            label="label"
            track-by="value"
            emit-value
            :searchable="false"
          />
        </div>

        <!-- PPN Toggle -->
        <div class="flex items-center">
          <label class="flex items-center gap-3 cursor-pointer group select-none">
            <div class="relative">
              <input type="checkbox" v-model="includePpn" class="peer sr-only" />
              <div
                class="w-11 h-6 bg-background ring-2 ring-primary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-background after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-primary after:border-primary after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-checked:border-primary peer-checked:after:bg-background"
              ></div>
            </div>
            <span class="text-sm font-bold text-text/80 group-hover:text-primary transition-colors">
              Hitung PPN (11%)
            </span>
          </label>
        </div>
      </div>

      <!-- Items Table -->
      <div v-if="items.length > 0" class="border border-secondary/20 rounded-xl overflow-hidden">
        <table class="w-full text-sm text-left" :class="isMobile ? 'block' : ''">
          <thead class="bg-secondary/5 text-text/70 uppercase text-xs font-bold" :class="isMobile ? 'hidden' : ''">
            <tr>
              <th class="px-2 py-3 text-left">Produk</th>
              <th class="px-1 py-3 text-center w-20">Qty</th>
              <th class="px-1 py-3 text-center w-40">Diskon</th>
              <th class="px-1 py-3 text-right w-28">Berat</th>
              <th class="px-1 py-3 text-right w-28">Volume</th>
              <th class="px-1 py-3 text-right w-32">Total</th>
              <th class="px-1 py-3 text-center w-10"></th>
            </tr>
          </thead>
          <tbody :class="isMobile ? 'block' : 'divide-y divide-secondary/10'">
            <tr
              v-for="(item, index) in items"
              :key="index"
              class="transition-colors"
              :class="
                isMobile
                  ? 'block mb-4 p-4 bg-background/50 rounded-xl border border-secondary/20 shadow-sm mx-2 mt-2 relative'
                  : 'hover:bg-secondary/5'
              "
            >
              <td :class="isMobile ? 'block pb-2 mb-2 border-b border-secondary/10' : 'px-2 py-3'">
                <div class="font-medium">{{ item.product.name }}</div>
                <div class="text-xs text-text/50">{{ item.product.sku }}</div>
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-1 py-3'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Qty</span>
                <input
                  v-model.number="item.quantity"
                  type="number"
                  min="1"
                  class="text-center bg-background border border-secondary/30 rounded px-1 py-1 focus:ring-primary focus:border-primary"
                  :class="isMobile ? 'w-20' : 'w-full'"
                />
              </td>
              <td
                :class="isMobile ? 'flex justify-between items-center py-2 border-b border-secondary/10' : 'px-1 py-3'"
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Diskon</span>
                <div class="flex items-center gap-1 justify-center">
                  <BaseSelect
                    v-model="item.discount.type"
                    :options="discountOptions"
                    label="label"
                    track-by="value"
                    emit-value
                    :searchable="false"
                    class="w-[60px] min-h-[30px] p-0 text-center flex items-center justify-center"
                  />
                  <input
                    v-model.number="item.discount.value"
                    type="number"
                    min="0"
                    class="text-right bg-background border border-secondary/30 rounded px-1 py-1 text-xs focus:ring-primary focus:border-primary"
                    :class="isMobile ? 'w-20' : 'w-full'"
                    placeholder="0"
                  />
                </div>
              </td>
              <td
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                    : 'px-1 py-3 text-right text-text/70'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Berat</span>
                <span>{{ formatWeight(item.weight * item.quantity) }} {{ weightUnit }}</span>
              </td>
              <td
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                    : 'px-1 py-3 text-right text-text/70'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Volume</span>
                <span>{{ formatCbm(item.total_cbm * item.quantity) }} CBM</span>
              </td>
              <td
                :class="
                  isMobile
                    ? 'flex justify-between items-center py-2 border-b border-secondary/10'
                    : 'px-1 py-3 text-right font-medium'
                "
              >
                <span v-if="isMobile" class="text-text/60 text-xs uppercase font-semibold">Total</span>
                <div v-if="item.discount.value > 0" class="flex flex-col items-end">
                  <span class="text-[10px] text-text/40 line-through decoration-danger">
                    {{ formatCurrency(item.price * item.quantity) }}
                  </span>
                  <span class="text-primary">{{ formatCurrency(calculateSubtotal(item)) }}</span>
                </div>
                <div v-else>
                  {{ formatCurrency(item.price * item.quantity) }}
                </div>
              </td>
              <td :class="isMobile ? 'absolute top-3 right-3' : 'px-1 py-3 text-center'">
                <button @click="removeItem(index)" class="text-danger hover:text-danger-dark transition-colors">
                  <font-awesome-icon icon="fa-solid fa-times" />
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot class="bg-secondary/10 font-bold border-t border-secondary/20">
            <tr>
              <td colspan="3" class="px-4 py-3 text-right text-text/70">Total:</td>
              <td class="px-4 py-3 text-right text-primary flex flex-col gap-1 items-end whitespace-nowrap">
                <span
                  >{{ totalWeightDisplay.toLocaleString('id-ID', { maximumFractionDigits: 2 }) }} {{ weightUnit }}</span
                >
              </td>
              <td class="px-4 py-3 text-right text-primary whitespace-nowrap">{{ formatCbm(totalCbmRaw) }} CBM</td>
              <td class="px-4 py-3 text-right text-primary text-lg">
                <div class="flex flex-col items-end leading-tight">
                  <span>{{ formatCurrency(totalPrice) }}</span>
                  <span v-if="includePpn" class="text-[10px] text-text/50 font-normal italic">
                    (Termasuk PPN 11%)
                  </span>
                </div>
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div v-else class="text-center py-8 text-text/40 border-2 border-dashed border-secondary/20 rounded-xl">
        <font-awesome-icon icon="fa-solid fa-calculator" class="text-4xl mb-2" />
        <p>Belum ada item dalam simulasi.</p>
      </div>
    </div>
    <template #footer>
      <button
        type="button"
        @click="close"
        class="px-5 py-2.5 bg-secondary hover:bg-secondary/80 text-text rounded-xl font-bold transition-all"
      >
        Tutup
      </button>
      <button
        v-if="items.length > 0"
        type="button"
        @click="resetSimulation"
        class="px-5 py-2.5 bg-danger/10 hover:bg-danger/20 text-danger rounded-xl font-bold transition-all ml-auto"
      >
        <font-awesome-icon icon="fa-solid fa-trash" class="mr-2" />
        Reset
      </button>
    </template>
  </BaseModal>
</template>

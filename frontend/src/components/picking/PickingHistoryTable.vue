<!-- frontend\src\components\picking\PickingHistoryTable.vue -->
<script setup>
import { computed } from 'vue'
import { formatDate } from '@/api/helpers/time.js'

const props = defineProps({
  historyItems: {
    type: Array,
    required: true,
    default: () => [],
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['refresh', 'view-details', 'void-item', 'cancel-item', 'resume-item'])

const isEmpty = computed(() => !props.isLoading && props.historyItems.length === 0)

// Helper untuk status warna
function getStatusClass(status) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-100 text-green-700 border-green-200'
    case 'CANCEL':
    case 'CANCELLED':
      return 'bg-red-100 text-red-700 border-red-200'
    case 'PENDING':
    case 'PENDING_VALIDATION':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'SHIPPED':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200'
  }
}

// [FIX] Helper untuk mendapatkan Invoice ID yang valid (Support Raw & Grouped Data)
function getInvoiceId(item) {
  // Prioritas 1: Data mentah dari backend (pl.original_invoice_id)
  // Prioritas 2: Data hasil grouping (item.invoice)
  // Fallback: Tanda tanya
  return item.original_invoice_id || item.invoice || '(Tanpa ID)'
}

// Actions
function viewDetails(item) {
  if (!['PENDING', 'PENDING_VALIDATION'].includes(item.status)) {
    emit('view-details', item)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div
      class="flex justify-between items-center bg-white p-4 rounded-xl border border-secondary/20 shadow-sm"
    >
      <h3 class="font-bold text-text flex items-center gap-2">
        <font-awesome-icon icon="fa-solid fa-clock-rotate-left" class="text-primary/70" />
        Riwayat Proses
      </h3>
      <button
        @click="$emit('refresh')"
        :disabled="isLoading"
        class="text-sm font-bold text-primary hover:bg-primary/10 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
      >
        <font-awesome-icon icon="fa-solid fa-rotate" :class="{ 'animate-spin': isLoading }" />
        Refresh Data
      </button>
    </div>

    <div v-if="isLoading && historyItems.length === 0" class="py-20 text-center opacity-60">
      <font-awesome-icon
        icon="fa-solid fa-circle-notch"
        class="text-4xl animate-spin text-primary mb-3"
      />
      <p class="text-sm">Memuat data...</p>
    </div>

    <div
      v-else-if="isEmpty"
      class="py-20 text-center border-2 border-dashed border-secondary/20 rounded-xl bg-secondary/5"
    >
      <p class="text-text/40 italic">Belum ada data riwayat.</p>
    </div>

    <div v-else class="bg-white border border-secondary/20 rounded-xl shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead
            class="bg-secondary/5 text-text/60 border-b border-secondary/10 uppercase text-xs tracking-wider font-bold"
          >
            <tr>
              <th class="p-4 w-40">Tanggal</th>
              <th class="p-4">Invoice / File</th>
              <th class="p-4 w-32">Sumber</th>
              <th class="p-4 w-32 text-center">Status</th>
              <th class="p-4 w-40 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/10">
            <tr
              v-for="item in historyItems"
              :key="item.id"
              class="hover:bg-primary/5 transition-colors group"
              :class="{
                'cursor-pointer': !['PENDING', 'PENDING_VALIDATION'].includes(item.status),
              }"
              @click="viewDetails(item)"
            >
              <td class="p-4 whitespace-nowrap text-text/70">
                <div class="font-mono text-xs">
                  {{ formatDate(item.created_at || item.order_date, true, true) }}
                </div>
              </td>

              <td class="p-4">
                <div class="flex flex-col">
                  <span
                    class="font-bold text-text group-hover:text-primary transition-colors text-base"
                  >
                    {{ getInvoiceId(item) }}
                  </span>

                  <span class="text-xs text-text/50 flex items-center gap-1 mt-0.5">
                    <font-awesome-icon icon="fa-solid fa-user" class="text-[10px]" />
                    {{ item.customer_name || 'Customer tidak diketahui' }}
                  </span>
                </div>
              </td>

              <td class="p-4">
                <span
                  class="px-2 py-1 rounded text-xs font-bold border"
                  :class="{
                    'bg-green-50 text-green-700 border-green-200': item.source === 'Tokopedia',
                    'bg-orange-50 text-orange-700 border-orange-200': item.source === 'Shopee',
                    'bg-blue-50 text-blue-700 border-blue-200': item.source === 'Offline',
                  }"
                >
                  {{ item.source }}
                </span>
              </td>

              <td class="p-4 text-center">
                <span
                  class="px-2.5 py-1 rounded-full text-[10px] font-black border uppercase tracking-wide"
                  :class="getStatusClass(item.status)"
                >
                  {{ item.status }}
                </span>
              </td>

              <td class="p-4 text-center" @click.stop>
                <div class="flex items-center justify-center gap-2">
                  <button
                    v-if="item.status === 'COMPLETED'"
                    @click="$emit('void-item', item.id)"
                    class="h-8 w-8 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all"
                    title="Batalkan & Kembalikan Stok"
                  >
                    <font-awesome-icon icon="fa-solid fa-rotate-left" />
                  </button>

                  <template v-if="['PENDING', 'PENDING_VALIDATION'].includes(item.status)">
                    <button
                      @click="$emit('resume-item', item)"
                      class="h-8 w-8 rounded-lg flex items-center justify-center text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-200 transition-all"
                      title="Lanjutkan Validasi"
                    >
                      <font-awesome-icon icon="fa-solid fa-play" />
                    </button>
                    <button
                      @click="$emit('cancel-item', item.id)"
                      class="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      title="Hapus"
                    >
                      <font-awesome-icon icon="fa-solid fa-xmark" />
                    </button>
                  </template>

                  <button
                    v-if="!['PENDING', 'PENDING_VALIDATION'].includes(item.status)"
                    @click="viewDetails(item)"
                    class="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary hover:bg-primary/5 transition-all"
                    title="Lihat Detail Barang"
                  >
                    <font-awesome-icon icon="fa-solid fa-eye" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Efek hover baris tabel */
tbody > tr:hover {
  background-color: rgba(var(--color-primary), 0.05);
}
</style>

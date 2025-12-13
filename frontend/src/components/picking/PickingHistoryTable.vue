<!-- frontend\src\components\picking\PickingHistoryTable.vue -->
<script setup>
import { computed, ref } from 'vue'
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

const emit = defineEmits(['refresh', 'view-details'])
const expandedRows = ref(new Set()) // Untuk melacak row mana yang dibuka history-nya

const isEmpty = computed(() => !props.isLoading && props.historyItems.length === 0)

// Helper untuk status warna
function getStatusClass(status) {
  switch (status) {
    case 'COMPLETED':
    case 'VALIDATED': // Hijau untuk yang selesai
      return 'bg-success/10 text-success border-success/20'

    case 'CANCEL':
    case 'OBSOLETE': // Merah untuk batal/usang
      return 'bg-danger/10 text-danger border-danger/20'

    case 'PENDING':
      return 'bg-warning/10 text-warning border-warning/20'

    case 'SHIPPED':
      return 'bg-primary/10 text-primary border-primary/20'

    default:
      return 'bg-secondary/10 text-text/60 border-secondary/20'
  }
}

// Helper untuk Label Status yang ramah user
function getStatusLabel(status) {
  const map = {
    VALIDATED: 'Selesai',
    COMPLETED: 'Selesai',
    CANCEL: 'Batal',
    OBSOLETE: 'Usang',
    PENDING: 'Pending',
  }
  return map[status] || status
}

// Helper untuk mendapatkan Invoice ID yang valid
function getInvoiceId(item) {
  return item.original_invoice_id || item.invoice || '(Tanpa ID)'
}

// Toggle Expand Row
function toggleExpand(itemId) {
  if (expandedRows.value.has(itemId)) {
    expandedRows.value.delete(itemId)
  } else {
    expandedRows.value.add(itemId)
  }
}

// Action View Detail
function viewDetails(item) {
  if (!['PENDING', 'PENDING VALIDATION'].includes(item.status)) {
    emit('view-details', item)
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Toolbar -->
    <div
      class="flex justify-between items-center bg-background p-4 rounded-xl border border-secondary/30 shadow-sm"
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

    <!-- Loading State -->
    <div
      v-if="isLoading && historyItems.length === 0"
      class="py-20 text-center opacity-60 text-text"
    >
      <font-awesome-icon
        icon="fa-solid fa-circle-notch"
        class="text-4xl animate-spin text-primary mb-3"
      />
      <p class="text-sm">Memuat data...</p>
    </div>

    <!-- Empty State -->
    <div
      v-else-if="isEmpty"
      class="py-20 text-center border-2 border-dashed border-secondary/30 rounded-xl bg-secondary/5"
    >
      <p class="text-text/40 italic">Belum ada data riwayat.</p>
    </div>

    <!-- Table Content -->
    <div
      v-else
      class="bg-background border border-secondary/20 rounded-xl shadow-sm overflow-hidden"
    >
      <div class="overflow-x-auto">
        <table class="w-full text-sm text-left">
          <thead
            class="bg-secondary/20 text-text/60 border-b border-secondary/20 uppercase text-xs tracking-wider font-bold"
          >
            <tr>
              <th class="p-4 w-40">Tanggal</th>
              <th class="p-4">Invoice / File</th>
              <th class="p-4 w-32">Sumber</th>
              <th class="p-4 w-32 text-center">Status</th>
              <th class="p-4 w-40 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-secondary/10 text-text">
            <template v-for="item in historyItems" :key="item.id">
              <!-- Main Row -->
              <tr
                class="transition-colors group border-b border-secondary/10 hover:bg-primary/5 cursor-pointer"
                @click="viewDetails(item)"
              >
                <!-- TANGGAL -->
                <td class="p-4 whitespace-nowrap text-text/70">
                  <div class="flex flex-col">
                    <span class="font-mono text-xs font-bold">
                      {{ formatDate(item.created_at, false, false) }}
                    </span>
                    <span class="text-[10px] text-text/40 mt-0.5">
                      <font-awesome-icon icon="fa-solid fa-clock" class="mr-1" />
                      {{
                        new Date(item.created_at).toLocaleTimeString('id-ID', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      }}
                    </span>
                  </div>
                </td>

                <!-- INVOICE & EXPAND BUTTON -->
                <td class="p-4">
                  <div class="flex flex-col">
                    <div class="flex items-center gap-2">
                      <span
                        class="font-bold transition-colors text-base text-text group-hover:text-primary"
                      >
                        {{ getInvoiceId(item) }}
                      </span>

                      <!-- Tombol Expand jika ada revisi -->
                      <button
                        v-if="item.historyLogs && item.historyLogs.length > 0"
                        @click.stop="toggleExpand(item.id)"
                        class="text-[10px] bg-secondary/20 hover:bg-secondary/40 px-2 py-0.5 rounded-full text-text/60 font-bold flex items-center gap-1 transition-colors border border-transparent hover:border-secondary/30"
                      >
                        <font-awesome-icon
                          :icon="
                            expandedRows.has(item.id)
                              ? 'fa-solid fa-chevron-up'
                              : 'fa-solid fa-chevron-down'
                          "
                        />
                        {{ item.historyLogs.length }} Revisi
                      </button>
                    </div>
                    <span class="text-xs text-text/50 flex items-center gap-1 mt-0.5">
                      <font-awesome-icon icon="fa-solid fa-user" class="text-[10px]" />
                      {{ item.customer_name || 'Customer tidak diketahui' }}
                    </span>
                  </div>
                </td>

                <!-- SUMBER -->
                <td class="p-4">
                  <span class="font-bold text-xs">{{ item.source }}</span>
                </td>

                <!-- STATUS -->
                <td class="p-4 text-center">
                  <span
                    class="px-2 py-1 rounded text-xs font-bold border inline-block"
                    :class="getStatusClass(item.status)"
                  >
                    {{ getStatusLabel(item.status) }}
                  </span>
                </td>

                <!-- AKSI -->
                <td class="p-4 text-center">
                  <button class="text-xs text-primary font-bold hover:underline">Detail</button>
                </td>
              </tr>

              <!-- Expanded History Row (Child) -->
              <tr v-if="expandedRows.has(item.id)" class="bg-secondary/5 shadow-inner">
                <td colspan="5" class="p-0">
                  <div class="p-4 pl-12">
                    <!-- Container Grup Revisi -->
                    <div
                      class="bg-background border border-secondary/20 rounded-lg overflow-hidden shadow-sm max-w-2xl"
                    >
                      <!-- Header Grup -->
                      <div
                        class="bg-secondary/10 px-3 py-2 border-b border-secondary/10 flex items-center gap-2"
                      >
                        <font-awesome-icon
                          icon="fa-solid fa-history"
                          class="text-text/40 text-xs"
                        />
                        <span class="text-[11px] font-bold text-text/60 uppercase tracking-wider"
                          >Arsip Revisi Sebelumnya</span
                        >
                      </div>

                      <!-- List Item Revisi -->
                      <div class="divide-y divide-secondary/10">
                        <div
                          v-for="log in item.historyLogs"
                          :key="log.id"
                          class="flex items-center justify-between p-3 hover:bg-secondary/5 transition-colors group/log"
                        >
                          <div class="flex items-center gap-3">
                            <span
                              class="font-mono text-[10px] bg-secondary/10 px-1.5 py-0.5 rounded text-text/60 group-hover/log:bg-secondary/20 transition-colors"
                            >
                              #{{ log.id }}
                            </span>
                            <div class="flex flex-col">
                              <span
                                class="text-xs font-bold text-text/70 line-through decoration-danger/30"
                              >
                                {{ log.invoice || log.original_invoice_id }}
                              </span>
                              <span class="text-[10px] text-text/40">
                                Revisi pada:
                                {{ formatDate(log.updated_at || log.created_at, true, true) }}
                              </span>
                            </div>
                          </div>

                          <div class="flex items-center gap-3">
                            <span
                              class="text-[10px] bg-danger/10 text-danger border border-danger/20 px-2 py-0.5 rounded-full font-bold"
                            >
                              OBSOLETE
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Hover effect hanya untuk baris utama, bukan baris child (expanded) */
tbody > tr:not(.bg-secondary\/5):hover {
  background-color: rgba(var(--color-primary), 0.05);
}
</style>

<script setup>
import { swalConfirm } from '@/composables/useSweetAlert'
import { ref, onMounted, computed } from 'vue'
import { useToast } from '@/composables/useToast'
import { stockRequestApi } from '@/modules/wms/infrastructure/stockRequest.api'
import StockRequestModal from '@/modules/wms/presentation/components/StockRequestModal.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { usePagination } from '@/composables/usePagination'
import { useFirebaseSync } from '@/composables/useFirebaseSync'

const authStore = useAuthStore()
const currentUser = computed(() => authStore.user)

const { toast } = useToast()

const requests = ref([])
const isLoading = ref(false)
const isModalOpen = ref(false)
const currentFilter = ref('ALL')
const selectedIds = ref([])
const totalRequests = ref(0)
const {
  currentPage,
  currentLimit,
  meta: paginationState,
  changePage: handlePageChange,
  changePageSize: handleLimitChange
} = usePagination({
  totalItems: totalRequests,
  initialLimit: 15,
  storageKey: 'stockRequestsLimit',
  onPageChange: () => loadRequests()
})

async function loadRequests(silent = false) {
  if (!silent) isLoading.value = true
  try {
    const params = {
      page: currentPage.value,
      limit: currentLimit.value
    }
    if (currentFilter.value !== 'ALL') {
      params.status = currentFilter.value
    }
    const res = await stockRequestApi.fetchStockRequests(params)
    requests.value = res.data || []
    if (res.pagination) {
      totalRequests.value = res.pagination.total
    }
  } catch (error) {
    console.error(error)
    if (!silent) toast(error.message || 'Gagal memuat permintaan stok', 'error')
  } finally {
    if (!silent) isLoading.value = false
    selectedIds.value = [] // Reset selection on reload
  }
}

// Firebase Real-time Event Listener for Stock Requests
onMounted(() => loadRequests())
useFirebaseSync('STOCK_REQUESTS', 'REFRESH_REQUESTS', () => loadRequests(true))

const filteredRequests = computed(() => requests.value)

async function handleApprove(id) {
  if (!(await swalConfirm('Apakah Anda yakin menyetujui permintaan ini?'))) return
  try {
    await stockRequestApi.approveStockRequest(id)
    toast('Permintaan disetujui', 'success')
    loadRequests()
  } catch (e) {
    console.error(e) // Auto-added to prevent unused var
  }
}

async function handleReject(id) {
  if (!(await swalConfirm('Apakah Anda yakin menolak permintaan ini?'))) return
  try {
    await stockRequestApi.rejectStockRequest(id)
    toast('Permintaan ditolak', 'success')
    loadRequests()
  } catch (e) {
    console.error(e) // Auto-added to prevent unused var
  }
}

async function handleDispatch(id) {
  if (!(await swalConfirm('Apakah Anda yakin barang sudah siap dan akan dikirim sekarang?'))) return
  try {
    await stockRequestApi.dispatchStockRequest(id)
    toast('Barang berhasil dikirim', 'success')
    loadRequests()
  } catch (e) {
    console.error(e)
  }
}

async function handleComplete(id, items, req) {
  if (
    !(await swalConfirm(
      req && req.type === 'STOCK_OPNAME'
        ? 'Konfirmasi kuantitas fisik dan simpan perubahan stok opname?'
        : 'Tandai telah diterima? Pastikan barang fisik sudah sesuai.'
    ))
  )
    return
  try {
    const safeItems = Array.isArray(items) ? items : []
    const receivedItems = safeItems.map(item => ({
      productId: item.product_id,
      receivedQuantity: item.input_received !== undefined ? Number(item.input_received) : item.quantity
    }))

    await stockRequestApi.completeStockRequest(id, receivedItems)
    toast('Barang diterima dan stok ditransfer', 'success')
    loadRequests()
  } catch (e) {
    console.error(e) // Auto-added to prevent unused var
  }
}

// Bulk Actions
const isAllSelected = computed({
  get() {
    const selectable = filteredRequests.value.filter(
      req => req.status === 'PENDING' && req.requester_id !== currentUser.value?.id
    )
    return selectable.length > 0 && selectedIds.value.length === selectable.length
  },
  set(val) {
    if (val) {
      const selectable = filteredRequests.value.filter(
        req => req.status === 'PENDING' && req.requester_id !== currentUser.value?.id
      )
      selectedIds.value = selectable.map(req => req.id)
    } else {
      selectedIds.value = []
    }
  }
})

function canSelectRequest(req) {
  return req.status === 'PENDING' && req.requester_id !== currentUser.value?.id
}

// handlePageChange and handleLimitChange are provided by usePagination

async function handleBulkAction(action) {
  if (selectedIds.value.length === 0) return

  const actionText = action === 'APPROVE' ? 'menyetujui' : 'menolak'
  if (!(await swalConfirm(`Apakah Anda yakin ${actionText} ${selectedIds.value.length} permintaan sekaligus?`))) return

  try {
    const res = await stockRequestApi.bulkActionStockRequests(action, selectedIds.value)
    if (res.data?.failedCount > 0) {
      toast(`Berhasil: ${res.data.successCount}, Gagal: ${res.data.failedCount}`, 'warning')
    } else {
      toast(`Berhasil ${actionText} ${res.data.successCount} permintaan`, 'success')
    }
    loadRequests()
  } catch (e) {
    console.error(e)
    toast('Gagal memproses permintaan massal', 'error')
  }
}

function getStatusBadgeClass(status) {
  switch (status) {
    case 'PENDING':
      return 'bg-warning/20 text-warning border-warning/30'
    case 'APPROVED':
      return 'bg-primary/20 text-primary border-primary/30'
    case 'SHIPPED':
      return 'bg-accent/20 text-accent border-accent/30'
    case 'REJECTED':
      return 'bg-danger/20 text-danger border-danger/30'
    case 'COMPLETED':
      return 'bg-success/20 text-success border-success/30'
    default:
      return 'bg-secondary/20 text-text border-secondary/30'
  }
}

// Fitur Expand Row
const expandedRows = ref([])
function toggleRow(id, forceOpen = false) {
  if (forceOpen) {
    if (!expandedRows.value.includes(id)) expandedRows.value.push(id)
    return
  }
  if (expandedRows.value.includes(id)) {
    expandedRows.value = expandedRows.value.filter(r => r !== id)
  } else {
    expandedRows.value.push(id)
  }
}

function openReceiveForm(req) {
  req.items.forEach(item => {
    if (item.input_received === undefined) {
      item.input_received = item.quantity
    }
  })
  toggleRow(req.id, true)
}

function printRequest(req) {
  const printWindow = window.open('', '_blank')

  const dateStr = new Date(req.created_at).toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const itemsHtml = req.items
    .map(
      (item, index) => `
    <tr>
      <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${index + 1}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">${item.sku}</td>
      <td style="border: 1px solid #ccc; padding: 8px;">${item.product_name}</td>
      <td style="border: 1px solid #ccc; padding: 8px; text-align: right;">${item.quantity}</td>
    </tr>
  `
    )
    .join('')

  const docTitle =
    req.status === 'SHIPPED' || req.status === 'COMPLETED' ? 'SURAT JALAN / DELIVERY ORDER' : 'DOKUMEN PERMINTAAN STOK'

  const html = `
    <html>
      <head>
        <title>${docTitle} - ${req.request_number}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; margin: 0; }
          .subtitle { font-size: 14px; color: #666; margin: 2px 0; }
          .info-table { width: 100%; margin-bottom: 20px; }
          .info-table td { padding: 4px; vertical-align: top; }
          .info-table .label { font-weight: bold; width: 150px; }
          .item-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .item-table th { border: 1px solid #ccc; padding: 10px; background-color: #f5f5f5; text-align: left; }
          .signature-section { display: flex; justify-content: space-between; margin-top: 50px; }
          .signature-box { text-align: center; width: 200px; }
          .signature-line { border-bottom: 1px solid #333; margin-top: 120px; margin-bottom: 5px; }
          @media print {
            body { padding: 0; }
            @page { margin: 1cm; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1 class="title">${docTitle}</h1>
          <p class="subtitle">Nomor Dokumen: ${req.request_number}</p>
          <p class="subtitle">${dateStr}</p>
        </div>

        <table class="info-table">
          <tr>
            <td class="label">Status</td>
            <td>: <strong>${req.status}</strong></td>
            <td class="label">Peminta</td>
            <td>: ${req.requester_name}</td>
          </tr>
          <tr>
            <td class="label">Dari Lokasi (Asal)</td>
            <td>: ${req.from_location_code}</td>
            <td class="label">Ke Lokasi (Tujuan)</td>
            <td>: ${req.to_location_code}</td>
          </tr>
        </table>

        <table class="item-table">
          <thead>
            <tr>
              <th style="width: 50px; text-align: center;">No</th>
              <th style="width: 150px;">SKU</th>
              <th>Nama Barang</th>
              <th style="width: 100px; text-align: right;">Kuantitas</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div v-if="req.notes" class="notes" style="margin: 30px 0;">
          <p><strong>Catatan:</strong> ${req.notes}</p>
        </div>

        <div class="signature-section">
          <div class="signature-box">
            <p>Dibuat Oleh</p>
            <div class="signature-line"></div>
            <p>(${req.requester_name})</p>
          </div>
          <div class="signature-box">
            <p>Disetujui Oleh</p>
            <div class="signature-line"></div>
            <p>(...................................)</p>
          </div>
          <div class="signature-box">
            <p>Penerima Barang</p>
            <div class="signature-line"></div>
            <p>(...................................)</p>
          </div>
        </div>
      </body>
    </html>
  `
  printWindow.document.write(html)
  printWindow.document.close()

  setTimeout(() => {
    printWindow.focus()
    printWindow.print()
  }, 250)
}
</script>

<template>
  <div class="animate-fade-in text-text">
    <!-- Filters -->
    <div class="bg-secondary/75 rounded-xl border border-secondary p-4 shadow-sm flex gap-2 overflow-x-auto">
      <button
        v-for="filter in ['ALL', 'PENDING', 'APPROVED', 'SHIPPED', 'COMPLETED', 'REJECTED']"
        :key="filter"
        @click="((currentFilter = filter), loadRequests())"
        class="px-4 py-1.5 rounded-full text-xs font-bold transition-all border border-secondary shadow-sm whitespace-nowrap"
        :class="
          currentFilter === filter
            ? 'bg-primary text-secondary border-primary shadow-sm'
            : 'bg-background text-text/60 hover:bg-primary/10 shadow-sm'
        "
      >
        {{ filter }}
      </button>

      <div class="flex-1 min-w-[1rem]"></div>

      <button
        @click="loadRequests()"
        :class="isLoading ? 'animate-spin' : ''"
        class="px-3 py-2 bg-background text-text/60 border border-secondary hover:bg-secondary/20 rounded-lg font-semibold text-sm flex items-center gap-2 transition-all shadow-sm"
        title="Muat Ulang Data"
      >
        <font-awesome-icon :icon="isLoading ? 'fa-solid fa-spinner' : 'fa-solid fa-refresh'" />
      </button>

      <button
        @click="isModalOpen = true"
        class="bg-primary/20 text-primary border border-primary/30 px-4 py-2 rounded-lg font-semibold text-sm hover:bg-primary hover:text-background flex items-center gap-2 transition-all shadow-sm"
      >
        <font-awesome-icon icon="fa-solid fa-plus" />
        <span class="hidden sm:inline">Buat Permintaan</span>
      </button>
    </div>

    <!-- FLOATING ACTION BAR -->
    <Teleport to="body">
      <transition name="slide-up">
        <div
          v-if="selectedIds.length > 0"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[98%] md:w-[85%] max-w-5xl bg-secondary/95 border border-secondary/20 backdrop-blur-xl p-3 rounded-2xl shadow-2xl z-[200] flex flex-col gap-3 ring-1 ring-black/5"
        >
          <!-- ROW: ACTIONS -->
          <div class="flex flex-col md:flex-row items-center justify-between gap-3 w-full">
            <!-- Kontrol Seleksi -->
            <div class="flex items-center justify-between md:justify-start w-full md:w-auto gap-2 shrink-0">
              <button
                @click="isAllSelected = true"
                class="px-3 py-2 bg-secondary/50 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-colors border border-primary/20 hover:border-primary/50 flex items-center gap-1.5 active:scale-95 flex-1 justify-center md:flex-none"
                title="Pilih Semua yang Tersedia"
              >
                <font-awesome-icon icon="fa-solid fa-check-double" />
                <span class="hidden sm:inline">Pilih Semua</span>
              </button>

              <button
                @click="isAllSelected = false"
                class="px-3 py-2 bg-secondary/50 hover:bg-danger/20 text-text/60 hover:text-danger rounded-lg text-xs font-bold transition-colors border border-secondary/30 hover:border-danger/50 flex items-center gap-1.5 active:scale-95 flex-1 justify-center md:flex-none"
                title="Reset Pilihan"
              >
                <font-awesome-icon icon="fa-solid fa-xmark" />
                <span class="hidden sm:inline">Reset</span>
              </button>
            </div>

            <!--Info (Jika ada yang dipilih) -->
            <div class="flex items-center justify-center gap-3 px-2 w-full md:w-auto">
              <div class="flex flex-col items-center leading-none min-w-[50px]">
                <span class="font-black text-lg text-text">{{ selectedIds.length }}</span>
                <span class="text-[9px] font-bold text-text/50 uppercase tracking-wider">Terpilih</span>
              </div>
            </div>

            <!-- Tombol Eksekusi -->
            <div class="flex items-center gap-2 w-full md:w-auto shrink-0 mt-2 md:mt-0">
              <button
                @click="handleBulkAction('REJECT')"
                class="flex-1 sm:flex-none flex items-center justify-center gap-2 text-danger/80 hover:bg-danger/10 hover:text-danger hover:border-danger/30 border border-danger/10 px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isLoading"
              >
                <font-awesome-icon icon="fa-solid fa-xmark" /> Tolak
              </button>
              <button
                @click="handleBulkAction('APPROVE')"
                class="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary text-secondary hover:bg-primary/90 px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isLoading"
              >
                <font-awesome-icon icon="fa-solid fa-check" /> Setujui
              </button>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- Table -->
    <div class="overflow-x-auto relative">
      <table class="w-full text-left border-collapse">
        <thead>
          <tr class="bg-secondary/10 border-b border-secondary/20">
            <th class="p-3 w-10 text-center">
              <input
                type="checkbox"
                v-model="isAllSelected"
                class="rounded border-secondary/30 text-primary focus:ring-primary cursor-pointer w-4 h-4"
              />
            </th>
            <th class="p-3 text-xs font-bold text-text/60 uppercase">No. Request</th>
            <th class="p-3 text-xs font-bold text-text/60 uppercase">Tanggal</th>
            <th class="p-3 text-xs font-bold text-text/60 uppercase">Lokasi</th>
            <th class="p-3 text-xs font-bold text-text/60 uppercase">Peminta</th>
            <th class="p-3 text-xs font-bold text-text/60 uppercase">Status</th>
            <th class="p-3 text-xs font-bold text-text/60 uppercase text-center">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/10">
          <tr v-if="isLoading">
            <td colspan="7" class="p-8 text-center text-text/50">
              <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-2xl mb-2" />
              <p>Memuat data...</p>
            </td>
          </tr>
          <tr v-else-if="filteredRequests.length === 0">
            <td colspan="7" class="p-8 text-center text-text/50 italic">Tidak ada permintaan stok.</td>
          </tr>
          <template v-for="req in filteredRequests" :key="req.id">
            <tr class="hover:bg-secondary/5 transition-colors group">
              <td class="p-3 text-center">
                <input
                  v-if="canSelectRequest(req)"
                  type="checkbox"
                  :value="req.id"
                  v-model="selectedIds"
                  class="rounded border-secondary/30 text-primary focus:ring-primary cursor-pointer w-4 h-4"
                />
                <span
                  v-else-if="req.status === 'PENDING'"
                  title="Anda tidak bisa memproses permintaan ini"
                  class="text-secondary/40"
                >
                  <font-awesome-icon icon="fa-solid fa-ban" class="text-[10px]" />
                </span>
              </td>
              <td class="p-3">
                <button
                  @click="toggleRow(req.id)"
                  class="text-primary font-bold hover:underline flex items-center gap-2"
                >
                  <font-awesome-icon
                    :icon="expandedRows.includes(req.id) ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'"
                    class="text-xs"
                  />
                  {{ req.request_number }}
                  <span
                    v-if="req.type"
                    class="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold border"
                    :class="
                      req.type === 'STOCK_OPNAME'
                        ? 'bg-primary/20 text-primary border-primary/30'
                        : 'bg-secondary/30 text-text/60 border-secondary/40'
                    "
                  >
                    {{ req.type === 'STOCK_OPNAME' ? 'OPNAME' : 'TRANSFER' }}
                  </span>
                </button>
              </td>
              <td class="p-3 text-sm">{{ new Date(req.created_at).toLocaleDateString('id-ID') }}</td>
              <td class="p-3 text-sm">
                <div class="font-bold">
                  <template v-if="req.type === 'STOCK_OPNAME'">
                    {{ req.to_location_code }}
                  </template>
                  <template v-else>
                    {{ req.from_location_code }}
                    <font-awesome-icon icon="fa-solid fa-arrow-right" class="text-text/40 text-xs mx-1" />
                    {{ req.to_location_code }}
                  </template>
                </div>
              </td>
              <td class="p-3 text-sm">{{ req.requester_name }}</td>
              <td class="p-3">
                <span
                  :class="['px-2.5 py-1 rounded-full text-[10px] font-bold border', getStatusBadgeClass(req.status)]"
                >
                  {{ req.status }}
                </span>
              </td>
              <td class="p-3 flex justify-center gap-2">
                <template v-if="req.status === 'PENDING'">
                  <button
                    @click="handleApprove(req.id)"
                    class="px-2 py-1 bg-primary text-secondary rounded text-xs font-bold hover:bg-primary/90"
                    title="Setujui"
                  >
                    <font-awesome-icon icon="fa-solid fa-check" />
                  </button>
                  <button
                    @click="handleReject(req.id)"
                    class="px-2 py-1 bg-danger text-secondary rounded text-xs font-bold hover:bg-danger/90"
                    title="Tolak"
                  >
                    <font-awesome-icon icon="fa-solid fa-xmark" />
                  </button>
                </template>
                <template v-if="req.status === 'APPROVED'">
                  <button
                    @click="handleDispatch(req.id)"
                    class="px-3 py-1 bg-accent text-secondary rounded text-xs font-bold hover:bg-accent/90"
                    title="Kirim Barang"
                  >
                    <font-awesome-icon icon="fa-solid fa-truck" class="mr-1" /> Kirim
                  </button>
                </template>
                <template v-if="req.status === 'SHIPPED'">
                  <button
                    @click="openReceiveForm(req)"
                    class="px-3 py-1 bg-success text-secondary rounded text-xs font-bold hover:bg-success/90"
                    title="Terima Barang"
                  >
                    <font-awesome-icon icon="fa-solid fa-box-open" class="mr-1" /> Terima
                  </button>
                </template>
              </td>
            </tr>
            <!-- Expanded Items Row -->
            <tr v-if="expandedRows.includes(req.id)" class="bg-secondary/5 border-t-0">
              <td colspan="7" class="p-4">
                <div class="bg-background rounded-lg border border-secondary/20 p-4">
                  <div class="flex justify-between items-center mb-2">
                    <p class="text-sm font-bold">
                      Daftar Barang <span class="text-text/60 font-normal">(Catatan: {{ req.notes || '-' }})</span>
                    </p>
                    <button
                      @click="printRequest(req)"
                      class="px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-background rounded-md text-xs font-bold flex items-center gap-2 transition-colors"
                      title="Cetak Dokumen"
                    >
                      <font-awesome-icon icon="fa-solid fa-print" /> Cetak Dokumen
                    </button>
                  </div>
                  <table class="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr class="border-b border-secondary/20 text-text/60">
                        <th class="py-1">SKU</th>
                        <th class="py-1">Nama Produk</th>
                        <th class="py-1 text-right">{{ req.type === 'STOCK_OPNAME' ? 'Tercatat' : 'Diminta' }}</th>
                        <th class="py-1 text-right">{{ req.type === 'STOCK_OPNAME' ? 'Fisik' : 'Diterima' }}</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-secondary/10">
                      <tr v-for="item in req.items" :key="item.id">
                        <td class="py-2 font-mono text-xs">{{ item.sku }}</td>
                        <td class="py-2">{{ item.product_name }}</td>
                        <td class="py-2 text-right font-bold">{{ item.quantity }}</td>
                        <td class="py-2 text-right">
                          <input
                            v-if="req.status === 'SHIPPED'"
                            type="number"
                            min="0"
                            :max="item.quantity"
                            v-model="item.input_received"
                            class="w-20 p-1 text-right bg-background border border-secondary/30 rounded focus:ring-1 focus:ring-primary outline-none"
                          />
                          <span v-else class="text-text/60">{{ item.received_quantity }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div v-if="req.status === 'SHIPPED'" class="mt-4 flex justify-end">
                    <button
                      @click="handleComplete(req.id, req.items, req)"
                      class="px-4 py-2 bg-success text-secondary rounded-lg text-sm font-bold hover:bg-success/90 flex items-center gap-2 transition-all shadow-sm"
                    >
                      <font-awesome-icon icon="fa-solid fa-check-double" />
                      Konfirmasi Terima Barang
                    </button>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="mt-4" v-if="paginationState.totalPages > 1 || requests.length > 15">
      <BasePagination
        :pagination="paginationState"
        :limit-options="[15, 30, 50, 100]"
        @changePage="handlePageChange"
        @update:limit="handleLimitChange"
      />
    </div>

    <!-- Modal Form -->
    <StockRequestModal :is-open="isModalOpen" @close="isModalOpen = false" @request-created="loadRequests" />
  </div>
</template>

<style scoped></style>

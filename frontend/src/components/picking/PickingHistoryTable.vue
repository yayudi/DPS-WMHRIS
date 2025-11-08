<script setup>
import { computed } from 'vue'

// Props: Menerima data riwayat dan status loading
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

// Emits: Memberi tahu parent tentang aksi user
const emit = defineEmits(['refresh', 'view-details', 'void-item', 'cancel-item', 'resume-item'])

// Computed property untuk menampilkan pesan saat tabel kosong
const isEmpty = computed(() => !props.isLoading && props.historyItems.length === 0)

// Methods untuk emit event (membungkus emit agar lebih jelas)
function refreshHistory() {
  emit('refresh')
}

function viewDetails(item) {
  // Hanya lihat detail jika BUKAN PENDING (karena PENDING belum punya item tervalidasi)
  if (item.status !== 'PENDING' && item.status !== 'PENDING_VALIDATION') {
    emit('view-details', item)
  }
}

function voidItem(itemId) {
  emit('void-item', itemId)
}

function cancelItem(itemId) {
  emit('cancel-item', itemId)
}

function resumeItem(item) {
  emit('resume-item', item)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-lg font-semibold text-text">Riwayat Proses Picking List</h3>
      <button
        @click="refreshHistory"
        :disabled="isLoading"
        class="text-primary text-sm hover:underline disabled:opacity-50 flex items-center gap-1"
      >
        <font-awesome-icon icon="fa-solid fa-sync" :class="{ 'animate-spin': isLoading }" />
        Refresh
      </button>
    </div>

    <!-- Tampilan Loading atau Kosong -->
    <div v-if="isLoading && historyItems.length === 0" class="text-center p-8 text-text/60">
      <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin mr-2" /> Memuat riwayat...
    </div>
    <div v-else-if="isEmpty" class="text-center p-8 text-text/60 italic">
      Belum ada riwayat proses.
    </div>

    <!-- Tabel Riwayat -->
    <div v-else class="max-h-[70vh] overflow-y-auto border border-secondary/20 rounded-lg">
      <table class="min-w-full text-sm">
        <thead class="bg-secondary/10 sticky top-0 z-10">
          <tr>
            <th class="p-2 text-left">Waktu Proses</th>
            <!-- ✅ UBAH: Header kolom diganti -->
            <th class="p-2 text-left">Tagihan / File</th>
            <th class="p-2 text-left">Sumber</th>
            <th class="p-2 text-center">Status</th>
            <th class="p-2 text-left">Oleh</th>
            <th class="p-2 text-center">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-secondary/20">
          <tr
            v-for="item in historyItems"
            :key="item.id"
            class="hover:bg-primary/5 transition-colors duration-150"
            :class="{
              'cursor-pointer': item.status !== 'PENDING' && item.status !== 'PENDING_VALIDATION',
              'cursor-default': item.status === 'PENDING' || item.status === 'PENDING_VALIDATION',
            }"
            @click="viewDetails(item)"
          >
            <td class="p-2 whitespace-nowrap">
              {{
                new Date(item.created_at).toLocaleString('id-ID', {
                  dateStyle: 'short',
                  timeStyle: 'medium',
                })
              }}
            </td>

            <!-- ✅ UBAH: Logika Tampilan Kolom Tagihan / File -->
            <td class="p-2 max-w-xs">
              <!-- Tampilan untuk Upload CSV (Hybrid) Baru -->
              <!-- <div v-if="item.original_invoice_id" class="flex flex-col">
                <span class="font-semibold truncate" :title="item.original_invoice_id">
                  {{ item.original_invoice_id }}
                </span>
                <span class="text-xs text-text/70 truncate" :title="item.customer_name">
                  {{ item.customer_name || 'N/A' }}
                </span>
              </div>
              <!-- Tampilan untuk Upload PDF (Legacy) Lama -->
              <!-- <span v-else class="truncate" :title="item.original_filename">
                {{ item.original_filename || '(Legacy PDF)' }}
              </span> -->
              <span class="truncate" :title="item.original_filename">
                {{ item.original_filename || '(Legacy PDF)' }}
              </span>
            </td>
            <!-- ✅ AKHIR UBAHAN -->

            <td class="p-2">{{ item.source }}</td>
            <td class="p-2 text-center">
              <span
                class="px-2.5 py-0.5 text-xs font-semibold rounded-full"
                :class="{
                  'bg-success/10 text-success': item.status === 'COMPLETED',
                  'bg-accent/10 text-accent': item.status === 'CANCELLED',

                  // ✅ UBAH: Tambahkan status 'PENDING' di sini
                  'bg-warning/10 text-warning':
                    item.status === 'PENDING_VALIDATION' || item.status === 'PENDING',

                  'bg-secondary/20 text-text/70': ![
                    'COMPLETED',
                    'CANCELLED',
                    'PENDING_VALIDATION',
                    'PENDING', // ✅ UBAH: Tambahkan juga di sini
                  ].includes(item.status),
                }"
                >{{ item.status }}</span
              >
            </td>
            <td class="p-2">{{ item.username }}</td>
            <td class="p-2 text-center space-x-3">
              <!-- Aksi untuk COMPLETED -->
              <button
                v-if="item.status === 'COMPLETED'"
                @click.stop="voidItem(item.id)"
                class="text-accent hover:text-accent/80 transition-colors"
                title="Batalkan & Kembalikan Stok"
              >
                <font-awesome-icon icon="fa-solid fa-undo" />
              </button>

              <!-- ✅ UBAH: Aksi untuk PENDING_VALIDATION atau PENDING -->
              <template v-if="item.status === 'PENDING_VALIDATION' || item.status === 'PENDING'">
                <button
                  @click.stop="resumeItem(item)"
                  class="text-primary hover:text-primary/80 transition-colors"
                  title="Lanjutkan Proses Validasi"
                >
                  <font-awesome-icon icon="fa-solid fa-play-circle" />
                </button>
                <button
                  @click.stop="cancelItem(item.id)"
                  class="text-secondary hover:text-secondary/80 transition-colors"
                  title="Batalkan Picking List"
                >
                  <font-awesome-icon icon="fa-solid fa-times-circle" />
                </button>
              </template>

              <!-- ✅ UBAH: Fallback jika tidak ada aksi -->
              <span
                v-else-if="
                  item.status !== 'COMPLETED' &&
                  item.status !== 'PENDING_VALIDATION' &&
                  item.status !== 'PENDING'
                "
                class="text-secondary/50"
                title="Aksi tidak tersedia"
              >
                -
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
<style scoped>
/* Targeting direct child rows for hover effect */
tbody > tr:hover {
  background-color: rgba(var(--color-primary), 0.05);
}
</style>

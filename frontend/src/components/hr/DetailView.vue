<!-- components\DetailView.vue -->
<script setup>
import { computed } from 'vue'
import { formatJamMenit } from '@/api/helpers/time.js'
import TableSkeleton from '@/components/ui/TableSkeleton.vue'

const props = defineProps({
  user: { type: Object, default: null }, // For single user mode { id, nama, logs[] }
  users: { type: Array, default: null }, // For multi-user mode, array of { id, nama, logs[] }
  year: { type: Number, required: true },
  month: { type: Number, required: true },
  loading: { type: Boolean, default: false },
})

const formattedRows = computed(() => {
  if (props.user) {
    // mode 1 user
    return (props.user.logs || []).map((log) => formatRow(log, props.user.nama))
  } else if (props.users) {
    // multi-user mode
    return props.users.flatMap((u) => (u.logs || []).map((log) => formatRow(log, u.nama)))
  }
  return []
})

function getStatusText(status) {
  switch (status) {
    case 1:
      return 'Tidak Hadir'
    case 2:
      return 'Libur'
    case 3:
      return 'Data Tidak Lengkap'
    default:
      return ''
  }
}

function formatRow(log, nama) {
  let ket = ''
  if (log.status === 1) ket = 'Tidak hadir'
  else if (log.status === 2) ket = 'Libur'

  return {
    nama,
    tanggal: log.tanggal,
    jamMasuk: formatJamMenit(log.jamMasuk),
    breakOut: log.breaks?.[0] ? formatJamMenit(log.breaks[0].start) : '-',
    breakIn: log.breaks?.[0] ? formatJamMenit(log.breaks.at(-1).end) : '-',
    jamKeluar: formatJamMenit(log.jamKeluar),
    ket,
  }
}
</script>
<template>
  <!-- Wrapper with themed border and background -->

  <div
    class="bg-background rounded-xl shadow-md border border-secondary/20 overflow-x-auto overflow-y-auto relative custom-scrollbar h-[calc(100vh-300px)] table-container">
    <table class="min-w-[800px] w-full bg-background text-sm text-text border-collapse">
      <!-- Themed table header -->
      <thead class="sticky top-0 z-30 bg-background/95 backdrop-blur-md shadow-sm ring-1 ring-secondary/5">
        <tr>
          <th
            class="px-6 py-3 border-b border-secondary/10 sticky left-0 z-30 bg-background/95 backdrop-blur-md shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)] w-[200px] text-left uppercase text-xs font-bold text-text/60">
            Nama</th>
          <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text/60">
            Tanggal</th>
          <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text/60">Jam
            Masuk</th>
          <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text/60">Mulai
            Istirahat</th>
          <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text/60">
            Selesai Istirahat</th>
          <th class="px-6 py-3 border-b border-secondary/10 text-center uppercase text-xs font-bold text-text/60">Jam
            Keluar</th>
          <th class="px-6 py-3 border-b border-secondary/10 text-left uppercase text-xs font-bold text-text/60">
            Keterangan</th>
        </tr>
      </thead>
      <TransitionGroup tag="tbody" name="list" class="divide-y divide-secondary/5 relative">
        <template v-if="loading">
          <TableSkeleton v-for="n in 5" :key="`skeleton-${n}`" />
        </template>

        <tr v-else-if="!formattedRows.length" key="empty">
          <td colspan="7" class="py-12 text-center text-text/50 italic">
            Tidak ada data untuk periode ini.
          </td>
        </tr>

        <tr v-else v-for="(row, idx) in formattedRows" :key="idx"
          class="hover:bg-secondary/5 transition-colors group relative">
          <td
            class="px-6 py-4 font-bold text-text whitespace-nowrap sticky left-0 z-20 bg-background group-hover:bg-secondary/5 transition-colors shadow-[4px_0_8px_-4px_rgba(0,0,0,0.05)]">
            {{ row.nama }}</td>
          <td class="px-6 py-4 text-center whitespace-nowrap">{{ row.tanggal }}</td>
          <td class="px-6 py-4 text-center font-mono text-xs">{{ row.jamMasuk }}</td>
          <td class="px-6 py-4 text-center font-mono text-xs text-text/60">{{ row.breakOut }}</td>
          <td class="px-6 py-4 text-center font-mono text-xs text-text/60">{{ row.breakIn }}</td>
          <td class="px-6 py-4 text-center font-mono text-xs">{{ row.jamKeluar }}</td>
          <td class="px-6 py-4">
            <span v-if="row.ket" class="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold" :class="{
              'bg-danger/10 text-danger': row.ket === 'Tidak hadir',
              'bg-warning/10 text-warning': row.ket === 'Data Tidak Lengkap',
              'bg-secondary/20 text-text/70': row.ket === 'Libur'
            }">
              {{ row.ket }}
            </span>
            <span v-else class="text-text/30 text-xs italic">-</span>
          </td>
        </tr>
      </TransitionGroup>
    </table>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--color-secondary) / 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--color-secondary) / 0.5);
}

/* List Transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

.list-leave-active {
  position: absolute;
  width: 100%;
}
</style>

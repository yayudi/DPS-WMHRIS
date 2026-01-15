<!-- components\DetailView.vue -->
<script setup>
import { computed } from 'vue'
import { formatJamMenit } from '@/api/helpers/time.js'

const props = defineProps({
  user: { type: Object, default: null }, // For single user mode { id, nama, logs[] }
  users: { type: Array, default: null }, // For multi-user mode, array of { id, nama, logs[] }
  year: { type: Number, required: true },
  month: { type: Number, required: true },
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
    class="overflow-x-auto max-h-[75vh] border border-secondary/30 rounded-lg shadow-sm bg-background"
  >
    <table class="min-w-[800px] bg-background text-sm text-text border-collapse">
      <!-- Themed table header -->
      <thead class="bg-secondary text-text/90 font-semibold sticky top-0">
        <tr>
          <th class="px-4 py-2 border-b border-secondary">Nama</th>
          <th class="px-4 py-2 border-b border-secondary">Tanggal</th>
          <th class="px-4 py-2 border-b border-secondary">Jam Masuk</th>
          <th class="px-4 py-2 border-b border-secondary">Mulai Istirahat</th>
          <th class="px-4 py-2 border-b border-secondary">Selesai Istirahat</th>
          <th class="px-4 py-2 border-b border-secondary">Jam Keluar</th>
          <th class="px-4 py-2 border-b border-secondary">Keterangan</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-secondary">
        <tr
          v-for="(row, idx) in formattedRows"
          :key="idx"
          class="hover:bg-primary/10 transition-colors"
        >
          <td class="px-4 py-2">{{ row.nama }}</td>
          <td class="px-4 py-2 text-center">{{ row.tanggal }}</td>
          <td class="px-4 py-2 text-center">{{ row.jamMasuk }}</td>
          <td class="px-4 py-2 text-center">{{ row.breakOut }}</td>
          <td class="px-4 py-2 text-center">{{ row.breakIn }}</td>
          <td class="px-4 py-2 text-center">{{ row.jamKeluar }}</td>
          <td class="px-4 py-2">
            <span
              :class="{
                'text-accent': row.ket === 'Tidak Hadir' || row.ket === 'Data Tidak Lengkap',
              }"
            >
              {{ row.ket }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

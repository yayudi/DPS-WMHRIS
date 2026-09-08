<script setup>
import { ref, watch, computed } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import axios from '@/api/axios'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import BaseModal from '@/components/ui/BaseModal.vue'

const props = defineProps({
  isOpen: Boolean,
  logData: Object,
})

const emit = defineEmits(['close', 'update'])

const form = ref({
  status: 'HADIR',
  timeIn: '',
  timeOut: '',
  latePardonMinutes: 0,
  notes: '',
})

const isLoading = ref(false)
const errorMsg = ref('')

// Initialize form when logData changes
watch(
  () => props.logData,
  (newVal) => {
    if (newVal) {
      // Determine status from existing data
      let currentStatus = 'HADIR'

      if (newVal.dbStatus) {
        currentStatus = newVal.dbStatus
      } else {
        // Fallback logic
        if (newVal.status === 4) currentStatus = 'SAKIT'
        else if (newVal.status === 5) currentStatus = 'IZIN'
        else if (newVal.status === 1 || newVal.status === 2) currentStatus = 'ALPHA'
        else if (newVal.status === 0 || newVal.status === 3) currentStatus = 'HADIR'
      }

      form.value = {
        status: currentStatus,
        timeIn: newVal.jamMasuk ? minutesToTimeStr(newVal.jamMasuk) : '',
        timeOut: newVal.jamKeluar ? minutesToTimeStr(newVal.jamKeluar) : '',
        latePardonMinutes: newVal.late_pardon_minutes || 0,
        notes: newVal.notes || '', // No need to replace regex anymore
      }
    }
  },
  { immediate: true },
)

function minutesToTimeStr(minutes) {
  if (minutes === null || minutes === undefined) return ''
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

const statusOptions = [
  { value: 'HADIR', label: 'Hadir' },
  { value: 'SAKIT', label: 'Sakit' },
  { value: 'IZIN', label: 'Izin' },
  { value: 'ALPHA', label: 'Alpha / Tanpa Ket' },
]

const canSave = computed(() => {
  if (form.value.status === 'HADIR') {
    return true
  }
  return true
})

async function handleSave() {
  if (!props.logData) return

  isLoading.value = true
  errorMsg.value = ''

  try {
    // Prepare payload
    const payload = {
      username: props.logData.username,
      date: props.logData.fullDate,
      status: form.value.status,
      timeIn: form.value.timeIn,
      timeOut: form.value.timeOut,
      latePardonMinutes: form.value.latePardonMinutes,
      notes: form.value.notes,
    }

    const { data } = await axios.post('/attendance/update', payload)

    if (data.success) {
      emit('update')
      emit('close')
    }
  } catch (err) {
    console.error(err)
    errorMsg.value = err.response?.data?.message || 'Gagal menyimpan data.'
  } finally {
    isLoading.value = false
  }
}

// --- LOCAL HOTKEYS ---
const { Alt_S } = useMagicKeys()

watch(Alt_S, (pressed) => {
  if (pressed && props.isOpen && !isLoading.value && canSave.value) {
    handleSave()
  }
})
</script>

<template>
  <BaseModal :show="isOpen" @close="$emit('close')" maxWidth="max-w-md">
    <template #title>
      <div class="-mt-1">
        <h3 class="font-bold text-lg text-text">Edit Absensi</h3>
      </div>
    </template>

    <div class="space-y-4">
      <div
        v-if="logData"
        class="flex items-center justify-between text-sm bg-primary/5 p-3 rounded-lg border border-primary/10"
      >
        <div>
          <span class="block text-xs uppercase font-bold text-primary/70">Karyawan</span>
          <span class="font-medium text-text">{{ logData.nama }}</span>
        </div>
        <div class="text-right">
          <span class="block text-xs uppercase font-bold text-primary/70">Tanggal</span>
          <span class="font-medium text-text">{{ logData.displayDate }}</span>
        </div>
      </div>

      <!-- Status -->
      <div>
        <label class="block text-xs font-bold uppercase text-text/50 mb-1">Status Kehadiran</label>
        <BaseSelect
          v-model="form.status"
          :options="statusOptions"
          track-by="value"
          emit-value
          :searchable="false"
        />
      </div>

      <!-- Times and Pardon -->
      <div class="grid grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-bold uppercase text-text/50 mb-1">Masuk</label>
          <input
            type="time"
            v-model="form.timeIn"
            class="w-full bg-background border border-secondary/20 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label class="block text-xs font-bold uppercase text-text/50 mb-1">Keluar</label>
          <input
            type="time"
            v-model="form.timeOut"
            class="w-full bg-background border border-secondary/20 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
          />
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase text-text/50 mb-1 leading-tight">Pengampunan (Mnt)</label>
          <input
            type="number"
            v-model.number="form.latePardonMinutes"
            min="0"
            class="w-full bg-background border border-secondary/20 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      <!-- Notes -->
      <div>
        <label class="block text-xs font-bold uppercase text-text/50 mb-1"
          >Catatan / Keterangan</label
        >
        <textarea
          v-model="form.notes"
          rows="3"
          placeholder="Contoh: Sakit tipes, Izin urus SIM..."
          class="w-full bg-background border border-secondary/20 rounded-lg px-3 py-2 text-text focus:outline-none focus:border-primary"
        ></textarea>
      </div>

      <div v-if="errorMsg" class="text-xs text-danger font-bold bg-danger/10 p-2 rounded">
        {{ errorMsg }}
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <button
          @click="$emit('close')"
          class="px-4 py-2 text-sm font-bold text-text/60 hover:text-text hover:bg-secondary/10 rounded-lg transition-colors"
        >
          Batal
        </button>
        <button
          @click="handleSave"
          :disabled="isLoading || !canSave"
          class="px-4 py-2 text-sm font-bold text-background bg-primary hover:bg-primary/90 rounded-lg shadow-lg shadow-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
        >
          <span v-if="isLoading" class="animate-spin text-background">
            <font-awesome-icon icon="fa-solid fa-spinner" />
          </span>
          <span>Simpan Perubahan</span>
        </button>
      </div>
    </template>
  </BaseModal>
</template>

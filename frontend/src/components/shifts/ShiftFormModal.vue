<script setup>
import { ref, watch } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import { useToast } from '@/composables/useToast'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useShift } from '@/modules/hr/application/useShift'
import { shiftSchema } from '@/modules/hr/domain/shift.validator'

const { createShift, updateShift } = useShift()

const props = defineProps({
  show: Boolean,
  shift: Object, // If null, create mode
})

const emit = defineEmits(['close', 'updated'])
const { toast } = useToast()

const form = ref({
  name: '',
  start_time: '08:00',
  end_time: '16:00',
  flexible_minutes: 0,
  work_days: '1,2,3,4,5', // Default Mon-Fri
  is_default: false
})

const isLoading = ref(false)
const daysOptions = [
  { value: '1', label: 'Sen' },
  { value: '2', label: 'Sel' },
  { value: '3', label: 'Rab' },
  { value: '4', label: 'Kam' },
  { value: '5', label: 'Jum' },
  { value: '6', label: 'Sab' },
  { value: '7', label: 'Min' },
]

// Parse/Serialize work_days for checkbox handling
const selectedDays = ref(['1', '2', '3', '4', '5'])

watch(() => props.shift, (newShift) => {
  if (newShift) {
    form.value = {
      name: newShift.name,
      start_time: newShift.start_time ? newShift.start_time.slice(0, 5) : '08:00',
      end_time: newShift.end_time ? newShift.end_time.slice(0, 5) : '16:00',
      flexible_minutes: newShift.flexible_minutes || 0,
      work_days: newShift.work_days || '',
      is_default: !!newShift.is_default
    }
    selectedDays.value = newShift.work_days ? newShift.work_days.split(',') : []
  } else {
    // Reset
    form.value = {
      name: '',
      start_time: '08:00',
      end_time: '16:00',
      flexible_minutes: 0,
      work_days: '1,2,3,4,5',
      is_default: false
    }
    selectedDays.value = ['1', '2', '3', '4', '5']
  }
}, { immediate: true })

async function handleSave() {
  form.value.work_days = selectedDays.value.join(',')

  // Validate using Zod
  const result = shiftSchema.safeParse(form.value)
  if (!result.success) {
    const errorMessages = result.error.errors.map(e => e.message).join('\n')
    toast(errorMessages, 'warning')
    return
  }

  isLoading.value = true
  try {
    if (props.shift) {
      await updateShift(props.shift.id, form.value)
      toast('Shift berhasil diperbarui', 'success')
    } else {
      await createShift(form.value)
      toast('Shift berhasil dibuat', 'success')
    }
    emit('updated')
    emit('close')
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
  } finally {
    isLoading.value = false
  }
}

// --- LOCAL HOTKEYS ---
const { Alt_S } = useMagicKeys()

watch(Alt_S, (pressed) => {
  if (pressed && props.show && !isLoading.value) {
    handleSave()
  }
})
</script>

<template>
  <BaseModal :show="props.show" @close="emit('close')" :title="props.shift ? 'Edit Shift' : 'Tambah Shift Baru'">
    <div class="p-6 space-y-4">
      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">Nama Shift</label>
        <input v-model="form.name" type="text" placeholder="Contoh: Shift Pagi" class="w-full input-field" />
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-text/80 mb-1">Jam Masuk</label>
          <input v-model="form.start_time" type="time" class="w-full input-field" />
        </div>
        <div>
          <label class="block text-sm font-medium text-text/80 mb-1">Jam Pulang</label>
          <input v-model="form.end_time" type="time" class="w-full input-field" />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-text/80 mb-1">
          Toleransi Keterlambatan (Menit)
          <span class="text-xs text-text/60 font-normal">- Beri 0 untuk Fixed Shift (Absolut)</span>
        </label>
        <input v-model="form.flexible_minutes" type="number" min="0" class="w-full input-field" />
      </div>

      <div>
        <label class="block text-sm font-medium text-text/80 mb-2">Hari Kerja</label>
        <div class="flex flex-wrap gap-2">
          <label v-for="day in daysOptions" :key="day.value"
            class="cursor-pointer border px-3 py-1 rounded-md text-sm transition-colors select-none"
            :class="selectedDays.includes(day.value) ? 'bg-primary text-secondary border-primary' : 'bg-background text-text/60 border-secondary/30 hover:border-primary/50'">
            <input type="checkbox" :value="day.value" v-model="selectedDays" class="hidden">
            {{ day.label }}
          </label>
        </div>
      </div>

      <div class="flex items-center gap-2 mt-2">
        <input type="checkbox" id="default" v-model="form.is_default"
          class="rounded text-primary focus:ring-primary bg-background border-secondary/50">
        <label for="default" class="text-sm font-medium text-text/80 select-none cursor-pointer">Set sebagai Shift
          Default</label>
      </div>
    </div>

    <template #footer>
      <button @click="emit('close')" class="btn-secondary">
        Batal
      </button>
      <button @click="handleSave" :disabled="isLoading" class="btn-primary flex items-center gap-2">
        <font-awesome-icon v-if="isLoading" icon="fa-solid fa-spinner" spin />
        <span>Simpan</span>
      </button>
    </template>
  </BaseModal>
</template>

<style lang="postcss" scoped>
.input-field {
  @apply w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-primary focus:border-primary text-text;
}

.btn-primary {
  @apply bg-primary text-secondary px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors;
}

.btn-secondary {
  @apply bg-background border border-secondary/30 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-secondary/20 transition-colors text-text/80;
}
</style>

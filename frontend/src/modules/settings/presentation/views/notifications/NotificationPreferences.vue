<template>
  <div class="p-6 max-w-2xl mx-auto">
    <div class="mb-6">
      <button @click="router.back()" class="text-muted hover:text-text mb-4 inline-flex items-center">
        <font-awesome-icon icon="fa-solid fa-arrow-left" class="mr-2" /> Kembali
      </button>
      <h1 class="text-2xl font-bold text-text">Preferensi Notifikasi</h1>
      <p class="text-muted mt-1 text-sm">Atur notifikasi mana saja yang ingin Anda terima melalui aplikasi web.</p>
    </div>

    <div class="bg-background rounded-lg border border-secondary shadow-sm overflow-hidden">
      <div v-if="loading" class="flex justify-center items-center h-32 text-muted">
        <font-awesome-icon icon="fa-solid fa-spinner" class="fa-spin fa-2x" />
      </div>

      <div v-else>
        <div
          v-for="(pref, index) in preferences"
          :key="pref.type"
          class="p-5 flex items-center justify-between"
          :class="{ 'border-b border-secondary': index !== preferences.length - 1 }"
        >
          <div class="pr-4">
            <h3 class="font-semibold text-text flex items-center">
              <font-awesome-icon
                :icon="['fas', getIconClass(pref.type).split(' ')[0].replace('fa-', '')]"
                class="mr-2 w-5 text-center"
                :class="getIconClass(pref.type).split(' ')[1]"
              />
              {{ getTitle(pref.type) }}
            </h3>
            <p class="text-sm text-muted mt-1">{{ getDescription(pref.type) }}</p>
          </div>

          <div class="flex-shrink-0">
            <!-- Toggle Switch -->
            <button
              @click="togglePreference(index)"
              class="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out"
              :class="pref.is_enabled ? 'bg-primary' : 'bg-secondary'"
              role="switch"
              :aria-checked="pref.is_enabled"
            >
              <span class="sr-only">Use setting</span>
              <span
                aria-hidden="true"
                class="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                :class="pref.is_enabled ? 'translate-x-5' : 'translate-x-0'"
              ></span>
            </button>
          </div>
        </div>
      </div>

      <div class="p-5 border-t border-secondary bg-secondary/30 flex justify-end">
        <button
          @click="savePreferences"
          :disabled="saving"
          class="px-6 py-2 bg-primary text-white font-medium rounded hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <font-awesome-icon v-if="saving" icon="fa-solid fa-spinner" class="fa-spin mr-2" />
          {{ saving ? 'Menyimpan...' : 'Simpan Perubahan' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { notificationApi } from '../../../infrastructure/notification.api'
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/useToast'

const router = useRouter()
const loading = ref(true)
const saving = ref(false)
const preferences = ref([])
const { toast } = useToast()

onMounted(async () => {
  try {
    const data = await notificationApi.getPreferences()
    preferences.value = data
  } catch {
    toast('Gagal memuat preferensi', 'error')
  } finally {
    loading.value = false
  }
})

const togglePreference = index => {
  preferences.value[index].is_enabled = !preferences.value[index].is_enabled
}

const savePreferences = async () => {
  saving.value = true
  try {
    await notificationApi.updatePreferences(preferences.value)
    toast('Preferensi disimpan', 'success')
  } catch {
    toast('Gagal menyimpan preferensi', 'error')
  } finally {
    saving.value = false
  }
}

const getTitle = type => {
  const titles = {
    WMS: 'Notifikasi WMS (Gudang)',
    HRIS: 'Notifikasi HRIS (SDM)',
    SYSTEM: 'Pembaruan Sistem'
  }
  return titles[type] || type
}

const getDescription = type => {
  const descs = {
    WMS: 'Peringatan stok menipis, jadwal opname, pesanan masuk, dll.',
    HRIS: 'Permintaan cuti, peringatan absensi, pengumuman HR, dll.',
    SYSTEM: 'Maintenance server, fitur baru, dan peringatan keamanan.'
  }
  return descs[type] || ''
}

const getIconClass = type => {
  if (type === 'WMS') return 'fa-box text-accent'
  if (type === 'HRIS') return 'fa-users text-primary'
  return 'fa-server text-muted'
}
</script>

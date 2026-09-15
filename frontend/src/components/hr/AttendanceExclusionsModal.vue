<!-- frontend/src/components/hr/AttendanceExclusionsModal.vue -->
<script setup>
import { ref, watch, computed } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useMasterDataStore } from '@/stores/masterData'

const masterData = useMasterDataStore()
import api from '@/api/axios.js'
import { useToast } from '@/composables/useToast.js'

const props = defineProps({
  isOpen: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'updated'])

const { toast } = useToast()
const users = ref([])
const loading = ref(false)
const searchQuery = ref('')
const updatingId = ref(null)

const filteredUsers = computed(() => {
  if (!searchQuery.value) return users.value
  const q = searchQuery.value.toLowerCase()
  return users.value.filter(
    u => u.username.toLowerCase().includes(q) || (u.nickname && u.nickname.toLowerCase().includes(q))
  )
})

async function loadUsers() {
  loading.value = true
  try {
    users.value = await masterData.getUsers()
  } catch (err) {
    console.error('Error loading users for exclusions:', err)
  } finally {
    loading.value = false
  }
}

watch(
  () => props.isOpen,
  newVal => {
    if (newVal) {
      searchQuery.value = ''
      loadUsers()
    }
  }
)

async function toggleExclusion(user) {
  if (updatingId.value) return

  updatingId.value = user.id
  const newValue = !user.exclude_from_attendance

  try {
    const payload = {
      username: user.username,
      nickname: user.nickname,
      role_id: user.role_id,
      shift_id: user.shift_id,
      exclude_from_attendance: newValue
    }

    await api.put(`/admin/users/${user.id}`, payload)

    // Update local state to reflect UI change instantly
    user.exclude_from_attendance = newValue
    toast(`Berhasil mengubah pengecualian untuk ${user.username}`, 'success')
    emit('updated')
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
    console.error(error)
  } finally {
    updatingId.value = null
  }
}
</script>

<template>
  <BaseModal :show="isOpen" @close="$emit('close')" title="Pengecualian Absen">
    <div class="space-y-4">
      <div class="text-sm text-text/80 mb-4 bg-primary/10 p-3 rounded-lg border border-primary/20">
        <font-awesome-icon icon="fa-solid fa-circle-info" class="text-primary mr-2" />
        Pengguna yang dicentang tidak akan muncul dalam daftar absensi dan statistik. Gunakan ini untuk Direksi atau
        Karyawan Remote.
      </div>

      <div class="relative">
        <font-awesome-icon
          icon="fa-solid fa-search"
          class="absolute left-3 top-1/2 transform -translate-y-1/2 text-text/40"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari nama atau username..."
          class="w-full pl-9 pr-4 py-2 bg-background border border-secondary/30 rounded-lg text-sm focus:outline-none focus:border-primary transition-colors text-text"
        />
      </div>

      <div class="border border-secondary/20 rounded-xl overflow-hidden bg-background">
        <div v-if="loading" class="p-8 text-center text-text/50">
          <font-awesome-icon icon="fa-solid fa-spinner" class="animate-spin text-2xl mb-2" />
          <p>Memuat daftar pengguna...</p>
        </div>

        <div v-else-if="filteredUsers.length === 0" class="p-8 text-center text-text/50">
          Tidak ada pengguna yang cocok dengan pencarian.
        </div>

        <div v-else class="max-h-[50vh] overflow-y-auto custom-scrollbar">
          <table class="w-full text-sm text-left">
            <thead class="sticky top-0 bg-secondary/10 border-b border-secondary/20 z-10 backdrop-blur-md">
              <tr class="text-xs text-text/60 font-semibold uppercase">
                <th class="px-4 py-3">Pengguna</th>
                <th class="px-4 py-3 text-center w-24">Pengecualian</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-secondary/10">
              <tr
                v-for="user in filteredUsers"
                :key="user.id"
                class="hover:bg-secondary/5 transition-colors"
                :class="{ 'opacity-50': updatingId === user.id }"
              >
                <td class="px-4 py-3">
                  <div class="font-medium text-text">{{ user.nickname || user.username }}</div>
                  <div class="text-xs text-text/50 font-mono">{{ user.username }} • {{ user.role_name }}</div>
                </td>
                <td class="px-4 py-3 text-center">
                  <button
                    @click="toggleExclusion(user)"
                    :disabled="updatingId !== null"
                    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                    :class="user.exclude_from_attendance ? 'bg-danger' : 'bg-secondary'"
                  >
                    <span
                      class="inline-block h-4 w-4 transform rounded-full bg-background transition-transform"
                      :class="user.exclude_from_attendance ? 'translate-x-6' : 'translate-x-1'"
                    />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <template #footer>
      <button
        @click="$emit('close')"
        class="bg-background border border-secondary/30 text-text/80 hover:bg-secondary/20 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        Tutup
      </button>
    </template>
  </BaseModal>
</template>

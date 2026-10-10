<template>
  <div class="p-6 max-w-4xl mx-auto">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-text">Pusat Notifikasi</h1>
      <div class="flex gap-3">
        <button
          @click="markAllAsDone"
          class="px-4 py-2 bg-secondary text-primary rounded-md hover:bg-secondary/80 font-medium text-sm transition-colors border border-secondary"
        >
          Tandai Semua Selesai
        </button>
        <router-link
          to="/notifications/preferences"
          class="px-4 py-2 bg-background border border-secondary text-text rounded-md hover:bg-secondary transition-colors font-medium text-sm flex items-center"
        >
          <font-awesome-icon icon="fa-solid fa-gear" class="mr-2" /> Pengaturan
        </router-link>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-secondary mb-6 flex overflow-x-auto">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        @click="activeTab = tab.value"
        class="px-6 py-3 font-medium text-sm border-b-2 whitespace-nowrap transition-colors"
        :class="
          activeTab === tab.value
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-text hover:border-secondary'
        "
      >
        <font-awesome-icon :icon="['fas', tab.icon.replace('fa-', '')]" class="mr-2" /> {{ tab.label }}
      </button>
    </div>

    <!-- Content -->
    <div class="bg-background rounded-lg border border-secondary shadow-sm overflow-hidden min-h-[400px]">
      <div v-if="loading" class="flex justify-center items-center h-48 text-muted">
        <font-awesome-icon icon="fa-solid fa-spinner" class="fa-spin fa-2x" />
      </div>

      <div v-else-if="notifications.length === 0" class="flex flex-col items-center justify-center h-64 text-muted">
        <font-awesome-icon icon="fa-solid fa-bell-slash" class="fa-3x mb-4 opacity-50" />
        <p class="text-lg">Tidak ada notifikasi di kategori ini.</p>
      </div>

      <div v-else>
        <div
          v-for="notif in notifications"
          :key="notif.id"
          class="p-5 border-b border-secondary hover:bg-secondary/50 transition-colors flex flex-col sm:flex-row gap-4"
          :class="{ 'bg-primary/5': !notif.is_done }"
        >
          <div class="flex-shrink-0 pt-1">
            <div class="w-10 h-10 rounded-full flex items-center justify-center" :class="getIconBgClass(notif.type)">
              <font-awesome-icon
                :icon="['fas', getIconClass(notif.type).split(' ')[0].replace('fa-', '')]"
                :class="getIconClass(notif.type).split(' ')[1]"
              />
            </div>
          </div>

          <div class="flex-1">
            <div class="flex justify-between items-start mb-1">
              <h3 class="text-base font-semibold" :class="!notif.is_done ? 'text-text' : 'text-text/80'">
                {{ notif.title }}
                <span v-if="!notif.is_done" class="ml-2 inline-flex w-2 h-2 rounded-full bg-danger"></span>
              </h3>
              <span class="text-xs text-muted whitespace-nowrap ml-4">{{ formatTime(notif.created_at) }}</span>
            </div>

            <p class="text-sm mb-3" :class="!notif.is_done ? 'text-text' : 'text-muted'">
              {{ notif.message }}
            </p>

            <div
              v-if="notif.is_done && notif.completed_by_name"
              class="mb-3 text-xs text-primary bg-primary/10 inline-block px-2 py-1 rounded border border-primary/20"
            >
              <font-awesome-icon icon="fa-solid fa-check-circle" class="mr-1" /> Diselesaikan oleh
              <span class="font-semibold">{{ notif.completed_by_name }}</span> pada {{ formatTime(notif.completed_at) }}
            </div>

            <div
              v-if="!notif.is_done && notif.claimed_by && notif.claimed_by !== currentUser?.id"
              class="mb-3 text-xs text-warning bg-warning/10 inline-block px-2 py-1 rounded border border-warning/20"
            >
              <font-awesome-icon icon="fa-solid fa-hourglass-half" class="mr-1" /> Sedang dikerjakan oleh
              <span class="font-semibold">{{ notif.claimed_by_name }}</span>
            </div>

            <div
              class="flex flex-wrap gap-2"
              v-if="!notif.is_done && (!notif.claimed_by || notif.claimed_by === currentUser?.id)"
            >
              <button
                v-if="!notif.claimed_by && notif.target_permission"
                @click="claimTask(notif.id)"
                class="px-3 py-1.5 bg-warning text-white text-xs font-medium rounded hover:opacity-90 transition-opacity"
              >
                <font-awesome-icon icon="fa-solid fa-hand-paper" class="mr-1" /> Ambil Tugas
              </button>

              <button
                v-if="notif.action_payload && (!notif.target_permission || notif.claimed_by === currentUser?.id)"
                @click="handleAction(notif)"
                class="px-3 py-1.5 bg-primary text-white text-xs font-medium rounded hover:opacity-90 transition-opacity"
              >
                <font-awesome-icon icon="fa-solid fa-arrow-right" class="mr-1" /> Tindak Lanjut
              </button>
            </div>
          </div>

          <div
            class="flex-shrink-0 flex items-center sm:items-start mt-2 sm:mt-0"
            v-if="!notif.is_done && (!notif.claimed_by || notif.claimed_by === currentUser?.id)"
          >
            <button
              v-if="!notif.target_permission || notif.claimed_by === currentUser?.id"
              @click="markAsDone(notif.id)"
              class="text-muted hover:text-primary p-2"
              title="Tandai selesai"
            >
              <font-awesome-icon icon="fa-solid fa-check" />
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { notificationApi } from '../../../infrastructure/notification.api'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { useFirebaseSync } from '@/composables/useFirebaseSync'

const router = useRouter()
const authStore = useAuthStore()
const currentUser = computed(() => authStore.user)

const loading = ref(true)
const notifications = ref([])
const activeTab = ref('ALL')

const tabs = [
  { label: 'Semua', value: 'ALL', icon: 'fa-inbox' },
  { label: 'WMS', value: 'WMS', icon: 'fa-box' },
  { label: 'HRIS', value: 'HRIS', icon: 'fa-users' },
  { label: 'Sistem', value: 'SYSTEM', icon: 'fa-server' }
]

const fetchNotifications = async () => {
  loading.value = true
  try {
    const data = await notificationApi.getNotifications(1, 100, activeTab.value)
    notifications.value = data.data
  } catch (error) {
    console.error('Failed to fetch notifications:', error)
  } finally {
    loading.value = false
  }
}

watch(activeTab, () => {
  fetchNotifications()
})

onMounted(() => {
  fetchNotifications()
})
useFirebaseSync(currentUser.value?.permissions || [], 'REFRESH_NOTIFICATIONS', () => {
  notificationApi.getNotifications(1, 100, activeTab.value)
    .then(data => {
      notifications.value = data.data
    })
    .catch(err => console.error('Silent fetch failed:', err))
})

const markAllAsDone = async () => {
  try {
    await notificationApi.markAllAsDone()
    notifications.value.forEach(n => (n.is_done = 1))
  } catch (error) {
    console.error('Failed to mark all as done:', error)
  }
}

const markAsDone = async id => {
  try {
    await notificationApi.markAsDone(id)
    const notif = notifications.value.find(n => n.id === id)
    if (notif) notif.is_done = 1
  } catch (error) {
    console.error('Failed to mark as done:', error)
  }
}

const handleAction = async notif => {
  await markAsDone(notif.id)
  if (notif.action_payload && notif.action_payload.url) {
    router.push(notif.action_payload.url)
  }
}

const claimTask = async id => {
  try {
    const data = await notificationApi.claimNotification(id)
    if (data.success) {
      fetchNotifications()
    }
  } catch (error) {
    console.error('Failed to claim task:', error)
    if (error.response?.data?.message) {
      alert(error.response.data.message)
    }
    fetchNotifications()
  }
}

const getIconClass = type => {
  if (type === 'WMS') return 'fa-box text-accent'
  if (type === 'HRIS') return 'fa-users text-primary'
  return 'fa-circle-info text-text'
}

const getIconBgClass = type => {
  if (type === 'WMS') return 'bg-accent/10'
  if (type === 'HRIS') return 'bg-primary/10'
  return 'bg-secondary'
}

const formatTime = dateString => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffInMinutes = Math.floor((now - date) / 60000)

  if (diffInMinutes < 1) return 'Baru saja'
  if (diffInMinutes < 60) return `${diffInMinutes} mnt`
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} jam`
  if (diffInMinutes < 2880) return 'Kemarin'

  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
</script>

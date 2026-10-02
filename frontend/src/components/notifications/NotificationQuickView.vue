<template>
  <div class="relative">
    <button @click="togglePopover" class="w-12 relative flex items-center gap-2 text-text/80 hover:text-primary">
      <font-awesome-icon icon="fa-solid fa-bell" class="text-xl" />
      <span
        v-if="pendingCount > 0"
        class="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-danger rounded-full"
      >
        {{ pendingCount > 99 ? '99+' : pendingCount }}
      </span>
    </button>

    <!-- Popover -->
    <div
      v-if="isOpen"
      class="absolute right-0 z-[200] mt-2 w-80 bg-background rounded-md shadow-lg overflow-hidden border border-secondary"
    >
      <div class="px-4 py-3 border-b border-secondary bg-secondary flex justify-between items-center">
        <h3 class="text-sm font-semibold text-text">Notifikasi</h3>
        <button
          v-if="pendingCount > 0"
          @click="markAllAsDone"
          class="text-xs text-primary hover:opacity-80 font-medium"
        >
          Tandai semua selesai
        </button>
      </div>

      <div class="max-h-96 overflow-y-auto">
        <div v-if="loading" class="p-4 text-center text-muted">
          <font-awesome-icon icon="fa-solid fa-spinner" class="fa-spin mr-2" /> Memuat...
        </div>
        <div v-else-if="notifications.length === 0" class="p-4 text-center text-muted text-sm">
          Tidak ada notifikasi baru.
        </div>
        <div v-else>
          <div
            v-for="notif in notifications"
            :key="notif.id"
            class="p-4 border-b border-secondary hover:bg-secondary cursor-pointer transition-colors"
            @click="handleNotificationClick(notif)"
          >
            <div class="flex items-start">
              <div class="flex-shrink-0 mr-3 mt-1">
                <!-- Icon based on type -->
                <font-awesome-icon v-if="notif.type === 'WMS'" icon="fa-solid fa-box" class="text-accent" />
                <font-awesome-icon v-else-if="notif.type === 'HRIS'" icon="fa-solid fa-users" class="text-primary" />
                <font-awesome-icon v-else icon="fa-solid fa-circle-info" class="text-muted" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-text truncate">{{ notif.title }}</p>
                <p class="text-sm text-muted line-clamp-2">{{ notif.message }}</p>
                <div
                  v-if="notif.claimed_by && notif.claimed_by !== currentUser?.id"
                  class="mt-1 text-[10px] text-warning bg-warning/10 inline-block px-1.5 py-0.5 rounded border border-warning/20"
                >
                  <font-awesome-icon icon="fa-solid fa-hourglass-half" class="mr-1" /> Sedang dikerjakan oleh
                  {{ notif.claimed_by_name }}
                </div>
                <p class="text-xs text-muted/70 mt-1">{{ formatTime(notif.created_at) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="p-2 border-t border-secondary bg-secondary text-center">
        <router-link
          to="/notifications"
          @click="isOpen = false"
          class="text-sm font-medium text-primary hover:opacity-80 block p-1"
        >
          Lihat Semua Notifikasi
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import api from '@/api/axios'
import { useAuthStore } from '@/stores/auth.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'

const router = useRouter()
const authStore = useAuthStore()
const currentUser = computed(() => authStore.user)
const isOpen = ref(false)
const notifications = ref([])
const pendingCount = ref(0)
const loading = ref(false)

const togglePopover = () => {
  isOpen.value = !isOpen.value
  if (isOpen.value && notifications.value.length === 0) {
    fetchNotifications()
  }
}

const fetchNotifications = async () => {
  try {
    loading.value = true
    const response = await api.get('/notifications/recent?limit=5')
    if (response.data.success) {
      notifications.value = response.data.data
      pendingCount.value = notifications.value.length // In real app, might want a separate count endpoint if limit < total unread
    }
  } catch (error) {
    console.error('Failed to fetch notifications:', error)
  } finally {
    loading.value = false
  }
}

const markAllAsDone = async () => {
  try {
    await api.put('/notifications/all/done')
    notifications.value = []
    pendingCount.value = 0
  } catch (error) {
    console.error('Failed to mark all as done:', error)
  }
}

const markAsDone = async id => {
  try {
    await api.put(`/notifications/${id}/done`)
    notifications.value = notifications.value.filter(n => n.id !== id)
    pendingCount.value = notifications.value.length
  } catch (error) {
    console.error('Failed to mark as done:', error)
  }
}

const handleNotificationClick = async notif => {
  isOpen.value = false

  if (notif.claimed_by && notif.claimed_by !== currentUser.value?.id) {
    return
  }

  if (!notif.claimed_by && notif.target_permission) {
    router.push('/notifications')
    return
  }

  await markAsDone(notif.id)

  if (notif.action_payload && notif.action_payload.url) {
    router.push(notif.action_payload.url)
  }
}

const formatTime = dateString => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffInMinutes = Math.floor((now - date) / 60000)

  if (diffInMinutes < 1) return 'Baru saja'
  if (diffInMinutes < 60) return `${diffInMinutes} mnt yang lalu`
  if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)} jam yang lalu`
  return date.toLocaleDateString('id-ID')
}

// Firebase Realtime Listener
onMounted(() => {
  fetchNotifications()

  // Close popover when clicking outside (basic implementation)
  document.addEventListener('click', closeOnOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', closeOnOutsideClick)
})

useFirebaseSync(currentUser.value?.permissions || [], 'REFRESH_NOTIFICATIONS', () => {
  // Silent fetch
  api
    .get('/notifications/recent?limit=5')
    .then(res => {
      if (res.data.success) {
        notifications.value = res.data.data
        pendingCount.value = notifications.value.length
      }
    })
    .catch(err => console.error('Silent fetch failed:', err))
})

const closeOnOutsideClick = e => {
  const el = document.querySelector('.fa-bell')?.closest('.relative')
  if (el && !el.contains(e.target) && isOpen.value) {
    isOpen.value = false
  }
}
</script>

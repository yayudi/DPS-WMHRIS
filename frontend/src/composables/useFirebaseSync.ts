import { onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { useFirebaseListener } from '@/composables/useFirebaseListener'

/**
 * Composable untuk menyederhanakan proses mendengarkan sinyal Firebase
 * dan otomatis membersihkan listener saat komponen di-unmount.
 *
 * @param {string|string[]} permissions - Nama permission channel atau array permission
 * @param {string|string[]|null} actionNames - Aksi yang memicu callback. Jika null, semua aksi memicu callback.
 * @param {Function} callback - Fungsi yang dijalankan saat aksi diterima, menerima argumen (data)
 */
export function useFirebaseSync(permissions, actionNames, callback) {
  const authStore = useAuthStore()
  let firebaseListener = null

  // Normalisasi input
  const permsArray = Array.isArray(permissions) ? permissions : [permissions]
  
  let actionsArray = null
  if (actionNames) {
    actionsArray = Array.isArray(actionNames) ? actionNames : [actionNames]
  }

  onMounted(() => {
    // Gunakan user.id (atau currentUser.id)
    const userId = authStore.user?.id || authStore.currentUser?.id || 'guest'
    
    if (userId) {
      firebaseListener = useFirebaseListener(
        userId,
        permsArray,
        (data) => {
          if (!actionsArray || actionsArray.includes(data.action)) {
            callback(data)
          }
        }
      )
      firebaseListener.startListening()
    }
  })

  onUnmounted(() => {
    if (firebaseListener) {
      firebaseListener.stopListening()
    }
  })
}

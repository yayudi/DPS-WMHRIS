<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useMagicKeys } from '@vueuse/core'
import { authApi } from '@/modules/auth/infrastructure/auth.api'
import { useToast } from '@/core/presentation/composables/useToast'
import { useAuthStore } from '@/modules/auth/application/auth.store'
import { useI18n } from '@/core/presentation/composables/useI18n'

const { toast } = useToast()
const auth = useAuthStore()
const { currentLocale, availableLocales, setLocale, t } = useI18n()

// State untuk form akun
const username = ref('') // Untuk ditampilkan (read-only)
const nickname = ref('') // Untuk diubah
const currentPassword = ref('')
const newPassword = ref('')
const confirmNewPassword = ref('')
const loading = ref(false)

// State untuk form preferensi
const selectedLocale = ref(currentLocale.value)
const selectedTimezone = ref('Asia/Jakarta')
const selectedDateFormat = ref('YYYY-MM-DD')
const savingPreferences = ref(false)

// Fungsi untuk mengisi data form dari auth store
function populateForm() {
  if (auth.user) {
    username.value = auth.user.username
    // Gunakan nickname jika ada, jika tidak, fallback ke username
    nickname.value = auth.user.nickname || auth.user.username

    if (auth.user.preferences) {
      selectedLocale.value = auth.user.preferences.locale || currentLocale.value
      selectedTimezone.value = auth.user.preferences.timezone || 'Asia/Jakarta'
      selectedDateFormat.value = auth.user.preferences.date_format || 'YYYY-MM-DD'
    }
  }
}

onMounted(async () => {
  await auth.fetchUser()
  populateForm()
})

async function handleUpdate() {
  if (newPassword.value && newPassword.value !== confirmNewPassword.value) {
    toast(t('auth.profile.toast_password_mismatch'), 'warning')
    return
  }
  if (!currentPassword.value) {
    toast(t('auth.profile.toast_current_password_required'), 'warning')
    return
  }

  loading.value = true
  try {
    const payload = {
      currentPassword: currentPassword.value,
      nickname: nickname.value,
      newPassword: newPassword.value || null, // Kirim null jika kosong
    }

    const response = await authApi.updateProfile(payload)

    toast(response?.message || t('common.status.success'), 'success')

    auth.updateUserNickname((response.data as any)?.user?.nickname || nickname.value)

    // Kosongkan field password
    currentPassword.value = ''
    newPassword.value = ''
    confirmNewPassword.value = ''
  } catch (error) {
    console.error(error) 
  } finally {
    loading.value = false
  }
}

async function handleUpdatePreferences() {
  savingPreferences.value = true
  try {
    await setLocale(selectedLocale.value)
    const res = await authApi.updatePreferences({
      locale: selectedLocale.value,
      timezone: selectedTimezone.value,
      date_format: selectedDateFormat.value
    })
    toast(res?.message || t('common.status.success'), 'success')
  } catch (err) {
    console.error(err)
    toast(t('auth.profile.toast_preferences_failed'), 'error')
  } finally {
    savingPreferences.value = false
  }
}

// --- LOCAL HOTKEYS ---
const { Alt_S } = useMagicKeys()

watch(Alt_S, (pressed) => {
  if (pressed && !loading.value) {
    handleUpdate()
  }
})
</script>

<template>
  <div class="p-6">
    <h2 class="text-2xl font-bold text-text mb-6">{{ t('auth.profile.account_settings') }}</h2>

    <div class="max-w-2xl mx-auto bg-background p-8 rounded-xl shadow-md border border-secondary/20">
      <form @submit.prevent="handleUpdate" class="space-y-6">
        <!-- Bagian Informasi Akun -->
        <div>
          <label for="username" class="block text-sm font-medium text-text/80 mb-1">{{ t('auth.profile.username_label') }}</label>
          <input id="username" :value="username" type="text" disabled
            class="w-full px-3 py-2 bg-secondary/20 border border-secondary/30 rounded-lg text-text/60 cursor-not-allowed" />
          <p class="text-xs text-text/60 mt-1">{{ t('auth.profile.username_immutable') }}</p>
        </div>

        <div>
          <label for="nickname" class="block text-sm font-medium text-text/80 mb-1">{{ t('auth.profile.nickname_label') }}</label>
          <input id="nickname" v-model="nickname" type="text"
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50" />
        </div>

        <!-- Bagian Ubah Password -->
        <div class="border-t border-secondary/20 pt-6 space-y-4">
          <h3 class="font-semibold text-lg text-text">{{ t('auth.profile.change_password') }}</h3>
          <div>
            <label for="newPassword" class="block text-sm font-medium text-text/80 mb-1">{{ t('auth.profile.new_password') }}</label>
            <input id="newPassword" v-model="newPassword" type="password"
              :placeholder="t('auth.profile.new_password_placeholder')"
              class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label for="confirmNewPassword" class="block text-sm font-medium text-text/80 mb-1">{{ t('auth.profile.confirm_new_password') }}</label>
            <input id="confirmNewPassword" v-model="confirmNewPassword" type="password"
              class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>

        <!-- Bagian Verifikasi -->
        <div class="border-t border-secondary/20 pt-6 space-y-4">
          <h3 class="font-semibold text-lg text-text">{{ t('auth.profile.verify_changes') }}</h3>
          <p class="text-sm text-text/70">
            {{ t('auth.profile.verify_changes_desc') }}
          </p>
          <div>
            <label for="currentPassword" class="block text-sm font-medium text-text/80 mb-1">{{ t('auth.profile.current_password') }}</label>
            <input id="currentPassword" v-model="currentPassword" type="password" required
              class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>

        <div class="pt-2">
          <button type="submit" :disabled="loading"
            class="w-full bg-primary text-secondary py-2 px-4 rounded-lg hover:bg-primary/90 transition disabled:opacity-50">
            {{ loading ? t('common.status.saving') : t('auth.profile.btn_save_account') }}
          </button>
        </div>
      </form>
    </div>

    <!-- Bagian Preferensi Regional & Bahasa -->
    <div class="max-w-2xl mx-auto bg-background p-8 rounded-xl shadow-md border border-secondary/20 mt-8">
      <h3 class="text-lg font-bold text-text mb-2">{{ t('auth.profile.regional_preferences') }}</h3>
      <p class="text-xs text-text/60 mb-6">{{ t('auth.profile.regional_desc') }}</p>

      <form @submit.prevent="handleUpdatePreferences" class="space-y-5">
        <div>
          <label for="locale" class="block text-sm font-medium text-text/80 mb-1">{{ t('auth.profile.language_label') }}</label>
          <select
            id="locale"
            v-model="selectedLocale"
            class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50 text-sm"
          >
            <option v-for="loc in availableLocales" :key="loc.code" :value="loc.code">
              {{ loc.name }} ({{ loc.code }})
            </option>
          </select>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="timezone" class="block text-sm font-medium text-text/80 mb-1">{{ t('auth.profile.timezone_label') }}</label>
            <select
              id="timezone"
              v-model="selectedTimezone"
              class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50 text-sm"
            >
              <option value="Asia/Jakarta">WIB - Asia/Jakarta (UTC+7)</option>
              <option value="Asia/Makassar">WITA - Asia/Makassar (UTC+8)</option>
              <option value="Asia/Jayapura">WIT - Asia/Jayapura (UTC+9)</option>
              <option value="UTC">UTC (Universal Time)</option>
            </select>
          </div>

          <div>
            <label for="dateFormat" class="block text-sm font-medium text-text/80 mb-1">{{ t('auth.profile.date_format_label') }}</label>
            <select
              id="dateFormat"
              v-model="selectedDateFormat"
              class="w-full px-3 py-2 bg-background border border-secondary/50 rounded-lg focus:ring-2 focus:ring-primary/50 text-sm"
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD (2026-11-03)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY (03/11/2026)</option>
              <option value="DD MMM YYYY">DD MMM YYYY (03 Nov 2026)</option>
            </select>
          </div>
        </div>

        <div class="pt-2">
          <button
            type="submit"
            :disabled="savingPreferences"
            class="w-full bg-secondary/20 hover:bg-secondary/30 text-text font-medium py-2 px-4 rounded-lg transition disabled:opacity-50 text-sm border border-secondary/30"
          >
            {{ savingPreferences ? t('common.status.saving') : t('auth.profile.btn_save_preferences') }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

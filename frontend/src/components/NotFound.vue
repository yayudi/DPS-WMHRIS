<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/UseToast.js'

const router = useRouter()
const { show } = useToast()

onMounted(() => {
  // Tampilkan pesan error menggunakan toast
  show('Halaman tidak ditemukan. Anda dialihkan ke Beranda.', 'error')

  // Arahkan pengguna ke halaman utama
  router.push({ name: 'WMS' })
})
</script>

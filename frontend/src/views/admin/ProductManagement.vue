<!-- frontend\src\views\admin\AddProduct.vue -->
<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useToast } from '@/composables/UseToast.js'
import axios from '@/api/axios.js' // Assuming you have a configured axios instance

const router = useRouter()
const { show } = useToast()

const form = ref({
  sku: '',
  name: '',
  price: 0,
  is_package: false,
})

const loading = ref(false)

async function handleSubmit() {
  if (!form.value.sku || !form.value.name) {
    show('SKU dan Nama wajib diisi.', 'error')
    return
  }

  loading.value = true
  try {
    const response = await axios.post('/products', {
      sku: form.value.sku,
      name: form.value.name,
      price: form.value.price,
      is_package: form.value.is_package,
    })

    if (response.data.success) {
      show('Produk berhasil ditambahkan!', 'success')
      // Reset form or redirect
      router.push('/wms') // Or back to product list if you have one
    }
  } catch (err) {
    console.error(err)
    const msg = err.response?.data?.message || 'Gagal menyimpan produk.'
    show(msg, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="bg-secondary/20 min-h-screen p-6 flex justify-center items-start">
    <div class="w-full max-w-2xl">
      <!-- Header -->
      <div class="mb-6 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-text">Tambah Produk Baru</h1>
          <p class="text-text/60 text-sm">Input data produk manual ke dalam sistem.</p>
        </div>
        <button
          @click="router.back()"
          class="text-sm text-text/60 hover:text-primary transition-colors flex items-center gap-2"
        >
          <font-awesome-icon icon="fa-solid fa-arrow-left" />
          Kembali
        </button>
      </div>

      <!-- Form Card -->
      <div class="bg-background rounded-xl shadow-md border border-secondary/20 p-6">
        <form @submit.prevent="handleSubmit" class="space-y-6">
          <!-- SKU Input -->
          <div>
            <label class="block text-sm font-semibold text-text mb-2">
              SKU (Stock Keeping Unit) <span class="text-danger">*</span>
            </label>
            <div class="relative">
              <div
                class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text/40"
              >
                <font-awesome-icon icon="fa-solid fa-barcode" />
              </div>
              <input
                v-model="form.sku"
                type="text"
                placeholder="Contoh: PP000123"
                class="w-full pl-10 pr-4 py-2 bg-secondary/10 border border-secondary/30 rounded-lg focus:outline-none focus:border-primary text-text placeholder-text/30 transition-colors uppercase font-mono"
                required
              />
            </div>
            <p class="text-xs text-text/50 mt-1">Kode unik untuk identifikasi produk.</p>
          </div>

          <!-- Name Input -->
          <div>
            <label class="block text-sm font-semibold text-text mb-2">
              Nama Produk <span class="text-danger">*</span>
            </label>
            <input
              v-model="form.name"
              type="text"
              placeholder="Contoh: Pipa PVC 3 Inch"
              class="w-full px-4 py-2 bg-secondary/10 border border-secondary/30 rounded-lg focus:outline-none focus:border-primary text-text placeholder-text/30 transition-colors"
              required
            />
          </div>

          <!-- Price Input -->
          <div>
            <label class="block text-sm font-semibold text-text mb-2"> Harga Satuan (Rp) </label>
            <div class="relative">
              <div
                class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-text/40 font-bold"
              >
                Rp
              </div>
              <input
                v-model.number="form.price"
                type="number"
                min="0"
                placeholder="0"
                class="w-full pl-10 pr-4 py-2 bg-secondary/10 border border-secondary/30 rounded-lg focus:outline-none focus:border-primary text-text placeholder-text/30 transition-colors"
              />
            </div>
          </div>

          <!-- Options -->
          <div class="flex items-center gap-4 pt-2">
            <label class="flex items-center gap-2 cursor-pointer group">
              <input
                v-model="form.is_package"
                type="checkbox"
                class="w-5 h-5 rounded border-secondary/30 text-primary focus:ring-primary bg-secondary/10"
              />
              <span class="text-sm text-text group-hover:text-primary transition-colors">
                Ini adalah Produk Paket (Bundling)
              </span>
            </label>
          </div>

          <!-- Actions -->
          <div class="pt-6 border-t border-secondary/20 flex justify-end gap-3">
            <button
              type="button"
              @click="router.back()"
              class="px-6 py-2 rounded-lg text-text/70 font-semibold hover:bg-secondary/20 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              :disabled="loading"
              class="px-6 py-2 rounded-lg bg-primary text-white font-bold hover:bg-primary-dark transition-colors shadow-lg shadow-primary/30 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <font-awesome-icon v-if="loading" icon="fa-solid fa-spinner" class="animate-spin" />
              <span>{{ loading ? 'Menyimpan...' : 'Simpan Produk' }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

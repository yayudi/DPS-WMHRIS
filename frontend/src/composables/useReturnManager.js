// frontend\src\composables\useReturnManager.js
import { ref, computed } from 'vue'
import api from '@/api/axios'
import { useToast } from '@/composables/useToast'

export function useReturnManager() {
  const { show } = useToast()

  const activeTab = ref('pending')
  const items = ref([])
  const isLoading = ref(false)
  const searchQuery = ref('')
  const locations = ref([])

  // State Modal Process (Enhanced)
  const showProcessModal = ref(false)
  const processForm = ref({
    itemData: null,
    // Kita pisahkan state untuk Good dan Bad
    good: {
      qty: 0,
      locationId: '',
    },
    bad: {
      qty: 0,
      locationId: '', // Default ke lokasi Z-BAD jika ada
    },
    notes: '',
  })

  // Fetch Data Lokasi
  const fetchLocations = async () => {
    try {
      const response = await api.get('/locations')
      locations.value = response.data.data
    } catch (err) {
      console.error(err)
    }
  }

  // Fetch Data Retur
  const fetchData = async () => {
    isLoading.value = true
    try {
      const endpoint = activeTab.value === 'pending' ? '/return/pending' : '/return/history'
      const response = await api.get(endpoint)
      items.value = response.data.data

      // Load locations jika belum ada
      if (locations.value.length === 0) {
        await fetchLocations()
      }
    } catch (error) {
      show('Gagal memuat data retur', 'error')
    } finally {
      isLoading.value = false
    }
  }

  // Filter Search
  const filteredItems = computed(() => {
    if (!searchQuery.value) return items.value
    const lower = searchQuery.value.toLowerCase()
    return items.value.filter(
      (item) =>
        (item.reference || '').toLowerCase().includes(lower) ||
        (item.original_invoice_id || '').toLowerCase().includes(lower) ||
        (item.product_name || '').toLowerCase().includes(lower) ||
        (item.sku || '').toLowerCase().includes(lower),
    )
  })

  // Buka Modal
  const openProcessModal = (item) => {
    processForm.value = {
      itemData: item,
      good: { qty: 0, locationId: '' },
      bad: { qty: 0, locationId: '' }, // Nanti bisa auto-select lokasi 'RETUR-RUSAK' disini jika mau
      notes: '',
    }
    showProcessModal.value = true
  }

  // Submit Logic (Smart Split)
  const submitProcess = async () => {
    const { itemData, good, bad, notes } = processForm.value
    const totalQtyInput = parseInt(good.qty || 0) + parseInt(bad.qty || 0)

    // 1. Validasi Total
    if (totalQtyInput === 0) {
      show('Mohon isi jumlah barang yang diterima (Bagus atau Rusak)', 'warning')
      return
    }
    if (totalQtyInput > itemData.quantity) {
      show(`Total jumlah (${totalQtyInput}) melebihi sisa retur (${itemData.quantity})`, 'error')
      return
    }

    // 2. Validasi Lokasi
    if (good.qty > 0 && !good.locationId) {
      show('Pilih lokasi rak untuk barang kondisi Bagus', 'warning')
      return
    }
    if (bad.qty > 0 && !bad.locationId) {
      show('Pilih lokasi rak untuk barang kondisi Rusak', 'warning')
      return
    }

    isLoading.value = true
    try {
      // Skenario A: Ada barang Bagus
      if (good.qty > 0) {
        await api.post('/return/approve', {
          itemId: itemData.id,
          qtyAccepted: good.qty,
          condition: 'GOOD',
          locationId: good.locationId,
          notes: notes,
        })
      }

      // Skenario B: Ada barang Rusak
      // Note: Jika skenario A jalan, backend otomatis mengurangi qty item utama.
      // Jadi request kedua aman dilakukan selama ID item sama.
      if (bad.qty > 0) {
        await api.post('/return/approve', {
          itemId: itemData.id,
          qtyAccepted: bad.qty,
          condition: 'BAD',
          locationId: bad.locationId,
          notes: notes ? `${notes} (Rusak)` : '',
        })
      }

      show('Retur berhasil divalidasi', 'success')
      showProcessModal.value = false
      fetchData() // Refresh list
    } catch (error) {
      console.error(error)
      show(error.response?.data?.message || 'Gagal memproses retur', 'error')
    } finally {
      isLoading.value = false
    }
  }

  return {
    activeTab,
    locations,
    isLoading,
    searchQuery,
    filteredItems,
    showProcessModal,
    processForm,
    fetchData,
    openProcessModal,
    submitProcess,
  }
}

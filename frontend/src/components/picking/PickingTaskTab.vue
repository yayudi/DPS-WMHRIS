<script setup>
import { swalConfirm, swalAlert } from '@/composables/useSweetAlert'
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { useToast } from '@/composables/useToast.js'
import { useAuthStore } from '@/stores/auth.js'
import { useTaskGrouping } from '@/composables/useTaskGrouping.js'
import { useFirebaseSync } from '@/composables/useFirebaseSync.js'
import {
  getPendingPickingItems,
  completePickingItems,
  forceFinishPickingItems,
  voidPickingList,
  retryBackorders,
  retryBackordersBatch
} from '@/api/helpers/picking.js'
import PickingFilterBar from '@/components/picking/PickingFilterBar.vue'
import PickingListCard from '@/components/picking/PickingListCard.vue'
import PickingListCardCompact from '@/components/picking/PickingListCardCompact.vue'
import PickingListRow from '@/components/picking/PickingListRow.vue'
import BasePagination from '@/components/ui/BasePagination.vue'
import { usePagination } from '@/composables/usePagination.js'
import MasonryWall from '@yeger/vue-masonry-wall'
import { useQuery } from '@tanstack/vue-query'
import catExplosionImg from '@/assets/img/cat-explosion.webp'
import hamoodImg from '@/assets/img/hamood.webp'

const props = defineProps({
  initialSearch: {
    type: String,
    default: ''
  }
})

const { toast } = useToast()
const authStore = useAuthStore()
// --- ACTIONS (API CALLS) ---
const {
  isLoading: isLoadingPicking,
  data: queryData,
  refetch: fetchPendingItems
} = useQuery({
  queryKey: ['pendingPickingItems'],
  queryFn: async () => {
    const response = await getPendingPickingItems()
    let data = []
    if (Array.isArray(response)) data = response
    else if (response?.data && Array.isArray(response.data)) data = response.data
    return data
  },
  refetchOnWindowFocus: false // Prevent unneeded re-fetches
})

const pendingItems = computed(() => queryData.value || [])

// Firebase Real-time Sync
useFirebaseSync('PICKING_LIST', 'REFRESH_PICKING', () => fetchPendingItems())

// --- STATE ---
const isVoiding = ref(false)
const selectedItems = ref(new Set())

watch(queryData, () => {
  selectedItems.value = new Set()
})

const selectionStats = computed(() => {
  const uniqueInvoices = new Set()
  let skuCount = 0

  selectedItems.value.forEach(itemId => {
    const item = itemsMap.value.get(itemId)
    if (item) {
      skuCount++
      uniqueInvoices.add(item.picking_list_id)
    }
  })

  return {
    invoices: uniqueInvoices.size,
    skus: skuCount,
    invoiceIds: Array.from(uniqueInvoices)
  }
})

const filterState = ref({
  search: props.initialSearch || '',
  source: { include: [], exclude: [] },
  stockStatus: { include: [], exclude: [] },
  shopName: { include: [], exclude: [] },
  locationPurpose: { include: [], exclude: [] },
  sortBy: 'newest',
  viewMode: 'grid', // Default GRID
  startDate: '',
  endDate: ''
})

watch(
  () => props.initialSearch,
  val => {
    if (val !== undefined) {
      filterState.value.search = val
    }
  }
)

// --- OPTIMIZATION: ITEMS MAP ---
const itemsMap = computed(() => {
  const map = new Map()
  pendingItems.value.forEach(item => {
    map.set(item.id, item)
  })
  return map
})

// --- COMPUTED: SHOP OPTIONS ---
const shopOptions = computed(() => {
  const shops = new Set()
  if (pendingItems.value) {
    pendingItems.value.forEach(item => {
      if (item.shop_name) {
        shops.add(item.shop_name)
      }
    })
  }

  const options = []
  Array.from(shops)
    .sort()
    .forEach(shop => {
      options.push({ id: shop, label: shop })
    })

  return options
})

// --- LOGIC: GROUPING ---
const { groupedTasks } = useTaskGrouping(pendingItems, filterState)

// --- PAGINATION LOGIC ---
const {
  paginatedData: displayedItems,
  meta: paginationState,
  changePage: handlePageChange,
  changePageSize: handleLimitChange
} = usePagination({
  totalItems: groupedTasks,
  storageKey: 'pickingTaskPageSize',
  initialLimit: 15
})

watch(
  filterState,
  () => {
    handlePageChange(1)
  },
  { deep: true }
)

// --- LOGIC: STOCK VALIDATION ---
const stockUsage = computed(() => {
  const usage = {}
  selectedItems.value.forEach(id => {
    const item = itemsMap.value.get(id)
    if (item && item.location_code) {
      const key = `${item.sku}_${item.location_code}`
      usage[key] = (usage[key] || 0) + Number(item.quantity)
    }
  })
  return usage
})

// Logika Validasi Seleksi Item
async function canSelectItem(item) {
  if (!item) return false

  // Debugging log
  const debugTag = `[Validasi Item #${item.id} ${item.sku}]`

  if (item.status === 'BACKORDER' || !item.location_code) {
    return true
  }

  // Cek stok sekadar untuk warning log (tidak memblokir)
  const key = `${item.sku}_${item.location_code}`
  const currentUsage = stockUsage.value[key] || 0

  const available = Number(item.available_stock || 0)
  const qtyNeeded = Number(item.quantity || 0)

  if (currentUsage + qtyNeeded > available && !selectedItems.value.has(item.id)) {
    if (import.meta.env.DEV) {
      console.warn(
        `${debugTag} GAGAL: Stok Tidak Cukup di ${item.location_code}. Butuh: ${qtyNeeded}, Sisa Hitungan: ${
          available - currentUsage
        }. Item tetap diizinkan agar Backend bisa Re-route.`
      )
    }
  }

  return true
}

const isSubmitting = ref(false)

async function handleCompleteSelectedItems() {
  if (selectedItems.value.size === 0) return
  if (selectedItems.value.size > 2000) {
    toast('Maksimal memproses 2000 item sekaligus untuk mencegah server timeout.', 'warning')
    return
  }

  isSubmitting.value = true
  const idsToComplete = Array.from(selectedItems.value)

  try {
    const payloadItems = idsToComplete
      .map(id => {
        const originalItem = itemsMap.value.get(id)
        if (!originalItem) return null
        return {
          id: originalItem.id,
          picking_list_id: originalItem.picking_list_id,
          product_id: originalItem.product_id,
          quantity: originalItem.quantity,
          location_id: originalItem.suggested_location_id
        }
      })
      .filter(i => i !== null)

    const res = await completePickingItems({ items: payloadItems })

    if (res.success) {
      toast(res.message, 'success')
      pendingItems.value = pendingItems.value.filter(item => !selectedItems.value.has(item.id))
      selectedItems.value = new Set() // Reset dengan Set baru
    } else {
      toast(res.message || 'Gagal memproses sebagian item.', 'warning')
    }
    // Refresh data untuk konsistensi penuh
    await fetchPendingItems()
  } catch (error) {
    console.error(error) // Auto-added to prevent unused var
    const errData = error.response?.data || error
    const details = errData.errors || []

    if (details.length > 0) {
      const maxErrors = Math.min(details.length, 10)
      const visibleErrors = details
        .slice(0, maxErrors)
        .map(d => `<li>${d}</li>`)
        .join('')
      const moreStr =
        details.length > maxErrors
          ? `<li class="font-bold pt-2 list-none">...dan ${details.length - maxErrors} error lainnya.</li>`
          : ''
      const htmlContent = `<ul class="text-left text-sm space-y-1 text-danger list-disc list-inside">${visibleErrors}${moreStr}</ul>`

      await swalAlert(errData.message || 'Gagal Memproses Pesanan', htmlContent, 'error', true)
    } else {
      toast(errData.message || 'Terjadi kesalahan sistem.', 'error')
    }
  } finally {
    isSubmitting.value = false
  }
}

const isForceFinishing = ref(false)

// --- UNIFIED POWER BUTTON: HOLD-TO-MORPH (FORCE FINISH) ---
const HOLD_TRIGGER_MS = 2000
const CHARGE_DELAY_MS = 200 // Threshold agar klik cepat normal tidak memicu visual charge

const isForceFinishMode = ref(false)
const isCharging = ref(false)
const holdProgress = ref(0) // 0 - 100
const forceFinishCountdown = ref(6)
const showLightningEffect = ref(false)
const boltContainerRef = ref(null)

// --- MEME OVERLAY (CAT EXPLOSION & HAMOOD) ---
const catChargingSrc = ref(catExplosionImg)
const hamoodAnimatedSrc = ref(hamoodImg)

const showCatMeme = computed(() => {
  return isCharging.value || isForceFinishMode.value || isForceFinishing.value
})

let holdPressStartTime = 0
let holdStartTimeout = null
let holdRaf = null
let countdownTimer = null
let lightningTimer = null
let stormTimeout = null
let wasChargeInterrupted = false
let ignoreNextClick = false

// --- ANIME LIGHTNING SHARDS (REFERENSI GEMINI-CODE) ---
function randomBetween(min, max) {
  return Math.random() * (max - min) + min
}

function spawnLightning(customScale = null) {
  const container = boltContainerRef.value || document.getElementById('bolt-container')
  const template = document.getElementById('light-template')
  if (!container || !template) return

  const boltGroup = template.cloneNode(true)
  boltGroup.removeAttribute('id')

  const x = randomBetween(20, 180)
  const y = randomBetween(20, 180)
  const scale = customScale || randomBetween(0.18, 0.45)
  const rotate = randomBetween(-180, 180)

  boltGroup.setAttribute('transform', `translate(${x},${y}) scale(${scale}) rotate(${rotate})`)

  const shards = boltGroup.querySelectorAll('.shard')
  shards.forEach((shard, index) => {
    const delay = index * 0.035 + randomBetween(0, 0.03)
    const duration = randomBetween(0.18, 0.3)
    const jitterX = randomBetween(-6, 6) + 'px'
    const jitterY = randomBetween(-6, 6) + 'px'

    shard.style.animationDelay = `${delay}s`
    shard.style.animationDuration = `${duration}s`
    shard.style.setProperty('--jx', jitterX)
    shard.style.setProperty('--jy', jitterY)
  })

  container.appendChild(boltGroup)

  setTimeout(() => {
    boltGroup.remove()
  }, 500)
}

function startAnimeStorm() {
  stopAnimeStorm()

  function stormTick() {
    if (!isCharging.value && !showLightningEffect.value) return

    const burstCount = Math.floor(randomBetween(1, 3))
    for (let i = 0; i < burstCount; i++) {
      setTimeout(
        () => {
          if (showLightningEffect.value) spawnLightning()
        },
        randomBetween(0, 90)
      )
    }

    const nextInterval = randomBetween(120, 280)
    stormTimeout = setTimeout(stormTick, nextInterval)
  }

  stormTick()
}

function stopAnimeStorm() {
  clearTimeout(stormTimeout)
  const container = boltContainerRef.value || document.getElementById('bolt-container')
  if (container) {
    container.innerHTML = ''
  }
}

function triggerLightningStrike() {
  clearTimeout(lightningTimer)
  showLightningEffect.value = true

  nextTick(() => {
    // 3-4 sambaran saat mencapai 100% full
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        if (showLightningEffect.value) {
          spawnLightning(randomBetween(0.35, 0.55))
        }
      }, i * 60)
    }
  })

  if (navigator?.vibrate) {
    try {
      navigator.vibrate([40, 30, 80, 50, 150])
    } catch (err) {
      // Abaikan error pada browser yang tidak mendukung Web Vibration API
      void err
    }
  }
  lightningTimer = setTimeout(() => {
    showLightningEffect.value = false
    stopAnimeStorm()
  }, 750)
}

function handlePointerDown(e) {
  if (isSubmitting.value || isForceFinishing.value) return
  if (selectedItems.value.size === 0) return
  if (isForceFinishMode.value) return
  if (!authStore.hasPermission('force-finish-picking')) return

  // Hanya respons tombol utama mouse / touch primer
  if (e.button && e.button !== 0) return

  holdPressStartTime = Date.now()
  wasChargeInterrupted = false
  ignoreNextClick = false
  holdProgress.value = 0
  isCharging.value = false

  clearTimeout(holdStartTimeout)
  cancelAnimationFrame(holdRaf)

  holdStartTimeout = setTimeout(() => {
    isCharging.value = true
    showLightningEffect.value = true
    catChargingSrc.value = `${catExplosionImg}?t=${Date.now()}`
    nextTick(() => {
      startAnimeStorm()
    })
    animatePowerCharge()
  }, CHARGE_DELAY_MS)
}

function animatePowerCharge() {
  const elapsed = Date.now() - holdPressStartTime
  const chargeDuration = HOLD_TRIGGER_MS - CHARGE_DELAY_MS
  const progress = Math.min(((elapsed - CHARGE_DELAY_MS) / chargeDuration) * 100, 100)
  holdProgress.value = Math.max(0, progress)

  if (progress >= 100) {
    triggerForceFinishMode()
    return
  }

  holdRaf = requestAnimationFrame(animatePowerCharge)
}

function handlePointerUp() {
  clearTimeout(holdStartTimeout)
  cancelAnimationFrame(holdRaf)

  if (isCharging.value) {
    // Dilepas sebelum 100%: batalkan charge dan matikan efek petir seketika
    wasChargeInterrupted = true
    isCharging.value = false
    showLightningEffect.value = false
    stopAnimeStorm()
    clearTimeout(lightningTimer)
    holdProgress.value = 0
    setTimeout(() => {
      wasChargeInterrupted = false
    }, 150)
  }
}

function handlePointerLeave() {
  handlePointerUp()
}

function triggerForceFinishMode() {
  isCharging.value = false
  holdProgress.value = 0
  isForceFinishMode.value = true
  forceFinishCountdown.value = 6
  // KUNCI PENGAMAN: Abaikan event click bawaan browser yang dipicu saat jari/mouse dilepas
  ignoreNextClick = true

  // Sambaran listrik menggelegar seketika saat tombol selesai charged up (100%)!
  triggerLightningStrike()

  toast('MODE FORCE FINISH TERBUKA! Klik untuk mengeksekusi.', 'warning')

  clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    forceFinishCountdown.value--
    if (forceFinishCountdown.value <= 0) {
      cancelForceFinishMode()
    }
  }, 1000)
}

function cancelForceFinishMode() {
  isForceFinishMode.value = false
  holdProgress.value = 0
  isCharging.value = false
  showLightningEffect.value = false
  stopAnimeStorm()
  clearTimeout(lightningTimer)
  ignoreNextClick = false
  clearInterval(countdownTimer)
}

function handleMainButtonClick() {
  if (isSubmitting.value || isForceFinishing.value) return
  if (selectedItems.value.size === 0) return

  // 1. Abaikan jika klik ini berasal dari pelepasan tombol (release) setelah proses tahan 2 detik
  if (ignoreNextClick) {
    ignoreNextClick = false
    return
  }

  // 2. Abaikan klik jika baru saja membatalkan tahanan/charge (<2 detik)
  if (wasChargeInterrupted) {
    wasChargeInterrupted = false
    return
  }

  if (isForceFinishMode.value) {
    // Mode Force Finish aktif -> Eksekusi langsung tanpa swal confirm!
    executeForceFinish()
  } else {
    // Klik Normal -> Selesaikan Biasa
    handleCompleteSelectedItems()
  }
}

onBeforeUnmount(() => {
  cancelAnimationFrame(holdRaf)
  clearTimeout(holdStartTimeout)
  clearTimeout(lightningTimer)
  clearInterval(countdownTimer)
  stopAnimeStorm()
})

async function executeForceFinish() {
  if (selectedItems.value.size === 0) return
  if (selectedItems.value.size > 2000) {
    toast('Maksimal memproses 2000 item sekaligus untuk mencegah server timeout.', 'warning')
    return
  }

  // Play animasi Hamood WebP dengan cache-buster timestamp
  hamoodAnimatedSrc.value = `${hamoodImg}?t=${Date.now()}`
  isForceFinishing.value = true

  // Reset mode countdown
  cancelForceFinishMode()

  const idsToComplete = Array.from(selectedItems.value)
  const startTime = Date.now()

  try {
    const payloadItems = idsToComplete
      .map(id => {
        const originalItem = itemsMap.value.get(id)
        if (!originalItem) return null
        return {
          id: originalItem.id,
          picking_list_id: originalItem.picking_list_id,
          product_id: originalItem.product_id,
          quantity: originalItem.quantity,
          location_id: originalItem.suggested_location_id
        }
      })
      .filter(i => i !== null)

    const res = await forceFinishPickingItems({ items: payloadItems })

    if (res.success) {
      toast(res.message, 'success')
      pendingItems.value = pendingItems.value.filter(item => !selectedItems.value.has(item.id))
      selectedItems.value = new Set()
    } else {
      toast(res.message || 'Gagal memproses Force Finish sebagian item.', 'warning')
    }
    await fetchPendingItems()
  } catch (error) {
    console.error(error)
    const errData = error.response?.data || error
    const details = errData.details || errData.errors || []

    if (details.length > 0) {
      const maxErrors = Math.min(details.length, 10)
      const visibleErrors = details
        .slice(0, maxErrors)
        .map(d => `<li>${d}</li>`)
        .join('')
      const moreStr =
        details.length > maxErrors
          ? `<li class="font-bold pt-2 list-none">...dan ${details.length - maxErrors} error lainnya.</li>`
          : ''
      const htmlContent = `<ul class="text-left text-sm space-y-1 text-danger list-disc list-inside">${visibleErrors}${moreStr}</ul>`

      await swalAlert(errData.message || 'Gagal Force Finish Pesanan', htmlContent, 'error', true)
    } else {
      toast(errData.message || 'Terjadi kesalahan sistem.', 'error')
    }
  } finally {
    // Pastikan animasi Hamood minimal terputar 2.5 detik sebelum overlay ditutup
    const elapsed = Date.now() - startTime
    const remaining = Math.max(0, 2500 - elapsed)
    setTimeout(() => {
      isForceFinishing.value = false
    }, remaining)
  }
}

async function handleVoidSelectedItems() {
  if (selectedItems.value.size === 0) return
  if (selectedItems.value.size > 2000) {
    toast('Maksimal memproses 2000 item sekaligus untuk mencegah server timeout.', 'warning')
    return
  }

  // Dapatkan daftar picking_list_id unik dari item yang terpilih
  const uniqueInvoices = new Set()
  selectedItems.value.forEach(itemId => {
    const item = itemsMap.value.get(itemId)
    if (item) {
      uniqueInvoices.add(item.picking_list_id)
    }
  })

  if (!(await swalConfirm(`Void ${uniqueInvoices.size} pesanan ini? Stok akan dikembalikan.`))) return

  isVoiding.value = true
  let successCount = 0
  let failCount = 0

  try {
    // Batalkan setiap list ID satu per satu
    for (const listId of uniqueInvoices) {
      try {
        await voidPickingList(listId)
        successCount++
      } catch (err) {
        console.error(`Gagal void list ${listId}:`, err)
        failCount++
      }
    }

    if (successCount > 0) {
      toast(`Berhasil void ${successCount} pesanan.`, 'success')
      selectedItems.value = new Set() // Reset setelah berhasil
    }
    if (failCount > 0) {
      toast(`Gagal void ${failCount} pesanan.`, 'warning')
    }

    await fetchPendingItems()
  } finally {
    isVoiding.value = false
  }
}

async function handleVoidInvoice(pickingListId) {
  try {
    const res = await voidPickingList(pickingListId)
    toast(res.message || 'Picking List berhasil divoid', 'success')
    // Optimistic Update
    const newData = queryData.value.filter(i => i.picking_list_id !== pickingListId)
    queryData.value = newData
  } catch (err) {
    toast(err.message || 'Gagal mem-void Picking List', 'error')
  }
}

async function handleRetryBackorder(pickingListId) {
  try {
    const res = await retryBackorders(pickingListId)
    toast(res.message || 'Stok berhasil dicek ulang', 'success')
    fetchPendingItems()
  } catch (err) {
    toast(err.message || 'Gagal mengecek stok', 'error')
  }
}

const isRetryingBatch = ref(false)
async function handleRetryBatch() {
  if (selectionStats.value.invoiceIds.length === 0) return
  if (selectedItems.value.size > 2000) {
    toast('Maksimal memproses 2000 item sekaligus untuk mencegah server timeout.', 'warning')
    return
  }
  isRetryingBatch.value = true
  try {
    const res = await retryBackordersBatch(selectionStats.value.invoiceIds)
    toast(res.message || 'Pengecekan ulang stok batch selesai', 'success')
    fetchPendingItems()
  } catch (err) {
    toast(err.message || 'Gagal mengecek ulang stok batch', 'error')
  } finally {
    isRetryingBatch.value = false
  }
}

// --- COMPLETE ITEMS LOGIC ---
function handleToggleInvoice({ inv, checked }) {
  console.log(`[Toggle Invoice] Invoice ID: ${inv.id}, Checked: ${checked}`)
  const allItemIds = []
  if (inv.locations) {
    Object.values(inv.locations).forEach(items => items.forEach(item => allItemIds.push(item)))
  } else if (inv.items) {
    inv.items.forEach(item => allItemIds.push(item))
  }

  const newSet = new Set(selectedItems.value)

  allItemIds.forEach(item => {
    if (checked) {
      if (canSelectItem(item)) {
        newSet.add(item.id)
      } else {
        toast(`Item ${item.sku} ditolak oleh validasi.`, 'warning')
      }
    } else {
      newSet.delete(item.id)
    }
  })

  // Re-assign untuk trigger update UI
  selectedItems.value = newSet
  console.log('Selected Items Count:', selectedItems.value.size)
}

function handleSelectAll() {
  const newSet = new Set(selectedItems.value)

  displayedItems.value.forEach(inv => {
    const allItemIds = []
    if (inv.locations) {
      Object.values(inv.locations).forEach(items => items.forEach(item => allItemIds.push(item)))
    } else if (inv.items) {
      inv.items.forEach(item => allItemIds.push(item))
    }

    allItemIds.forEach(item => {
      // Cek validasi sebelum add
      if (canSelectItem(item)) newSet.add(item.id)
    })
  })

  selectedItems.value = newSet
  console.log('Select All - Total:', selectedItems.value.size)
}

function handleUncheckAll() {
  selectedItems.value = new Set()
}

/**
 * Set nilai filter pencarian secara programatis
 * @param {string} query
 */
function setSearchFilter(query) {
  filterState.value.search = query || ''
}

defineExpose({
  fetchPendingItems,
  pendingCount: computed(() => {
    const uniqueInvoices = new Set(pendingItems.value.map(i => i.picking_list_id))
    return uniqueInvoices.size
  }),
  setSearchFilter
})
</script>

<template>
  <div class="relative min-h-[500px]">
    <!-- EFEK LISTRIK & PETIR LAYAR (ANIME SHARDS BERGAYA GEMINI-CODE) -->
    <Teleport to="body">
      <transition name="lightning-fade">
        <div
          v-if="showLightningEffect"
          class="lightning-overlay fixed inset-0 pointer-events-none z-[99999] overflow-hidden"
        >
          <!-- Ambient Glow (Halus, Tidak Menutupi Layar) -->
          <div
            class="lightning-flash absolute inset-0 pointer-events-none"
            :style="{ opacity: isCharging ? (0.1 + (holdProgress / 100) * 0.25).toFixed(2) : '0.35' }"
          ></div>

          <!-- Kanvas SVG Utama -->
          <svg
            class="anime-canvas absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 200 200"
            preserveAspectRatio="xMidYMid slice"
          >
            <g ref="boltContainerRef" id="bolt-container"></g>
          </svg>
        </div>
      </transition>

      <!-- Definisi Template Path Petir (4 Pecahan Shards) -->
      <svg class="defs-only" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <defs>
          <g id="light-template">
            <!-- Bagian 1: Pangkal Atas -->
            <path
              class="shard"
              d="M 0,0 c 6.24,-8.94 10.61,-23.78 17.97,-53.81 l 29.8,-5.56 18.18,21.55 -30.3,9.57 C 17.66,-46.88 17.9,-38.93 16.46,-31.59 7.77,-6.22 6.56,-8.3 0,0 Z"
            />
            <!-- Bagian 2: Batang Tengah & Cabang Atas -->
            <path
              class="shard"
              d="M 47.77,-59.36 l 35.36,41.92 c -0.8,5.1 10.2,13.2 23.5,20.1 L 65.96,-14.92 C 61.12,-22.0 48.28,-50.54 47.89,-37.94 46.11,-46.51 39.23,-49.01 35.65,-48.25 Z"
            />
            <!-- Bagian 3: Patahan Tengah & Duri Bawah -->
            <path
              class="shard"
              d="M 65.96,-14.92 L 83.13,-17.44 c -1.95,12.46 45.9,34.81 61.62,34.35 l -22.28,5.31 C 118.45,16.48 87.41,-0.96 83.63,0.74 c -9.24,4.07 -3.53,14.96 -1.52,18.6 -4.32,4.66 -7.9,8.07 -8.44,13.67 0.09,-12.35 1.52,-42.46 -5.49,-26.15 Z"
            />
            <!-- Bagian 4: Ujung Runcing Petir -->
            <path
              class="shard"
              d="M 122.47,22.22 L 144.75,16.91 c -17.64,5.5 -9.57,24.92 2.53,36.87 C 139.11,46.26 131.45,39.06 122.47,22.22 Z"
            />
          </g>
        </defs>
      </svg>
    </Teleport>

    <!-- EFEK KUCING MELEDAK (MEME OVERRIDE FORCE FINISH) -->
    <Teleport to="body">
      <transition name="cat-pop">
        <div
          v-if="showCatMeme"
          class="cat-meme-overlay fixed inset-0 pointer-events-none z-[99998] flex items-center justify-center"
        >
          <div class="relative flex flex-col items-center justify-center">
            <!-- Badge Status di Atas Kucing -->
            <div
              v-if="isCharging"
              class="mb-3 px-3.5 py-1 rounded-full bg-slate-900/90 backdrop-blur-md text-amber-400 text-xs font-black tracking-widest uppercase border border-amber-500/40 shadow-xl animate-pulse"
            >
              OVERRIDE CHARGE {{ Math.round(holdProgress) }}%
            </div>
            <div
              v-else-if="isForceFinishMode && !isForceFinishing"
              class="mb-3 px-4 py-1.5 rounded-full bg-red-950/90 backdrop-blur-md text-red-400 text-xs font-black tracking-widest uppercase border border-red-500/50 shadow-xl animate-bounce"
            >
              READY TO DETONATE ({{ forceFinishCountdown }}s)
            </div>
            <div
              v-else-if="isForceFinishing"
              class="mb-3 px-4 py-1.5 rounded-full bg-red-600 text-white text-xs font-black tracking-widest uppercase shadow-2xl animate-ping"
            >
              DETONATING!
            </div>

            <!-- Frame Meme: isCharging / isForceFinishMode -> cat-explosion.webp | isForceFinishing -> hamood.webp -->
            <div class="relative w-48 h-48 sm:w-60 sm:h-60 flex items-center justify-center">
              <img
                v-if="!isForceFinishing"
                :src="catChargingSrc"
                alt="Cat Explosion"
                class="object-contain w-full h-full filter drop-shadow-[0_10px_25px_rgba(0,0,0,0.6)]"
              />
              <img
                v-else
                :src="hamoodAnimatedSrc"
                alt="Hamood Habibi"
                class="object-contain w-full h-full filter drop-shadow-[0_10px_35px_rgba(239,68,68,0.7)]"
              />
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <!-- FLOATING ACTION BAR -->
    <Teleport to="body">
      <transition name="slide-up">
        <div
          v-if="pendingItems.length > 0"
          class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[98%] md:w-[85%] max-w-5xl bg-secondary/95 border border-secondary/20 backdrop-blur-xl p-3 rounded-2xl flex flex-col gap-3 ring-1 ring-black/5"
        >
          <!-- ROW 1: PAGINATION -->
          <BasePagination
            v-if="paginationState.totalPages > 1 || groupedTasks.length > 15"
            :pagination="paginationState"
            :limit-options="[15, 30, 60, 90]"
            class="!bg-background/40 rounded-xl w-full border border-secondary/10"
            @changePage="handlePageChange"
            @update:limit="handleLimitChange"
          />

          <!-- ROW 2: ACTIONS -->
          <div
            class="flex flex-col md:flex-row items-center justify-between gap-3 md:overflow-visible overflow-x-auto no-scrollbar w-full py-1.5"
          >
            <!-- Kontrol Seleksi -->
            <div class="flex items-center justify-between md:justify-start w-full md:w-auto gap-2 shrink-0">
              <button
                @click="handleSelectAll"
                class="px-3 py-2 bg-secondary/50 hover:bg-primary/20 text-primary rounded-lg text-xs font-bold transition-colors border border-primary/20 hover:border-primary/50 flex items-center gap-1.5 active:scale-95 flex-1 justify-center md:flex-none"
                title="Pilih Semua Item Tampil"
              >
                <font-awesome-icon icon="fa-solid fa-check-double" />
                <span class="hidden sm:inline">Pilih Semua</span>
              </button>

              <button
                @click="handleUncheckAll"
                :disabled="selectedItems.size === 0"
                class="px-3 py-2 bg-secondary/50 hover:bg-danger/20 text-text/60 hover:text-danger rounded-lg text-xs font-bold transition-colors border border-secondary/30 hover:border-danger/50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5 active:scale-95 flex-1 justify-center md:flex-none"
                title="Reset Pilihan"
              >
                <font-awesome-icon icon="fa-solid fa-xmark" />
                <span class="hidden sm:inline">Reset</span>
              </button>
            </div>

            <!--Info (Jika ada yang dipilih) -->
            <div v-if="selectedItems.size > 0" class="flex items-center justify-center gap-3 px-2 w-full md:w-auto">
              <div class="flex flex-col items-center leading-none min-w-[50px]">
                <span class="font-black text-lg text-text">{{ selectionStats.invoices }}</span>
                <span class="text-[9px] font-bold text-text/50 uppercase tracking-wider">Invoices</span>
              </div>
              <div class="w-px h-6 bg-secondary/20 rounded-full hidden sm:block"></div>
              <div class="flex flex-col items-center leading-none min-w-[50px]">
                <span class="font-black text-lg text-text">{{ selectionStats.skus }}</span>
                <span class="text-[9px] font-bold text-text/50 uppercase tracking-wider">SKU</span>
              </div>
            </div>
            <div v-else class="text-xs text-text/30 italic px-1 text-center w-full md:w-auto md:text-left">
              Belum ada pesanan dipilih
            </div>

            <!-- Tombol Eksekusi -->
            <div class="flex items-center gap-2 w-full md:w-auto shrink-0 mt-2 md:mt-0">
              <!-- Tombol Cek Stok Batch -->
              <button
                @click="handleRetryBatch"
                class="flex-1 sm:flex-none flex items-center justify-center gap-2 text-warning hover:bg-warning hover:text-background border-warning border px-4 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="isVoiding || isLoadingPicking || isRetryingBatch || selectedItems.size === 0"
                title="Cek Ulang Stok untuk Pesanan Terpilih"
              >
                <font-awesome-icon
                  :icon="isRetryingBatch ? 'fa-solid fa-spinner' : 'fa-solid fa-rotate-right'"
                  :class="{ 'animate-spin': isRetryingBatch }"
                />
                <span class="hidden sm:inline">Cek Stok</span>
              </button>

              <button
                v-if="authStore.hasPermission('void-picking-list')"
                @click="handleVoidSelectedItems"
                class="flex-1 sm:flex-none group relative overflow-hidden bg-danger/10 hover:bg-danger text-danger hover:text-background border border-danger px-4 sm:pl-6 sm:pr-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                :disabled="
                  isVoiding || isForceFinishing || isLoadingPicking || isRetryingBatch || selectedItems.size === 0
                "
              >
                <span class="w-4 flex justify-center">
                  <font-awesome-icon
                    :icon="isVoiding ? 'fa-solid fa-spinner' : 'fa-solid fa-ban'"
                    :class="{ 'animate-spin': isVoiding }"
                  />
                </span>
                <span>{{ isVoiding ? 'Memproses...' : 'Void Batch' }}</span>
              </button>

              <div class="relative flex-1 sm:flex-none">
                <button
                  @pointerdown="handlePointerDown"
                  @pointerup="handlePointerUp"
                  @pointerleave="handlePointerLeave"
                  @pointercancel="handlePointerLeave"
                  @contextmenu.prevent
                  @click="handleMainButtonClick"
                  class="power-action-btn w-full sm:w-[195px] group relative overflow-hidden"
                  :class="{
                    'power-mode-normal': !isForceFinishMode && !isCharging,
                    'power-mode-charging': isCharging,
                    'power-mode-force': isForceFinishMode,
                    'cursor-wait': isSubmitting || isForceFinishing
                  }"
                  :disabled="
                    isLoadingPicking ||
                    isSubmitting ||
                    isForceFinishing ||
                    isVoiding ||
                    isRetryingBatch ||
                    selectedItems.size === 0
                  "
                >
                  <!-- Charging Progress Bar (Mengisi saat ditahan) -->
                  <div v-if="isCharging" class="power-charge-bar" :style="{ width: holdProgress + '%' }"></div>

                  <!-- Pulse Ring saat Mode Force Finish Aktif -->
                  <div v-if="isForceFinishMode" class="force-finish-pulse-ring"></div>

                  <!-- Konten Tombol -->
                  <span class="relative z-10 flex items-center justify-center gap-2">
                    <!-- Spinner saat processing -->
                    <font-awesome-icon
                      v-if="isSubmitting || isForceFinishing"
                      icon="fa-solid fa-spinner"
                      class="animate-spin text-sm"
                    />

                    <!-- Icon saat Force Finish Mode -->
                    <font-awesome-icon
                      v-else-if="isForceFinishMode"
                      icon="fa-solid fa-bolt"
                      class="text-amber-300 animate-bounce text-xs"
                    />

                    <!-- Icon saat Charging -->
                    <font-awesome-icon
                      v-else-if="isCharging"
                      icon="fa-solid fa-bolt"
                      class="text-amber-400 animate-pulse text-sm"
                    />

                    <!-- Icon default normal -->
                    <font-awesome-icon
                      v-else
                      icon="fa-solid fa-arrow-right"
                      class="group-hover:translate-x-1 transition-transform text-sm"
                    />

                    <!-- Label Text -->
                    <span class="whitespace-nowrap font-bold">
                      <template v-if="isSubmitting">Menyelesaikan...</template>
                      <template v-else-if="isForceFinishing">Force Finishing...</template>
                      <template v-else-if="isCharging">OVERRIDE {{ Math.round(holdProgress) }}%</template>
                      <template v-else-if="isForceFinishMode">FORCE FINISH ({{ forceFinishCountdown }}s)</template>
                      <template v-else>Selesaikan</template>
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </transition>
    </Teleport>

    <div class="space-y-6 animate-fade-in pb-32">
      <!--TOP CONTROLS-->
      <div class="bg-secondary/50 p-4 rounded-xl border border-dashed border-secondary/20">
        <PickingFilterBar v-model="filterState" :shop-options="shopOptions" class="w-full" />
      </div>

      <!-- Loading & Empty States -->
      <div v-if="isLoadingPicking && pendingItems.length === 0" class="py-32 text-center opacity-60">
        <font-awesome-icon icon="fa-solid fa-cubes-stacked" class="text-6xl mb-4 animate-bounce text-secondary" />
        <p>Memuat daftar tugas...</p>
      </div>

      <div
        v-else-if="groupedTasks.length === 0"
        class="py-24 text-center border-2 border-dashed border-secondary/30 rounded-2xl bg-secondary/5"
      >
        <font-awesome-icon icon="fa-solid fa-clipboard-check" class="text-5xl text-primary/50 mb-4" />
        <h3 class="text-xl font-bold">Semua Beres!</h3>
        <p class="text-text/50 mt-1">Tidak ada item yang perlu dipicking saat ini.</p>
      </div>

      <!-- Main Content -->
      <div v-else class="pb-16">
        <MasonryWall
          v-if="filterState.viewMode === 'grid' || filterState.viewMode === 'compact'"
          :items="displayedItems"
          :ssr-columns="1"
          :column-width="320"
          :gap="16"
        >
          <template #default="{ item: inv }">
            <component
              :is="filterState.viewMode === 'compact' ? PickingListCardCompact : PickingListCard"
              :inv="inv"
              :selectedItems="selectedItems"
              :validate-stock="canSelectItem"
              @toggle-invoice="handleToggleInvoice"
              @void-invoice="handleVoidInvoice"
              @retry-backorder="handleRetryBackorder"
              @items-updated="fetchPendingItems"
              mode="picking"
            />
          </template>
        </MasonryWall>

        <!-- Tampilan LIST (Stack) -->
        <div v-else class="flex flex-col border border-secondary/10 rounded-xl overflow-hidden shadow-sm bg-background">
          <PickingListRow
            v-for="inv in displayedItems"
            :key="inv.id"
            :inv="inv"
            :selectedItems="selectedItems"
            :validate-stock="canSelectItem"
            @toggle-invoice="handleToggleInvoice"
            @void-invoice="handleVoidInvoice"
            @retry-backorder="handleRetryBackorder"
            @items-updated="fetchPendingItems"
            mode="picking"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

/* Animasi Slide Up untuk Floating Bar */
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translate(-50%, 40px) scale(0.95);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ===== UNIFIED POWER BUTTON (SELESAIKAN & FORCE FINISH) ===== */
.power-action-btn {
  width: 195px;
  height: 42px;
  padding: 0 0.75rem;
  border-radius: 0.75rem;
  font-size: 0.8125rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.3s ease,
    border-color 0.3s ease,
    box-shadow 0.3s ease;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  border: 1.5px solid transparent;
  flex-shrink: 0;
  white-space: nowrap;
}

/* Sembunyikan scrollbar bawaan browser pada floating bar */
.no-scrollbar::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Mode 1: Normal Selesaikan */
.power-mode-normal {
  background-color: hsl(var(--color-primary));
  color: hsl(var(--color-background));
  box-shadow: 0 4px 12px -2px hsl(var(--color-primary) / 0.35);
}
.power-mode-normal:hover:not(:disabled) {
  background-color: hsl(var(--color-primary) / 0.9);
  box-shadow: 0 6px 16px -2px hsl(var(--color-primary) / 0.45);
}
.power-mode-normal:active:not(:disabled) {
  transform: scale(0.97);
}

/* Mode 2: Charging (Sedang Ditahan) */
.power-mode-charging {
  background: #18120c;
  color: #fbbf24;
  border: 1.5px solid rgba(245, 158, 11, 0.6);
  box-shadow: 0 0 25px rgba(245, 158, 11, 0.35);
  animation: power-shake 0.1s ease-in-out infinite;
}

.power-charge-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(
    90deg,
    rgba(245, 158, 11, 0.3) 0%,
    rgba(239, 68, 68, 0.7) 70%,
    rgba(220, 38, 38, 0.95) 100%
  );
  border-radius: inherit;
  transition: width 0.04s linear;
  pointer-events: none;
  z-index: 1;
}

/* Mode 3: Morphed into Force Finish */
.power-mode-force {
  background: linear-gradient(135deg, #b91c1c 0%, #ea580c 50%, #991b1b 100%);
  color: #ffffff;
  border: 1.5px solid rgba(254, 202, 202, 0.5);
  box-shadow:
    0 0 25px rgba(220, 38, 38, 0.55),
    0 6px 20px rgba(185, 28, 28, 0.4);
  animation: power-force-glow 1.2s ease-in-out infinite;
}
.power-mode-force:hover:not(:disabled) {
  filter: brightness(1.1);
  box-shadow:
    0 0 35px rgba(220, 38, 38, 0.75),
    0 8px 25px rgba(185, 28, 28, 0.5);
}
.power-mode-force:active:not(:disabled) {
  transform: scale(0.97);
}

.power-action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  background-color: hsl(var(--color-secondary));
  color: hsl(var(--color-text) / 0.4);
  box-shadow: none;
  border-color: transparent;
}

/* Pulse Ring saat Mode Force Finish Aktif */
.force-finish-pulse-ring {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  border: 2px solid rgba(254, 202, 202, 0.7);
  animation: force-finish-ring-pulse 1.1s ease-out infinite;
  pointer-events: none;
}

@keyframes power-shake {
  0%,
  100% {
    transform: translateX(0) scale(0.98);
  }
  25% {
    transform: translateX(-1.5px) scale(0.98);
  }
  75% {
    transform: translateX(1.5px) scale(0.98);
  }
}

@keyframes power-force-glow {
  0%,
  100% {
    box-shadow:
      0 0 20px rgba(220, 38, 38, 0.5),
      0 4px 15px rgba(185, 28, 28, 0.35);
  }
  50% {
    box-shadow:
      0 0 35px rgba(239, 68, 68, 0.8),
      0 6px 22px rgba(220, 38, 38, 0.6);
  }
}

@keyframes force-finish-ring-pulse {
  0% {
    opacity: 1;
    transform: scale(1);
  }
  70% {
    opacity: 0;
    transform: scale(1.12);
  }
  100% {
    opacity: 0;
    transform: scale(1.12);
  }
}

.lightning-overlay {
  pointer-events: none;
}

svg.defs-only {
  position: absolute;
  width: 0;
  height: 0;
  overflow: hidden;
}

svg.anime-canvas {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0 6px #88bbff) drop-shadow(0 0 15px #4466ff);
}

.shard {
  fill: #eef5ff;
  stroke: #cce0ff;
  stroke-width: 0.8;
  opacity: 0;
  animation: flashShard 0.25s ease-out forwards;
}

@keyframes flashShard {
  0% {
    opacity: 0;
    transform: translate(0, 0);
  }
  25% {
    opacity: 1;
    fill: #ffffff;
  }
  50% {
    opacity: 0.2;
    transform: translate(var(--jx, 2px), var(--jy, -2px));
  }
  75% {
    opacity: 0.9;
  }
  100% {
    opacity: 0;
    transform: translate(0, 0);
  }
}

.lightning-flash {
  background: radial-gradient(circle at center, rgba(136, 187, 255, 0.2) 0%, transparent 70%);
  transition: opacity 0.15s ease-out;
}

.lightning-fade-enter-active,
.lightning-fade-leave-active {
  transition: opacity 0.2s ease;
}

.lightning-fade-enter-from,
.lightning-fade-leave-to {
  opacity: 0;
}

@keyframes screen-shake {
  10%,
  90% {
    transform: translate3d(-2px, -1px, 0);
  }
  20%,
  80% {
    transform: translate3d(3px, 2px, 0);
  }
  30%,
  50%,
  70% {
    transform: translate3d(-3px, -2px, 0);
  }
  40%,
  60% {
    transform: translate3d(2px, 1px, 0);
  }
}

/* Transisi Pop Kucing Meme */
.cat-pop-enter-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.cat-pop-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.cat-pop-enter-from,
.cat-pop-leave-to {
  opacity: 0;
  transform: scale(0.65);
}
</style>

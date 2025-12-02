// frontend\src\composables\useInfiniteScroll.js
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'

export function useInfiniteScroll(sourceArray, options = {}) {
  const { step = 12, rootMargin = '200px' } = options

  // State
  const displayedCount = ref(step)
  const loaderRef = ref(null) // Ref element HTML loader
  let observer = null

  // Computed: Slice array untuk ditampilkan
  const displayedItems = computed(() => {
    if (!sourceArray.value) return []
    return sourceArray.value.slice(0, displayedCount.value)
  })

  // Computed: Cek apakah masih ada sisa data
  const hasMore = computed(() => {
    if (!sourceArray.value) return false
    return displayedCount.value < sourceArray.value.length
  })

  // Logic: Tambah limit tampilan
  const loadMore = () => {
    if (hasMore.value) {
      displayedCount.value += step
    }
  }

  // Reset saat filter berubah (panggil dari parent)
  const reset = () => {
    displayedCount.value = step
    // Opsional: Scroll ke atas
    // window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // --- LOGIC OBSERVER UTAMA ---
  const setupObserver = () => {
    if (observer) observer.disconnect()

    observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        // Jika loader terlihat (isIntersecting) DAN masih ada data
        if (entry.isIntersecting && hasMore.value) {
          // [FIX INFINITE LOOP]
          // Beri jeda 300ms agar Masonry Layout sempat menata ulang tinggi halaman.
          // Tanpa ini, observer akan menembak loadMore berkali-kali dalam 1 detik.
          setTimeout(() => {
            loadMore()
          }, 300)
        }
      },
      {
        rootMargin, // Load data sebelum user mentok (preload)
        threshold: 0.1,
      },
    )

    if (loaderRef.value) {
      observer.observe(loaderRef.value)
    }
  }

  // Watch perubahan pada Ref Element (saat komponen di-mount/unmount)
  watch(loaderRef, (el) => {
    if (el) setupObserver()
  })

  // Watch perubahan data sumber (misal filter berubah)
  watch(sourceArray, () => {
    nextTick(() => {
      // Refresh observer untuk memastikan tetap sync
      if (loaderRef.value && observer) {
        observer.unobserve(loaderRef.value)
        observer.observe(loaderRef.value)
      }
    })
  })

  onUnmounted(() => {
    if (observer) observer.disconnect()
  })

  return {
    displayedItems,
    hasMore,
    reset,
    loaderRef, // Pastikan ini di-return untuk dipakai di template
  }
}

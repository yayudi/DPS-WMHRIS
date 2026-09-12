import { ref } from 'vue'
import apiClient from '@/api/axios'
import { useAuthStore } from '@/stores/auth.js'

/**
 * Single source of truth for backend URL derivation and image path resolution.
 * Replaces duplicated logic across ProductRow, ProductImageModal, MediaManagement,
 * MediaInfoModal, and MediaLightbox.
 */

const baseUrl = apiClient.defaults.baseURL || import.meta.env.VITE_API_BASE_URL || ''

/** Backend root URL (without /api suffix) */
export const backendUrl = import.meta.env.VITE_API_MEDIA_URL || baseUrl.replace(/\/api\/?$/, '')

/**
 * Resolve any relative image path into a full URL.
 * Handles paths with or without leading slash, with or without 'uploads/' prefix.
 * @param {string | null | undefined} path
 * @returns {string | null}
 */
export const resolveUrl = path => {
  if (!path) return null

  // 1. Bersihkan path dari awalan '/' atau 'uploads/' agar seragam
  let cleanPath = path.replace(/^\/+/, '')
  if (cleanPath.startsWith('uploads/')) {
    cleanPath = cleanPath.replace(/^uploads\//, '')
  }

  // 2. Tentukan base url
  let base
  if (import.meta.env.VITE_API_MEDIA_URL) {
    base = import.meta.env.VITE_API_MEDIA_URL
    if (!base.endsWith('/')) base += '/'
  } else {
    // baseUrl fallback akan menggunakan origin saat ini jika kosong
    let root = baseUrl.replace(/\/api\/?$/, '')
    if (root && !root.endsWith('/')) root += '/'
    base = root + 'uploads/'
  }

  const url = `${base}${cleanPath}`

  // Ambil token dari store (bypass reactivity jika dijalankan diluar setup, pinia sudah terinisialisasi)
  try {
    const auth = useAuthStore()
    if (auth.token) {
      return `${url}?token=${auth.token}`
    }
  } catch {
    // Abaikan error jika dipanggil sebelum pinia siap (misal saat boot)
  }
  return url
}

/**
 * Derive the best thumbnail URL from a product object.
 * Prefers thumbnail_path, falls back to image_path.
 * @param {object} product
 * @returns {string | null}
 */
export const resolveProductImageUrl = product => {
  const targetPath = product?.thumbnail_path || product?.image_path
  console.groupCollapsed('image url')
  console.log('product', product.id)
  console.log('product.name', product.name)
  console.log('product?.thumbnail_path', product?.thumbnail_path)
  console.log('targetPath', targetPath)
  console.log('url', resolveUrl(targetPath))
  console.groupEnd()
  return resolveUrl(targetPath)
}

/**
 * Composable for tracking broken images.
 * Returns a shared reactive Set and an error handler.
 */
export function useBrokenImages() {
  const brokenImages = ref(new Set())

  /** @param {number|string} id */
  const onImgError = id => {
    brokenImages.value.add(id)
  }

  return { brokenImages, onImgError }
}

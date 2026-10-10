import { ref } from 'vue'
import { mediaApi } from '../infrastructure/media.api'
import type { Media } from '../domain/media.entity'

export function useMedia() {
  const mediaList = ref<Media[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const fetchMedia = async (params?: Record<string, any>) => {
    isLoading.value = true
    error.value = null
    try {
      const response = await mediaApi.getMedia(params)
      if (Array.isArray(response)) {
        mediaList.value = response
      } else if (response && Array.isArray(response.data)) {
        mediaList.value = response.data
      } else {
        mediaList.value = []
      }
      return response
    } catch (err: any) {
      error.value = err.message || 'Gagal memuat media'
      mediaList.value = []
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const deleteMedia = async (id: number | string) => {
    isLoading.value = true
    error.value = null
    try {
      await mediaApi.deleteMedia(id)
      mediaList.value = mediaList.value.filter(m => m.id !== id)
    } catch (err: any) {
      error.value = err.message || 'Gagal menghapus media'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    mediaList,
    isLoading,
    error,
    fetchMedia,
    deleteMedia
  }
}

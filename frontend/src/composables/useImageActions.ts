// frontend/src/composables/useImageActions.js
import { useToast } from '@/composables/useToast'
import { useDownload } from '@/composables/useDownload'

/**
 * Composable for image clipboard and download operations.
 * Replaces identical logic in ProductImageModal and MediaManagement.
 */
export function useImageActions() {
  const { toast } = useToast()
  const { downloadBlob } = useDownload()

  /**
   * Copy a URL string to clipboard.
   * @param {string} url
   */
  const copyLinkToClipboard = async (url) => {
    try {
      await navigator.clipboard.writeText(url)
      toast('Tautan gambar berhasil disalin!', 'success')
    } catch (err) {
      console.error(err)
    }
  }

  /**
   * Fetch an image, convert to PNG, and copy to clipboard.
   * @param {string} url
   */
  const copyImageToClipboard = async (url) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const pngBlob = await convertBlobToPng(blob)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
      toast('Gambar berhasil disalin ke clipboard!', 'success')
    } catch (err) {
      console.error(err)
    }
  }

  /**
   * Download an image as a .webp file.
   * @param {string} url
   * @param {string} [filename]
   */
  const downloadImage = async (url, filename) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const safeName = (filename || 'image').replace(/\.[^.]+$/, '') + '.webp'
      downloadBlob(blob, safeName)
    } catch (err) {
      console.error(err)
    }
  }

  return { copyLinkToClipboard, copyImageToClipboard, downloadImage }
}

/**
 * Convert any image blob to PNG for clipboard compatibility.
 * @param {Blob} blob
 * @returns {Promise<Blob>}
 */
function convertBlobToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob)
        else reject(new Error('Canvas toBlob failed'))
      }, 'image/png')
    }
    img.onerror = reject
    img.crossOrigin = 'anonymous'
    img.src = URL.createObjectURL(blob)
  })
}

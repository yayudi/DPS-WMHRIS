import imageCompression from 'browser-image-compression'
import axios from 'axios'
// I will adjust the import based on how the project does it.

/**
 * Membaca File dan mengembalikan promise berupa ImageBitmap untuk digambar ke Canvas
 * @param {Blob|File} blob
 */
const createBitmap = async blob => {
  return await createImageBitmap(blob)
}

/**
 * Menghitung SHA-256 hash dari ArrayBuffer file
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
const computeHash = async blob => {
  const buffer = await blob.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Memproses gambar: kompresi main image (1600px), crop thumbnail 1:1 (300px), dan komputasi metadata.
 * @param {File} file
 * @returns {Promise<{mainBlob: Blob, thumbBlob: Blob, hash: string, sizeBytes: number, width: number, height: number, originalName: string}>}
 */
export const processMediaClientSide = async file => {
  // BUAT MAIN IMAGE (Max 1600px, WebP, Web Worker)
  const mainOptions = {
    maxWidthOrHeight: 1600,
    useWebWorker: true,
    fileType: 'image/webp',
    initialQuality: 1,
    alwaysKeepResolution: true,
    maxIteration: 1
  }

  const mainBlob = await imageCompression(file, mainOptions)

  // BUAT THUMBNAIL (Crop 1:1 di Tengah menggunakan Canvas)
  const imageBitmap = await createBitmap(mainBlob)
  const canvas = document.createElement('canvas')
  canvas.width = 300
  canvas.height = 300
  const ctx = canvas.getContext('2d')

  // Kalkulasi Crop Tengah 1:1
  const size = Math.min(imageBitmap.width, imageBitmap.height)
  const sx = (imageBitmap.width - size) / 2
  const sy = (imageBitmap.height - size) / 2

  ctx.drawImage(imageBitmap, sx, sy, size, size, 0, 0, 300, 300)

  const thumbBlob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/webp', 0.75)
  })

  // Hash SHA-256
  const hash = await computeHash(mainBlob)

  return {
    mainBlob,
    thumbBlob,
    hash,
    sizeBytes: mainBlob.size,
    width: imageBitmap.width,
    height: imageBitmap.height,
    originalName: file.name
  }
}

/**
 * Mengunggah satu set media secara langsung ke Cloudflare R2 dan menyimpan metadatanya di Backend.
 * @param {Array<File>} files
 * @param {Array<string>} fileTitles
 * @param {Array<string>} tags
 * @param {Array<number>} products
 * @param {Function} onProgressCallback - Callback progress (0-100)
 */
export const uploadMediaToR2 = async (apiClient, files, fileTitles, tags, products, onProgressCallback = null) => {
  // Minta Presigned URL dari Backend
  const fileRequests = files.map(f => ({ name: f.name, type: 'image/webp' }))
  const presignedRes = await apiClient.post('/media/presigned-url', { files: fileRequests })
  const urls = presignedRes.data.data

  const assetsMetadata = []

  let completedSteps = 0
  const totalSteps = files.length * 3
  const updateProgress = () => {
    completedSteps++
    if (onProgressCallback) {
      onProgressCallback(Math.round((completedSteps / totalSteps) * 100))
    }
  }

  // Proses & Unggah masing-masing file
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const title = fileTitles && fileTitles[i] ? fileTitles[i].trim() : file.name
    const urlData = urls.find(u => u.originalName === file.name)

    if (!urlData) throw new Error(`URL presigned tidak ditemukan untuk ${file.name}`)

    // Client-Side Processing
    const processed = await processMediaClientSide(file)
    updateProgress()

    // Upload Main Image ke R2
    await axios.put(urlData.main.url, processed.mainBlob, {
      headers: { 'Content-Type': 'image/webp' }
    })
    updateProgress()

    // Upload Thumbnail Image ke R2
    await axios.put(urlData.thumb.url, processed.thumbBlob, {
      headers: { 'Content-Type': 'image/webp' }
    })
    updateProgress()

    // Siapkan Metadata
    assetsMetadata.push({
      title: title,
      tags: tags || [],
      hash: processed.hash,
      sizeBytes: processed.sizeBytes,
      width: processed.width,
      height: processed.height,
      mainPath: urlData.main.key,
      thumbnailPath: urlData.thumb.key
    })
  }

  // Konfirmasi unggahan ke Backend untuk disimpan di MySQL
  const confirmRes = await apiClient.post('/media/confirm', {
    assets: assetsMetadata,
    products: products
  })

  return confirmRes.data
}

/**
 * frontend/src/utils/imageCropper.js
 * Utility functions for image manipulation
 */

export const autoCropCenter = async (files) => {
  return await Promise.all(
    files.map(async (file) => {
      // Create image element
      const img = new Image()
      const url = URL.createObjectURL(file)
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      URL.revokeObjectURL(url)

      // Calculate crop dimensions for 1:1 center
      const size = Math.min(img.width, img.height)
      const startX = (img.width - size) / 2
      const startY = (img.height - size) / 2

      // Create canvas
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      // Draw image
      ctx.drawImage(img, startX, startY, size, size, 0, 0, size, size)

      // Convert to blob
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, file.type, 0.95))
      if (!blob) return file

      return new File([blob], file.name, {
        type: file.type,
        lastModified: Date.now(),
      })
    })
  )
}

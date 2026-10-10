/**
 * Mengonversi ukuran file dalam bytes ke format yang mudah dibaca.
 * @param {number} bytes - Ukuran file dalam satuan bytes
 * @returns {string} Format string yang readable (misal: "85.4 KB", "1.24 MB")
 */
export const formatBytes = (bytes) => {
  if (bytes == null || isNaN(bytes)) return '—'
  if (bytes === 0) return '0 B'

  const MB = 1024 * 1024
  const KB = 1024

  if (bytes >= MB) {
    return (bytes / MB).toFixed(2) + ' MB'
  }
  return (bytes / KB).toFixed(1) + ' KB'
}

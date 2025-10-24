/**
 * Helper untuk mengubah format waktu "HH:mm:ss" menjadi total menit dari tengah malam.
 * @param {string | null} timeStr - String waktu, e.g., "08:05:00".
 * @returns {number | null} - Total menit, e.g., 485.
 */
function timeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null
  const [hours, minutes] = timeStr.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Memproses data mentah dari API SQL menjadi format terstruktur yang siap digunakan oleh komponen Vue.
 * @param {object} raw - Objek data mentah dari API.
 * @returns {Array} - Array pengguna dengan data log yang sudah dinormalisasi.
 */
export function normalizeLogs(raw) {
  if (!raw || !Array.isArray(raw.u)) {
    console.warn("normalizeLogs: data mentah tidak valid atau properti 'u' tidak ditemukan.")
    return []
  }

  const { u: users } = raw

  return users.map((user) => {
    const days = Array.isArray(user.d) ? user.d : []

    const logs = days.map((info, idx) => {
      const tanggal = idx + 1

      // KASUS 1: Hari libur atau absen (direpresentasikan sebagai angka)
      if (typeof info === 'number') {
        return {
          tanggal,
          jamMasuk: null,
          jamKeluar: null,
          breaks: [],
          status: info, // 1 for absen, 2 for libur
          holiday: info === 2,
          isEmpty: true,
          lateness: 0,
          overtime: 0,
        }
      }

      // KASUS 2: Ada data absensi (direpresentasikan sebagai objek)
      const jamMasuk = timeToMinutes(info.i)
      const jamKeluar = timeToMinutes(info.o)
      const rawLogs = info.raw || []
      const breaks = []

      // Proses log mentah untuk menemukan waktu istirahat
      for (let i = 0; i < rawLogs.length - 1; i++) {
        const currentLog = rawLogs[i]
        const nextLog = rawLogs[i + 1]

        if (currentLog.type === 'break-in' && nextLog.type === 'break-out') {
          const startTime = timeToMinutes(currentLog.time)
          const endTime = timeToMinutes(nextLog.time)
          if (startTime !== null && endTime !== null && endTime > startTime) {
            breaks.push({
              start: startTime,
              end: endTime,
              duration: endTime - startTime,
            })
            i++ // Lewati log berikutnya karena sudah dipasangkan
          }
        }
      }

      // Tentukan status berdasarkan data yang ada
      let status = 1 // Default: Absen
      if (jamMasuk && jamKeluar) {
        status = 0 // Hadir
      } else if (jamMasuk || jamKeluar) {
        status = 3 // Tidak Lengkap
      }

      return {
        tanggal,
        jamMasuk,
        jamKeluar,
        breaks,
        status,
        holiday: false, // API saat ini tidak mengirim info hari libur, jadi default-nya false
        isEmpty: !jamMasuk && !jamKeluar,
        lateness: info.t || 0, // Ambil data keterlambatan dari API
        overtime: info.e || 0, // Ambil data lembur dari API
      }
    })

    return {
      id: user.i, // ID pengguna dari database
      nama: user.n,
      logs,
      // Properti lain yang mungkin dibutuhkan oleh komponen lama
      year: null,
      month: null,
      raw: { summary: [] },
    }
  })
}

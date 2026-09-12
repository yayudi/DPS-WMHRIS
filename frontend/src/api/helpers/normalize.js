// frontend\src\api\helpers\normalize.js
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
 * REFACTOR BESAR:
 * Memproses data mentah dari API SQL (bukan JSON padat) menjadi format
 * yang siap digunakan oleh komponen Vue.
 *
 * @param {Array} allUsers - Array user dari tabel `users` (misal: {id, username})
 * @param {Array} logRows - Array log mentah dari `attendance_logs` JOIN `attendance_raw_logs`
 * @param {object} holidayMap - Peta hari libur (misal: {'2025-12-25': true})
 * @param {number} year - Tahun yang sedang dilihat
 * @param {number} month - Bulan yang sedang dilihat (1-12)
 * @returns {Array} - Array pengguna dengan data log yang sudah dinormalisasi.
 */
/**
 * REFACTOR BESAR:
 * Memproses data mentah dari API SQL (bukan JSON padat) menjadi format
 * yang siap digunakan oleh komponen Vue.
 *
 * Support: (year, month) OR (startDate, endDate)
 *
 * @param {Array} allUsers
 * @param {Array} logRows
 * @param {object} holidayMap
 * @param {number|string} arg4 - Year OR StartDate (YYYY-MM-DD)
 * @param {number|string} arg5 - Month OR EndDate (YYYY-MM-DD)
 * @returns {Array}
 */
export function normalizeLogs(allUsers, logRows, holidayMap, arg4, arg5) {
  // Verifikasi input yang diterima dari attendance.js
  if (!allUsers || !Array.isArray(allUsers)) {
    console.warn("normalizeLogs: data 'allUsers' tidak lengkap atau bukan array.", allUsers)
    return []
  }
  if (!holidayMap || typeof holidayMap !== 'object') {
    console.warn("normalizeLogs: data 'holidayMap' tidak lengkap atau bukan objek.", holidayMap)
    return []
  }

  // DETEKSI MODE: Range (String) atau Month (Number)
  const isRangeMode = typeof arg4 === 'string' && arg4.includes('-')
  let dateList = []
  let startDateObj, endDateObj

  if (isRangeMode) {
    // Mode Range: Generate list of YYYY-MM-DD strings
    startDateObj = new Date(arg4)
    endDateObj = new Date(arg5)

    const current = new Date(startDateObj)
    while (current <= endDateObj) {
      dateList.push(current.toISOString().split('T')[0])
      current.setDate(current.getDate() + 1)
    }
  } else {
    // Mode Month: Generate 1..DaysInMonth
    const year = parseInt(arg4)
    const month = parseInt(arg5)
    const daysInMonth = new Date(year, month, 0).getDate()

    for (let day = 1; day <= daysInMonth; day++) {
      // Adjust timezone offset (simple heuristic for local YYYY-MM-DD construction)
      const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      dateList.push(ymd)
    }
  }

  // Proses data mentah SQL (logRows) ke dalam struktur Map untuk pencarian cepat
  // Structure: Map<user_id, Map<YYYY-MM-DD, { ...data_log... }>>
  const userLogMap = new Map()

  if (logRows && Array.isArray(logRows)) {
    for (const row of logRows) {
      if (!userLogMap.has(row.user_id)) {
        userLogMap.set(row.user_id, new Map())
      }
      const dayMap = userLogMap.get(row.user_id)

      // Ambil date string YYYY-MM-DD dari row.date SQL (biasanya ISO string or Date object)
      const dateKey = new Date(row.date).toISOString().split('T')[0]

      if (!dayMap.has(dateKey)) {
        dayMap.set(dateKey, {
          jamMasuk: timeToMinutes(row.check_in),
          jamKeluar: timeToMinutes(row.check_out),
          breaks: [],
          status: row.status,
          holiday: false,
          isEmpty: false,
          lateness: row.lateness_minutes || 0,
          overtime: row.overtime_minutes || 0,
          late_pardon_minutes: row.late_pardon_minutes || 0,
          notes: row.notes,
          rawLogs: [],
        })
      }

      if (row.log_time) {
        dayMap.get(dateKey).rawLogs.push({
          time: row.log_time,
          type: row.log_type,
        })
      }
    }
  }

  // Loop melalui 'allUsers' untuk membangun hasil akhir
  return allUsers.map((user) => {
    const userDays = userLogMap.get(user.id)
    const logs = []

    dateList.forEach((ymd) => {
      const logData = userDays ? userDays.get(ymd) : undefined
      const currentDateObj = new Date(ymd)
      const dateNum = currentDateObj.getDate() // 1..31

      // Determine isHoliday
      // holidayMap keys should be YYYY-MM-DD
      const dayOfWeek = currentDateObj.getDay()
      const isHoliday = dayOfWeek === 0 || !!holidayMap[ymd]

      if (logData) {
        // KASUS 1: ADA LOG
        const breaks = []
        for (let i = 0; i < logData.rawLogs.length - 1; i++) {
          const currentLog = logData.rawLogs[i]
          const nextLog = logData.rawLogs[i + 1]
          if (currentLog.type === 'break-in' && nextLog.type === 'break-out') {
            const startTime = timeToMinutes(currentLog.time)
            const endTime = timeToMinutes(nextLog.time)
            if (startTime !== null && endTime !== null && endTime > startTime) {
              breaks.push({
                start: startTime,
                end: endTime,
                duration: endTime - startTime,
              })
              i++
            }
          }
        }

        let status = 1
        const dbStatus = logData.status ? logData.status.toUpperCase() : null;

        if (dbStatus === 'HADIR') status = 0
        else if (dbStatus === 'SAKIT') status = 4
        else if (dbStatus === 'IZIN') status = 5
        else if (dbStatus === 'LIBUR') status = 2
        else if (dbStatus === 'ALPHA') status = 1
        else {
          if (logData.notes && logData.notes.includes('SAKIT')) status = 4
          else if (logData.notes && logData.notes.includes('IZIN')) status = 5
          else if (logData.jamMasuk && logData.jamKeluar) status = 0
          else if (logData.jamMasuk || logData.jamKeluar) status = 3
        }

        logs.push({
          tanggal: dateNum, // Keep for legacy compatibility
          fullDate: ymd, // NEW: Full Date String
          jamMasuk: logData.jamMasuk,
          jamKeluar: logData.jamKeluar,
          breaks: breaks,
          status: status,
          holiday: isHoliday, // Override DB holiday check with Master Shift logic later? For now use Map.
          isEmpty: false,
          lateness: logData.lateness,
          overtime: logData.overtime,
          late_pardon_minutes: logData.late_pardon_minutes,
          notes: logData.notes || '',
          dbStatus: dbStatus
        })
      } else {
        // KASUS 2: TIDAK ADA LOG
        logs.push({
          tanggal: dateNum,
          fullDate: ymd,
          jamMasuk: null,
          jamKeluar: null,
          breaks: [],
          status: isHoliday ? 2 : 1, // 2 (Libur) atau 1 (Absen)
          holiday: isHoliday,
          isEmpty: true,
          lateness: 0,
          overtime: 0,
          late_pardon_minutes: 0,
        })
      }
    })

    return {
      id: user.id,
      nama: user.username,
      logs: logs,
      year: isRangeMode ? null : arg4,
      month: isRangeMode ? null : arg5,
    }
  })
}

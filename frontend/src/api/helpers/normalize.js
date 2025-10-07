// api/helpers/normalize.js
export function normalizeLogs(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("normalizeLogs: expected object {y,m,u}, got " + typeof raw)
  }
  if (!Array.isArray(raw.u)) {
    throw new Error("normalizeLogs: property u missing/invalid")
  }

  const { y: year, m: month, u: users } = raw

  return users.map(user => {
    const days = Array.isArray(user.d) ? user.d : []

    const logs = days.map((info, idx) => {
      const tanggal = idx + 1

      // Shortcut → number
      if (typeof info === "number") {
        const status = info
        return {
          tanggal,
          jamMasuk: null,
          jamKeluar: null,
          breaks: [],
          status,
          holiday: status === 2,
          isEmpty: status === 1 // absen full day
        }
      }

      // Object → detail log
      const entries = info.l || []
      let jamMasuk = null
      let jamKeluar = null
      const breaks = []

      entries.forEach((log, i) => {
        const [time, type] = log
        if (type === 0 && jamMasuk === null) jamMasuk = time
        if (type === 1) jamKeluar = time

        if (i < entries.length - 1) {
          const [nextTime, nextType] = entries[i + 1]
          if (type === 2 && nextType === 3) {
            const durasi = nextTime - time
            if (durasi > 0) {
              breaks.push({ start: time, end: nextTime, duration: durasi });
            }
          }
        }
      })

      const status = info.s ?? 0
      return {
        tanggal,
        jamMasuk,
        jamKeluar,
        breaks,
        status,
        holiday: status === 2,
        isEmpty: (!jamMasuk && !jamKeluar) || status === 1
      }
    })

    return {
      id: user.i,
      nama: user.n,
      year,
      month,
      logs,
      raw: {
        summary: user.r ?? []
      }
    }
  })
}

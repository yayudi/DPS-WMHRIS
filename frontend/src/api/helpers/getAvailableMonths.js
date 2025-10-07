// api/helpers/getAvailableMonths.js
import api from '../axios'

export default async function getAvailableMonths(year) {
  try {
    const { data } = await api.get('absensi/json/list_index.json')
    const months = data[year] || []

    return months.map((m) => ({
      label: new Date(`${year}-${m}-01`).toLocaleString('id-ID', { month: 'long' }),
      value: m,
    }))
  } catch (err) {
    console.error('Gagal ambil daftar bulan:', err)
    return []
  }
}

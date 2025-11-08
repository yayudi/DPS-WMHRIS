// frontend/src/services/pickingListParser.js
import Papa from 'papaparse'

/**
 * Membersihkan dan memvalidasi data dari baris CSV.
 * (Logika ini identik dengan versi backend)
 */
function cleanRow(row) {
  const invoiceNo = row['*Nomor Tagihan']?.trim()
  const customerName = row['*Nama Kontak']?.trim()
  const sku = row['*Kode Produk (SKU)']?.trim()
  const productName = row['*Nama Produk']?.trim()
  const quantity = parseInt(row['*Jumlah Produk'], 10)
  const source = 'Offline'

  if (!invoiceNo || !sku || !quantity || isNaN(quantity)) {
    return null
  }
  return { invoiceNo, customerName, sku, productName, quantity, source }
}

/**
 * Mengelompokkan baris CSV mentah menjadi daftar invoice unik.
 * (Logika ini identik dengan versi backend)
 * @returns {Array<object>} - Array dari invoice yang sudah di-grup
 */
function groupInvoices(csvData) {
  console.log(`[CSV Parser Frontend] Memulai grouping ${csvData.length} baris CSV...`)
  const invoicesMap = new Map()

  for (const row of csvData) {
    const data = cleanRow(row)
    if (!data) continue

    const { invoiceNo, customerName, sku, productName, quantity, source } = data

    const item = {
      sku: sku,
      name: productName,
      quantity: quantity,
    }

    if (!invoicesMap.has(invoiceNo)) {
      invoicesMap.set(invoiceNo, {
        invoiceNo: invoiceNo,
        customerName: customerName,
        source: source,
        items: [item],
      })
    } else {
      invoicesMap.get(invoiceNo).items.push(item)
    }
  }
  console.log(`[CSV Parser Frontend] Grouping selesai. Ditemukan ${invoicesMap.size} invoice unik.`)

  // Ubah Map menjadi Array untuk dikirim sebagai JSON
  return Array.from(invoicesMap.values())
}

/**
 * Fungsi utama untuk memproses file CSV di browser.
 * @param {File} file - File CSV dari <input type="file">
 * @returns {Promise<Array<object>>} - Promise yang resolve dengan array invoice ter-grup
 */
export function parseAndGroupCsv(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true, // CSV kita punya header
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length) {
          return reject(new Error('Gagal mem-parsing CSV: ' + results.errors[0].message))
        }

        try {
          const groupedData = groupInvoices(results.data)
          if (groupedData.length === 0) {
            return reject(new Error('Tidak ada data valid yang ditemukan di dalam file CSV.'))
          }
          resolve(groupedData)
        } catch (error) {
          reject(error)
        }
      },
      error: (error) => {
        reject(new Error('Error Papa Parse: ' + error.message))
      },
    })
  })
}

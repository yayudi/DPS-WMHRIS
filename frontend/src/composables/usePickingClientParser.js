// frontend\src\composables\usePickingClientParser.js
import { ref } from 'vue'
import { useToast } from '@/composables/UseToast.js'

// Import pdfjs-dist
// Import worker entry point correctly based on bundler setup
// Vite/Webpack typically handle this path automatically if installed via npm
import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url'
// import pdfjsWorker from 'pdfjs-dist/?url'

// Set worker source using the imported entry point
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker // <-- Wajib ada (path worker)
pdfjsLib.GlobalWorkerOptions.maxWorkerCount = 0 // <-- Wajib ada (mematikan worker, memaksa main thread)

// --- FUNGSI PARSING REGEX ---
function parseTokopediaPdfText(textContent) {
  if (!textContent) return []
  const items = []
  // Regex Tokopedia: Cari PP<angka> diikuti spasi lalu <angka>
  const productRegex = /(PP\d+)\s+(\d+)/g
  let match
  while ((match = productRegex.exec(textContent)) !== null) {
    const sku = match[1]?.trim()
    const qty = parseInt(match[2]?.trim(), 10)
    if (sku && !isNaN(qty)) {
      items.push({ sku, qty })
    }
  }
  console.log('[Client Parser] Tokopedia found items:', items)
  return items
}
function parseShopeePdfText(textContent) {
  if (!textContent) return []
  console.log('[Client Parser] Shopee...')
  // Pre-cleaning for Shopee: Gabungkan PP<angka> dan <angka> di baris berikutnya
  // const cleanedText = textContent.replace(/(PP\d+)\s*\r?\n\s*(\d+)/g, '$1 $2')
  const cleanedText = textContent.replace(/(PP\d{4})\s*(?:NO|\s)\s*(\d{3})/g, '$1$2')
  const items = []
  // Regex Shopee: PP<7digit>, diikuti apa saja (non-greedy), spasi, <angka qty>, spasi, No. Pesanan (anchor)
  const productRegex = /(PP\d{7})[\s\S]*?\s(\d+)\s+[A-Z0-9]{14,}/g
  let match
  while ((match = productRegex.exec(cleanedText)) !== null) {
    const sku = match[1]?.trim()
    const qty = parseInt(match[2]?.trim(), 10)
    if (sku && !isNaN(qty)) {
      // Gabungkan kuantitas jika SKU sama muncul lagi
      const existingItem = items.find((item) => item.sku === sku)
      if (existingItem) {
        existingItem.qty += qty
      } else {
        items.push({ sku, qty })
      }
    }
  }
  console.log(`[Client Parser] Shopee found ${items.length} unique items.`)
  return items
}
function parseOfflinePdfText(textContent) {
  if (!textContent) return []
  console.log('[Client Parser] Offline...')
  const items = []
  // Regex Offline: Awal baris, (opsional angka+spasi), PP<7digit>, apa saja (non-greedy), <angka qty>, akhir baris
  const productRegex = /^\s*(?:\d+\s+)?(PP\d{7})[\s\S]*?(\d+)\s*$/gm // gm = global, multiline
  let match
  while ((match = productRegex.exec(textContent)) !== null) {
    const sku = match[1]?.trim()
    const qty = parseInt(match[2]?.trim(), 10)
    if (sku && !isNaN(qty)) {
      // Offline biasanya tidak perlu digabung, tapi bisa ditambahkan jika perlu
      items.push({ sku, qty })
    }
  }
  console.log(`[Client Parser] Offline found ${items.length} items.`)
  return items
}
// --- AKHIR FUNGSI PARSING ---

export function usePickingClientParser() {
  const { show } = useToast()
  const isParsing = ref(false)
  const parsingError = ref(null)
  const parsedItems = ref(null) // Hasil parsing [{sku, qty}, ...]
  const parsingMessage = ref('') // Pesan status parsing

  /**
   * Fungsi utama untuk mem-parsing file (PDF atau Teks) di sisi klien.
   * @param {File} file - Objek File dari input.
   * @param {string} source - Sumber ('Tokopedia', 'Shopee', 'Offline').
   * @returns {Promise<Array|null>} - Promise yang resolve dengan array hasil parsing [{sku, qty}, ...] atau null jika gagal.
   */
  const parseFile = async (file, source) => {
    if (!file) {
      parsingError.value = 'File tidak dipilih.'
      return null
    }

    isParsing.value = true
    parsingError.value = null
    parsedItems.value = null
    parsingMessage.value = 'Membaca file...'

    let textContent = ''
    let pdfDocument = null

    try {
      // 1. Baca File
      const reader = new FileReader()
      const readFilePromise = new Promise((resolve, reject) => {
        reader.onload = (event) => resolve(event.target.result)
        if (file.type === 'application/pdf') {
          reader.readAsArrayBuffer(file)
        } else {
          reader.readAsText(file) // Coba baca sebagai teks biasa (txt, csv)
        }
        reader.onerror = (error) => reject(error)
      })
      const fileContent = await readFilePromise

      // 2. Ekstrak Teks
      if (file.type === 'application/pdf' && fileContent instanceof ArrayBuffer) {
        parsingMessage.value = 'Mem-parsing PDF...'
        console.log('[Client Parser DEBUG] Step 1: Reading PDF as ArrayBuffer complete.')
        try {
          const loadingTask = pdfjsLib.getDocument({
            data: new Uint8Array(fileContent), // pdf.js butuh Uint8Array
            // Opsi untuk potensi masalah
            disableFontFace: true,
            // isEvalSupported: false,
          })
          pdfDocument = await loadingTask.promise
          console.log(
            `[Client Parser DEBUG] Step 2: Document loaded. Total pages: ${pdfDocument.numPages}`,
          )

          const pagePromises = []
          parsingMessage.value = `Mem-parsing ${pdfDocument.numPages} halaman...`
          for (let i = 1; i <= pdfDocument.numPages; i++) {
            pagePromises.push(
              pdfDocument.getPage(i).then(async (page) => {
                const pageTextContent = await page.getTextContent()
                console.log(
                  `[Client Parser DEBUG] Page ${i}: Extracted ${pageTextContent.items.length} text items.`,
                )
                page.cleanup() // Lepaskan memori halaman
                // Gabungkan item teks dengan spasi, tambahkan newline jika perlu (hati-hati format asli)
                return pageTextContent.items.map((item) => item.str).join(' ')
              }),
            )
          }
          console.log(`[Client Parser DEBUG] Step 3: Waiting for all page promises...`)
          const pageTexts = await Promise.all(pagePromises)
          textContent = pageTexts.join('\n') // Gabungkan teks antar halaman
          console.log('[Client Parser] PDF parsing complete.')
        } catch (pdfError) {
          console.error('PDF Parsing Error (Client-Side):', pdfError)
          parsingError.value = `Gagal mem-parsing PDF: ${pdfError.message}`
          // Coba fallback ke text jika pdf error? Atau langsung gagal?
          // Untuk sekarang lempar error agar jelas
          throw pdfError
        } finally {
          if (pdfDocument && typeof pdfDocument.destroy === 'function') {
            await pdfDocument.destroy() // Lepaskan memori dokumen
          }
        }
      } else if (typeof fileContent === 'string') {
        parsingMessage.value = 'Membaca file teks...'
        console.log(
          `[Client Parser DEBUG] Step 1: Read text file complete. Length: ${textContent.length}`,
        )
        console.log('[Client Parser] File dibaca sebagai teks biasa.')
        textContent = fileContent
      } else {
        parsingError.value = 'Format file tidak didukung atau gagal dibaca.'
        throw new Error('Format file tidak didukung atau gagal dibaca.')
      }

      // 3. Ekstrak Item dengan Regex
      parsingMessage.value = 'Mengekstrak data item...'
      console.log(`[Client Parser DEBUG] Step 4: Starting regex extraction for source: ${source}`)
      let items
      if (source === 'Tokopedia') {
        items = parseTokopediaPdfText(textContent)
      } else if (source === 'Shopee') {
        items = parseShopeePdfText(textContent)
      } else if (source === 'Offline') {
        items = parseOfflinePdfText(textContent)
      } else {
        throw new Error(`Sumber parser tidak dikenal: ${source}`)
      }

      if (!items || items.length === 0) {
        // Beri pesan lebih spesifik jika parsing berhasil tapi 0 item
        throw new Error('Tidak ada item SKU/Kuantitas yang cocok ditemukan dalam konten file.')
      }

      parsedItems.value = items // Simpan hasil jika berhasil
      parsingMessage.value = 'Parsing selesai.'
      return items // Kembalikan array hasil
    } catch (error) {
      console.error('[Client Parser] Error:', error)
      // console.log(`[Client Parser DEBUG] Step 5: Extracted ${items.length} items.`)
      parsingError.value = error.message || 'Terjadi kesalahan saat parsing file.'
      parsedItems.value = null // Pastikan hasil null jika error
      return null // Kembalikan null jika gagal
    } finally {
      isParsing.value = false
      parsingMessage.value = '' // Reset pesan loading
    }
  }

  // Kembalikan state reaktif dan fungsi parse
  return {
    isParsing,
    parsingError,
    parsedItems, // Komponen bisa watch ini jika perlu
    parsingMessage,
    parseFile,
  }
}

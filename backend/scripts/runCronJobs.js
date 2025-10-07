import fs from 'fs/promises';
import path from 'path';

/**
 * Memastikan sebuah direktori ada, jika tidak, membuatnya.
 * @param {string} dirPath Path ke direktori
 */
async function ensureDir(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(dirPath, { recursive: true });
        } else {
            throw error;
        }
    }
}

/**
 * Mengambil data hari libur nasional dari API publik dan menyimpannya sebagai file JSON.
 */
async function fetchAndCacheHolidays() {
    const year = new Date().getFullYear();
    const url = `https://libur.deno.dev/api?year=${year}`;
    const outputDir = path.join(process.cwd(), 'public', 'json', 'absensi', 'holidays');
    const outFile = path.join(outputDir, `${year}.json`);

    console.log(`Fetching data hari libur untuk tahun ${year}...`);

    try {
        await ensureDir(outputDir);

        const response = await fetch(url, {
            headers: { 'User-Agent': 'MyOffice-Cron/1.0' }
        });

        if (!response.ok) {
            throw new Error(`Gagal mengambil data. Status: ${response.status}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            throw new Error('Respons API bukan format JSON yang valid.');
        }

        await fs.writeFile(outFile, JSON.stringify(data, null, 2));
        console.log(`✅ Data berhasil disimpan ke ${outFile} (${data.length} entri)`);

    } catch (error) {
        console.error(`❌ Terjadi kesalahan:`, error.message);
        process.exit(1); // Keluar dengan kode error
    }
}

// --- Jalankan fungsi utama ---
fetchAndCacheHolidays();
```

**Cara Menjalankannya di cPanel Cron Job:**
Sekarang, di cPanel, Anda tinggal mengubah perintah cron job Anda.

* **Perintah Lama:** `php /path/to/your/project/scripts/cron_holidays.php`
* **Perintah Baru:**
    ```bash
    /home/u1773579/nodevenv/officeBackend/24/bin/node /home/u1773579/officeBackend/scripts/runCronJobs.js
    ```

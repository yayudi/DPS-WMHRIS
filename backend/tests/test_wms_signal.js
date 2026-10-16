/* eslint-disable no-console */
import { emitSharedTaskSignal } from "../services/firebaseSignalService.js";

async function runTest() {
  console.log("=========================================");
  console.log("🧪 MENGUJI SINYAL FIREBASE WMS_DASHBOARD");
  console.log("=========================================");
  console.log("Pastikan Anda sedang membuka halaman WMS Dashboard di browser (Vue).");
  console.log("Menunggu 3 detik sebelum mengirim sinyal stok...");

  setTimeout(async () => {
    try {
      console.log(">> Mengirim sinyal REFRESH_STOCK ke WMS_DASHBOARD...");
      // Panggil fungsi persis seperti yang kita pasang di stockService.js
      await emitSharedTaskSignal("WMS_DASHBOARD", "REFRESH_STOCK");

      console.log("✅ Sinyal berhasil terkirim!");
      console.log("Cek browser Anda. Seharusnya tidak ada loading layar penuh,");
      console.log("tetapi data stok akan dimuat ulang di balik layar (Silent Fetch).");

      process.exit(0);
    } catch (error) {
      console.error("❌ Gagal mengirim sinyal Firebase:", error);
      process.exit(1);
    }
  }, 3000);
}

runTest();

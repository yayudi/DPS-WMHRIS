import NodeCache from "node-cache";

/**
 * Membuat instance cache tunggal (singleton) untuk digunakan di seluruh aplikasi.
 * stdTTL (Standard Time To Live): Waktu hidup default untuk setiap entri cache dalam detik.
 * checkperiod: Seberapa sering cache akan memeriksa dan menghapus entri yang sudah kedaluwarsa.
 */
const cache = new NodeCache({ stdTTL: 120, checkperiod: 150 });

console.log("✅ Modul Cache berhasil dimuat.");

export default cache;

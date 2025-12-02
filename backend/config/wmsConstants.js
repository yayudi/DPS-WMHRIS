// backend/config/wmsConstants.js

// ==============================================================================
// 1. STATUS WMS (Internal Gudang)
// ==============================================================================
// Ini mengontrol alur kerja stok dan tugas picking di gudang Anda.
export const WMS_STATUS = {
  PENDING: "PENDING", // Baru masuk dari Excel. Stok BELUM dipotong (menunggu validasi admin).
  VALIDATED: "VALIDATED", // Admin sudah OK. Stok SUDAH dipotong. Siap Picking/Packing.
  CANCEL: "CANCEL", // Batal. Stok dikembalikan (jika sempat dipotong).
};

// ==============================================================================
// 2. STATUS MARKETPLACE (Standardized)
// ==============================================================================
// Ini adalah hasil terjemahan dari bahasa Tokopedia/Shopee yang beragam.
// Kita standarisasi agar database bersih menggunakan bahasa Inggris baku.
export const MP_STATUS = {
  NEW: "NEW", // Pesanan Baru, Perlu Dikirim, Sedang Diproses
  SHIPPED: "SHIPPED", // Sedang Dikirim, Dalam Pengiriman, On Delivery
  COMPLETED: "COMPLETED", // Selesai, Delivered, Pesanan Selesai
  CANCELLED: "CANCELLED", // Batal, Dibatalkan, Void
  RETURNED: "RETURNED", // Pengembalian, Retur, Return
  UNKNOWN: "UNKNOWN", // Status aneh yang tidak dikenali mapper
};

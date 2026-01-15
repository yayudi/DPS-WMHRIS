// backend/config/wmsConstants.js

// Konfigurasi Jam Kerja (Dalam Menit)
// 08:00 = 8 * 60 = 480
export const JAM_KERJA_MULAI = 480;
export const JAM_KERJA_SELESAI = 960; // 16:00
export const JAM_KERJA_SELESAI_SABTU = 840; // 14:00
export const TOLERANSI_MENIT = 5;

// Konfigurasi Parser (Heuristik Penentuan Tipe Log)
// Digunakan untuk menebak apakah log ini 'Masuk' atau 'Pulang'
export const PARSER_CONSTANTS = {
  RANGE_MASUK_MULAI: 420, // 07:00
  RANGE_MASUK_SELESAI: 660, // 11:00

  RANGE_ISTIRAHAT_MULAI: 690, // 11:30
  RANGE_ISTIRAHAT_SELESAI: 780, // 13:00

  BATAS_PULANG_SABTU: 800, // ~13:20
  BATAS_PULANG_BIASA: 900, // ~15:00
};

export const WMS_STATUS = {
  PENDING: "PENDING", // Menunggu Picking
  VALIDATED: "VALIDATED", // Selesai Picking / Terkirim
  CANCEL: "CANCEL", // Batal total (Order void)
  RETURNED: "RETURNED", // Barang kembali, menunggu cek fisik gudang
};

export const MP_STATUS = {
  NEW: "NEW",
  SHIPPED: "SHIPPED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  RETURNED: "RETURNED", // Shopee/Tokped: "Dikembalikan", "Refund", dll
  UNKNOWN: "UNKNOWN",
};

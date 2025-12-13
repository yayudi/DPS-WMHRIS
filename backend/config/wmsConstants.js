// backend/config/wmsConstants.js

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

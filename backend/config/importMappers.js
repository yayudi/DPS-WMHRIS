// backend/config/importMappers.js

// --- CONSTANTS ---
const ORDER_STATUS = {
  PENDING: "PENDING_VALIDATION",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  SHIPPED: "SHIPPED",
  RETURNED: "RETURNED",
  IGNORE: "IGNORE",
};

// --- HELPERS ---

/**
 * Memformat Date object ke string MySQL (YYYY-MM-DD HH:mm:ss)
 */
const formatToDbDate = (dateObj) => {
  return dateObj.toISOString().slice(0, 19).replace("T", " ");
};

/**
 * Parse input tanggal yang beragam menjadi format Database
 */
const parseDate = (val) => {
  if (!val) return null;

  // 1. Handle ExcelJS Date Object langsung
  if (val instanceof Date) {
    return formatToDbDate(val);
  }

  const dateStr = String(val).trim();
  if (!dateStr) return null;

  try {
    // 2. Coba parsing standar JS (ISO / YYYY-MM-DD)
    let date = new Date(dateStr);

    // 3. Fallback: Format Indonesia (DD-MM-YYYY atau DD/MM/YYYY)
    if (isNaN(date.getTime())) {
      // Regex: Support DD-MM-YYYY, DD/MM/YYYY, dengan opsi jam:menit
      const idFormatRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s(\d{1,2}):(\d{1,2}))?/;
      const match = dateStr.match(idFormatRegex);

      if (match) {
        const [_, day, month, year, hour, minute] = match;
        // Reconstruct ke ISO format agar bisa diparse Date()
        const isoStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${(
          hour || "00"
        ).padStart(2, "0")}:${(minute || "00").padStart(2, "0")}:00`;
        date = new Date(isoStr);
      }
    }

    // Final Validation
    return !isNaN(date.getTime()) ? formatToDbDate(date) : null;
  } catch (e) {
    console.warn(`[Date Parser] Error parsing "${val}":`, e.message);
    return null;
  }
};

// --- MAPPERS CONFIGURATION ---

export const Mappers = {
  // =========================================
  // TOKOPEDIA (Support CSV Indo & XLSX English)
  // =========================================
  Tokopedia: {
    knownColumns: [
      // Identifiers
      "order id",
      "nomor invoice",
      "no pesanan",
      "tokopedia invoice number",
      // SKU
      "nomor sku",
      "seller sku",
      "sku",
      // Qty
      "jumlah produk",
      "quantity",
      "jumlah",
      // Customer
      "nama penerima",
      "recipient",
      // Date
      "created time",
      "waktu pesanan",
      "tanggal pemesanan",
      "order time",
      // Status
      "order status",
      "status pesanan",
      "status",
      "cancelation/return type",
    ],
    extract: (getter) => {
      // 1. ID Extraction
      const id = getter([
        "order id",
        "nomor invoice",
        "no pesanan",
        "invoice no",
        "tokopedia invoice number",
      ]);

      // Filter baris deskripsi/header sampah di file Excel Tokopedia
      if (id && (id.includes("unique order ID") || id.includes("Platform unique"))) {
        return "SKIP";
      }

      // 2. Data Extraction
      const sku = getter(["seller sku", "nomor sku", "sku"]); // Prioritas: Seller SKU
      const qty = parseInt(getter(["quantity", "jumlah produk", "jumlah"]) || "0", 10);
      const recipient = getter(["recipient", "nama penerima", "penerima"]);

      const rawDate = getter(["created time", "waktu pesanan", "tanggal pemesanan", "order time"]);
      const orderDate = parseDate(rawDate);

      // Validation
      if (!id || !sku || isNaN(qty)) return null;

      return { invoiceId: id, sku, qty, customer: recipient, orderDate };
    },
    getStatus: (getter) => {
      const status = getter(["order status", "status pesanan", "status"])?.toLowerCase() || "";
      const retType =
        getter(["cancelation/return type", "jenis pembatalan/pengembalian"])?.toLowerCase() || "";

      if (retType.includes("return") || retType.includes("pengembalian"))
        return ORDER_STATUS.RETURNED;
      if (
        status.includes("batal") ||
        status.includes("dibatalkan") ||
        status.includes("cancelled") // <--- TAMBAHAN PENTING
      )
        return ORDER_STATUS.CANCELLED;
      if (
        status.includes("selesai") ||
        status.includes("delivered") ||
        status.includes("completed") // <--- TAMBAHAN PENTING
      )
        return ORDER_STATUS.COMPLETED;
      if (
        status.includes("dikirim") ||
        status.includes("dalam pengiriman") ||
        status.includes("shipped") || // <--- TAMBAHAN PENTING
        status.includes("shipping")
      )
        return ORDER_STATUS.SHIPPED;

      // Status "Pesanan Baru" / "Siap Dikirim"
      if (
        status.includes("siap dikirim") ||
        status.includes("sedang diproses") ||
        status.includes("pesanan baru") ||
        status.includes("perlu dikirim") ||
        status.includes("new order") ||
        status.includes("new")
      ) {
        return ORDER_STATUS.PENDING;
      }

      return ORDER_STATUS.IGNORE;
    },
  },

  // =========================================
  // SHOPEE
  // =========================================
  Shopee: {
    knownColumns: [
      "no. pesanan",
      "no pesanan",
      "order id",
      "nomor referensi sku",
      "sku reference no",
      "sku induk",
      "parent sku",
      "jumlah",
      "quantity",
      "status pesanan",
      "order status",
      "status",
      "username (pembeli)",
      "username pembeli",
      "nama penerima",
      "waktu pesanan dibuat",
      "order creation time",
    ],
    extract: (getter) => {
      const id = getter(["no. pesanan", "no pesanan", "order id"]);

      // Shopee SKU Logic: Coba Reference SKU dulu, kalau kosong baru Parent SKU
      let sku = getter(["nomor referensi sku", "sku reference no"]);
      if (!sku) sku = getter(["sku induk", "parent sku"]);

      const qty = parseInt(getter(["jumlah", "quantity"]) || "0", 10);
      const customer = getter(["username (pembeli)", "username pembeli", "nama penerima"]);

      const rawDate = getter(["waktu pesanan dibuat", "order creation time"]);
      const orderDate = parseDate(rawDate);

      if (!id || !sku || isNaN(qty)) return null;

      return { invoiceId: id, sku, qty, customer, orderDate };
    },
    getStatus: (getter) => {
      const status = getter(["status pesanan", "order status", "status"])?.toLowerCase() || "";

      if (status.includes("batal") || status.includes("cancelled")) return ORDER_STATUS.CANCELLED;

      if (
        status.includes("selesai") ||
        status.includes("completed") ||
        status.includes("pesanan diterima")
      )
        return ORDER_STATUS.COMPLETED;

      if (status.includes("dikirim") || status.includes("shipped")) return ORDER_STATUS.SHIPPED;

      if (
        status.includes("perlu dikirim") ||
        status.includes("sedang diproses") ||
        status.includes("new")
      ) {
        return ORDER_STATUS.PENDING;
      }

      return ORDER_STATUS.IGNORE;
    },
  },

  // =========================================
  // OFFLINE / MANUAL
  // =========================================
  Offline: {
    knownColumns: [
      "*nomor tagihan",
      "nomor tagihan",
      "no tagihan",
      "*kode produk (sku)",
      "kode produk (sku)",
      "sku",
      "*jumlah produk",
      "jumlah produk",
      "jumlah",
      "status",
      "*tanggal transaksi (dd/mm/yyyy)",
      "tanggal",
      "date",
      "*nama kontak",
      "nama kontak",
      "perusahaan",
    ],
    extract: (getter) => {
      const id = getter(["*nomor tagihan", "nomor tagihan", "no tagihan"]);
      const sku = getter(["*kode produk (sku)", "kode produk (sku)", "kode produk", "sku"]);
      const qty = parseInt(getter(["*jumlah produk", "jumlah produk", "jumlah"]) || "0", 10);
      const customer = getter(["*nama kontak", "nama kontak", "perusahaan"]) || "Offline Customer";

      const rawDate = getter([
        "*tanggal transaksi (dd/mm/yyyy)",
        "tanggal transaksi (dd/mm/yyyy)",
        "tanggal",
        "date",
        "waktu",
      ]);
      const orderDate = parseDate(rawDate);

      if (!id || !sku || isNaN(qty)) return null;

      return { invoiceId: id, sku, qty, customer, orderDate };
    },
    getStatus: (getter) => {
      const status = getter(["status"])?.toLowerCase() || "";
      if (status.includes("void") || status.includes("batal")) return ORDER_STATUS.CANCELLED;

      // Default offline sales usually go straight to validation
      return ORDER_STATUS.PENDING;
    },
  },
};

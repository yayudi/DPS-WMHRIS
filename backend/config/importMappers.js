// backend/config/importMappers.js
import { MP_STATUS } from "./wmsConstants.js";

// --- HELPERS ---
const formatToDbDate = (dateObj) => {
  return dateObj.toISOString().slice(0, 19).replace("T", " ");
};

const parseDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return formatToDbDate(val);
  const dateStr = String(val).trim();
  if (!dateStr) return null;
  try {
    let date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      const idFormatRegex = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s(\d{1,2}):(\d{1,2}))?/;
      const match = dateStr.match(idFormatRegex);
      if (match) {
        const [_, day, month, year, hour, minute] = match;
        const isoStr = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${(
          hour || "00"
        ).padStart(2, "0")}:${(minute || "00").padStart(2, "0")}:00`;
        date = new Date(isoStr);
      }
    }
    return !isNaN(date.getTime()) ? formatToDbDate(date) : null;
  } catch (e) {
    return null;
  }
};

export const Mappers = {
  // =========================================
  // TOKOPEDIA
  // =========================================
  Tokopedia: {
    knownColumns: [
      "order id",
      "nomor invoice",
      "no pesanan",
      "tokopedia invoice number",
      "nomor sku",
      "seller sku",
      "sku",
      "jumlah produk",
      "quantity",
      "jumlah",
      "sku quantity of return",
      "Sku Quantity of return",
      "jumlah pengembalian",
      "return quantity",
      "returned quantity",
      "nama penerima",
      "recipient",
      "created time",
      "waktu pesanan",
      "tanggal pemesanan",
      "order time",
      "order status",
      "status pesanan",
      "status",
      "cancelation/return type",
      "Cancelation/Return Type",
    ],
    extract: (getter) => {
      const id = getter([
        "order id",
        "nomor invoice",
        "no pesanan",
        "invoice no",
        "tokopedia invoice number",
      ]);
      if (id && (id.includes("unique order ID") || id.includes("Platform unique"))) return "SKIP";

      const sku = getter(["seller sku", "nomor sku", "sku"]);
      const qty = parseInt(getter(["quantity", "jumlah produk", "jumlah"]) || "0", 10);

      // Coba ambil return qty dengan berbagai kemungkinan key
      // Debug: Kita cek nilai mentahnya
      const rawReturnQty = getter([
        "sku quantity of return",
        "Sku Quantity of return",
        "jumlah pengembalian",
        "return quantity",
        "returned quantity",
      ]);

      const returnedQty = parseInt(rawReturnQty || "0", 10);
      console.log(`[MAPPER] Raw Return Qty for Invoice ${id}, SKU ${sku}:`, rawReturnQty);
      console.log(`[MAPPER] Parsed Return Qty:`, returnedQty);

      // [DEBUG LOG] Aktifkan ini untuk melihat per baris jika masih bermasalah
      // if (returnedQty > 0) console.log(`[MAPPER] Found Return: ${id} | SKU: ${sku} | Qty: ${qty} | Ret: ${returnedQty}`);

      const recipient = getter(["recipient", "nama penerima", "penerima"]);
      const orderDate = parseDate(
        getter(["created time", "waktu pesanan", "tanggal pemesanan", "order time"])
      );

      if (!id || !sku || isNaN(qty)) return null;

      // PENTING: returnedQty harus ada di object return ini
      return { invoiceId: id, sku, qty, returnedQty, customer: recipient, orderDate };
    },
    getStatus: (getter) => {
      const status = getter(["order status", "status pesanan", "status"])?.toLowerCase() || "";
      const retType =
        getter([
          "cancelation/return type",
          "Cancelation/Return Type", // <-- Match CSV
          "jenis pembatalan/pengembalian",
        ])?.toLowerCase() || "";

      if (
        retType.includes("return") ||
        retType.includes("pengembalian") ||
        retType.includes("refund")
      )
        return MP_STATUS.RETURNED;

      if (retType.includes("cancel") || retType.includes("batal")) return MP_STATUS.CANCELLED;

      if (status.includes("batal") || status.includes("dibatalkan") || status.includes("cancelled"))
        return MP_STATUS.CANCELLED;

      if (
        status.includes("selesai") ||
        status.includes("delivered") ||
        status.includes("completed")
      )
        return MP_STATUS.COMPLETED;

      if (
        status.includes("dikirim") ||
        status.includes("dalam pengiriman") ||
        status.includes("shipped") ||
        status.includes("shipping") ||
        status.includes("sedang transit")
      )
        return MP_STATUS.SHIPPED;

      if (
        status.includes("siap dikirim") ||
        status.includes("sedang diproses") ||
        status.includes("pesanan baru") ||
        status.includes("perlu dikirim") ||
        status.includes("new")
      ) {
        return MP_STATUS.NEW;
      }

      return "IGNORE";
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
      "returned quantity",
      "jumlah dikembalikan",
      "quantity returned",
      "status pesanan",
      "order status",
      "status",
      "status pembatalan/ pengembalian",
      "username (pembeli)",
      "username pembeli",
      "nama penerima",
      "waktu pesanan dibuat",
      "order creation time",
    ],
    extract: (getter) => {
      const id = getter(["no. pesanan", "no pesanan", "order id"]);
      let sku = getter(["nomor referensi sku", "sku reference no"]);
      if (!sku) sku = getter(["sku induk", "parent sku"]);

      const qty = parseInt(getter(["jumlah", "quantity"]) || "0", 10);

      const returnedQty = parseInt(
        getter(["returned quantity", "jumlah dikembalikan", "quantity returned"]) || "0",
        10
      );

      const customer = getter(["username (pembeli)", "username pembeli", "nama penerima"]);
      const orderDate = parseDate(getter(["waktu pesanan dibuat", "order creation time"]));

      if (!id || !sku || isNaN(qty)) return null;

      return { invoiceId: id, sku, qty, returnedQty, customer, orderDate };
    },
    getStatus: (getter) => {
      const status = getter(["status pesanan", "order status", "status"])?.toLowerCase() || "";
      const retStatus = getter(["status pembatalan/ pengembalian"])?.toLowerCase() || "";

      if (
        retStatus.includes("pengembalian") ||
        retStatus.includes("return") ||
        retStatus.includes("disetujui")
      ) {
        return MP_STATUS.RETURNED;
      }

      if (status.includes("batal") || status.includes("cancelled")) return MP_STATUS.CANCELLED;
      if (
        status.includes("selesai") ||
        status.includes("completed") ||
        status.includes("pesanan diterima")
      )
        return MP_STATUS.COMPLETED;
      if (status.includes("dikirim") || status.includes("shipped")) return MP_STATUS.SHIPPED;
      if (
        status.includes("perlu dikirim") ||
        status.includes("sedang diproses") ||
        status.includes("new")
      )
        return MP_STATUS.NEW;

      return "IGNORE";
    },
  },

  // =========================================
  // OFFLINE
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
      const orderDate = parseDate(getter(["*tanggal transaksi (dd/mm/yyyy)", "tanggal", "date"]));

      if (!id || !sku || isNaN(qty)) return null;

      return { invoiceId: id, sku, qty, returnedQty: 0, customer, orderDate };
    },
    getStatus: (getter) => {
      const status = getter(["status"])?.toLowerCase() || "";
      if (status.includes("void") || status.includes("batal")) return MP_STATUS.CANCELLED;
      return MP_STATUS.NEW;
    },
  },
};

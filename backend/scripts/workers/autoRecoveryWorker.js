// backend/scripts/workers/autoRecoveryWorker.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dayjs from "dayjs";
import db from "../../config/db.js";
import Logger from "../../utils/logger.js";
import {
  completePickingItemsService,
  retryBackordersBatchService,
} from "../../services/pickingDataService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const RECOVERY_LOG_DIR = path.resolve(__dirname, "../../logs/auto_recovery");

/**
 * Menulis log komprehensif ke file harian di backend/logs/auto_recovery/
 * @param {'INFO'|'WARN'|'ERROR'|'DEBUG'} level
 * @param {string} message
 * @param {any} [data=null]
 */
const writeRecoveryLog = (level, message, data = null) => {
  try {
    if (!fs.existsSync(RECOVERY_LOG_DIR)) {
      fs.mkdirSync(RECOVERY_LOG_DIR, { recursive: true });
    }
    const today = dayjs().format("YYYY-MM-DD");
    const filePath = path.resolve(RECOVERY_LOG_DIR, `auto-recovery-${today}.log`);
    const timestamp = dayjs().format("YYYY-MM-DD HH:mm:ss.SSS");
    let line = `[${timestamp}] [${level}] ${message}`;

    if (data) {
      if (data instanceof Error) {
        line += `\n  Error: ${data.message}\n  Stack: ${data.stack}`;
      } else {
        try {
          line += `\n  Details: ${JSON.stringify(data, null, 2)}`;
        } catch {
          line += `\n  Details: [Unserializable]`;
        }
      }
    }

    fs.appendFileSync(filePath, line + "\n");
  } catch (err) {
    console.error("Gagal menulis auto-recovery log:", err);
  }
};

export const runAutoRecovery = async () => {
  const startTime = Date.now();
  let connection;

  writeRecoveryLog("INFO", "============================================================");
  writeRecoveryLog("INFO", "🚀 [AUTO-RECOVERY RUN STARTED]");

  try {
    connection = await db.getConnection();

    // Ambil maksimal 250 Picking List yang belum selesai (memiliki item PENDING atau BACKORDER)
    const [activeLists] = await connection.query(`
      SELECT DISTINCT pl.id, pl.original_invoice_id, pl.user_id, pl.order_date
      FROM picking_lists pl
      JOIN picking_list_items pli ON pl.id = pli.picking_list_id
      WHERE pl.status IN ('PENDING', 'VALIDATED')
        AND pl.is_active = 1
        AND pli.status IN ('PENDING', 'BACKORDER')
        AND (pli.last_recovery_attempt IS NULL OR pli.last_recovery_attempt < NOW() - INTERVAL 4 HOUR)
      ORDER BY COALESCE(pl.order_date, pl.created_at) ASC, pl.id ASC
      LIMIT 250
    `);

    // Jika antrean kosong, berikan log diagnostik agar penyebabnya terlihat jelas di log
    if (activeLists.length === 0) {
      writeRecoveryLog(
        "INFO",
        "⚠️ Antrean kosong: Tidak ada picking list yang memenuhi kriteria seleksi saat ini.",
      );

      // Diagnosa status picking list aktif secara keseluruhan
      const [[diagSummary]] = await connection.query(`
        SELECT
          COUNT(DISTINCT pl.id) as total_active_status,
          SUM(CASE WHEN pl.is_active = 0 THEN 1 ELSE 0 END) as inactive_flag_count
        FROM picking_lists pl
        JOIN picking_list_items pli ON pl.id = pli.picking_list_id
        WHERE pl.status IN ('PENDING', 'VALIDATED')
          AND pli.status IN ('PENDING', 'BACKORDER')
      `);

      const [coolingDown] = await connection.query(`
        SELECT pl.id, pl.original_invoice_id, MAX(pli.last_recovery_attempt) as last_attempt
        FROM picking_lists pl
        JOIN picking_list_items pli ON pl.id = pli.picking_list_id
        WHERE pl.status IN ('PENDING', 'VALIDATED')
          AND pl.is_active = 1
          AND pli.status IN ('PENDING', 'BACKORDER')
          AND pli.last_recovery_attempt >= NOW() - INTERVAL 4 HOUR
        GROUP BY pl.id, pl.original_invoice_id
        LIMIT 10
      `);

      writeRecoveryLog("INFO", "📊 Diagnosa Database:", {
        pesananPendingAtauValidated: diagSummary?.total_active_status || 0,
        terfilterInactiveFlag: diagSummary?.inactive_flag_count || 0,
        jumlahPesananDalamMasaCooldown4Jam: coolingDown.length,
        contohPesananDalamCooldown: coolingDown.map((c) => ({
          invoice: c.original_invoice_id,
          listId: c.id,
          lastAttempt: c.last_attempt,
        })),
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      writeRecoveryLog(
        "INFO",
        `🏁 [AUTO-RECOVERY RUN FINISHED] Selesai tanpa aksi dalam ${duration} detik.`,
      );
      return;
    }

    writeRecoveryLog(
      "INFO",
      `📋 Ditemukan ${activeLists.length} pesanan yang siap dievaluasi:`,
      activeLists.map((l) => ({ id: l.id, invoice: l.original_invoice_id, userId: l.user_id })),
    );

    // Dapatkan fallback user ID jika pl.user_id tidak tersedia
    let systemUserId = process.env.SYSTEM_USER_ID ? Number(process.env.SYSTEM_USER_ID) : null;
    if (!systemUserId) {
      const [systemUsers] = await connection.query(`
        SELECT id FROM users
        WHERE is_active = 1
        ORDER BY
          CASE
            WHEN LOWER(username) IN ('system', 'bot', 'cron') THEN 1
            WHEN LOWER(username) LIKE '%admin%' THEN 2
            ELSE 3
          END,
          id ASC
        LIMIT 1
      `);
      systemUserId = systemUsers[0]?.id || null;
    }

    let successCount = 0;
    let skippedCount = 0;
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));

    for (let i = 0; i < activeLists.length; i++) {
      const list = activeLists[i];
      const executorUserId = list.user_id || systemUserId;
      writeRecoveryLog(
        "INFO",
        `▶️ [${i + 1}/${activeLists.length}] Memproses Invoice: ${list.original_invoice_id} (List ID: ${list.id}, User ID: ${executorUserId})`,
      );

      try {
        if (!executorUserId) {
          throw new Error("Tidak ada user valid untuk pencatatan stock_movements.");
        }

        // TAHAP A: SINKRONISASI ALOKASI STOK
        writeRecoveryLog(
          "DEBUG",
          `[${list.original_invoice_id}] TAHAP A: Menjalankan sinkronisasi alokasi stok (retryBackordersBatchService)...`,
        );
        await retryBackordersBatchService([list.id]);

        // Cek rincian item terkini
        const [allItems] = await connection.query(
          `
          SELECT pli.id, pli.picking_list_id, pli.product_id, pli.original_sku, pli.quantity, pli.status, pli.suggested_location_id, loc.code as location_code
          FROM picking_list_items pli
          LEFT JOIN locations loc ON pli.suggested_location_id = loc.id
          WHERE pli.picking_list_id = ?
        `,
          [list.id],
        );

        writeRecoveryLog(
          "DEBUG",
          `[${list.original_invoice_id}] Rincian item setelah alokasi stok:`,
          allItems.map((it) => ({
            itemId: it.id,
            sku: it.original_sku,
            qty: it.quantity,
            status: it.status,
            suggestedLocation: it.location_code || "NULL",
          })),
        );

        // TAHAP B1: GUARD LOKASI LTC (Exclude dari auto-fulfillment)
        const ltcItems = allItems.filter(
          (it) =>
            it.location_code &&
            (it.location_code.toUpperCase().trim() === "LTC" ||
              it.location_code.toUpperCase().startsWith("LTC")),
        );

        if (ltcItems.length > 0) {
          await connection.query(
            `UPDATE picking_list_items SET last_recovery_attempt = NOW() WHERE picking_list_id = ?`,
            [list.id],
          );

          writeRecoveryLog(
            "INFO",
            `⏸️ [${list.original_invoice_id}] BERHENTI (Exclude LTC): Terdapat ${ltcItems.length} item di lokasi LTC. Ketersediaan stok telah dicek, dilewati dari auto-fulfillment.`,
            ltcItems.map((u) => ({
              sku: u.original_sku,
              qty: u.quantity,
              status: u.status,
              suggestedLocation: u.location_code,
            })),
          );
          skippedCount++;
          await delay(100);
          continue;
        }

        // TAHAP B2: EVALUASI ANTI-PARSIAL
        const unfulfillable = allItems.filter(
          (it) =>
            it.status === "BACKORDER" || (it.status === "PENDING" && !it.suggested_location_id),
        );

        // TAHAP C: EKSEKUSI (DEDUCT STOCK)
        if (unfulfillable.length === 0) {
          const itemsToDeduct = allItems
            .filter((it) => it.status === "PENDING")
            .map((it) => ({
              ...it,
              picking_list_id: it.picking_list_id || list.id,
            }));

          if (itemsToDeduct.length > 0) {
            writeRecoveryLog(
              "INFO",
              `[${list.original_invoice_id}] TAHAP C: Semua ${itemsToDeduct.length} item siap. Memulai pemotongan stok & pencatatan log...`,
            );

            await completePickingItemsService(itemsToDeduct, executorUserId);

            writeRecoveryLog(
              "INFO",
              `✅ [${list.original_invoice_id}] Auto-Fulfillment Berhasil! Stok telah dipotong dan dicatat ke Batch Log.`,
            );
            Logger.info(
              `✅ Auto-Fulfillment Berhasil: Invoice ${list.original_invoice_id}`,
              "AUTO_WORKER",
            );
            successCount++;
          } else {
            writeRecoveryLog(
              "WARN",
              `[${list.original_invoice_id}] Tidak ada item berstatus PENDING untuk dipotong (mungkin sudah selesai).`,
            );
          }
        } else {
          // CEGAH STARVATION: Tandai waktu percobaan agar pesanan ini tidak memblokir antrean di cron berikutnya
          await connection.query(
            `UPDATE picking_list_items SET last_recovery_attempt = NOW() WHERE picking_list_id = ?`,
            [list.id],
          );

          writeRecoveryLog(
            "WARN",
            `⏸️ [${list.original_invoice_id}] DILEWATI (Anti-Partial Guard): Ada ${unfulfillable.length} item yang belum tersedia stoknya. Cooldown disetel ke NOW().`,
            unfulfillable.map((u) => ({
              sku: u.original_sku,
              qty: u.quantity,
              status: u.status,
              reason:
                u.status === "BACKORDER" ? "Stok habis / Backorder" : "Lokasi belum disarankan",
            })),
          );
          skippedCount++;
        }
      } catch (innerErr) {
        // Jika gagal karena Race Condition atau error lainnya, beri stempel waktu dan catat error lengkap
        await connection.query(
          `UPDATE picking_list_items SET last_recovery_attempt = NOW() WHERE picking_list_id = ?`,
          [list.id],
        );

        writeRecoveryLog(
          "ERROR",
          `❌ [${list.original_invoice_id}] Gagal memproses pesanan: ${innerErr.message}`,
          innerErr,
        );
        Logger.error(
          `⚠️ Gagal memproses Invoice ${list.original_invoice_id}`,
          innerErr,
          "AUTO_WORKER",
        );
        skippedCount++;
      }

      // Throttling: Beri jeda 100ms agar CPU Shared Hosting aman
      await delay(100);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    writeRecoveryLog(
      "INFO",
      `🏁 [AUTO-RECOVERY RUN FINISHED] Durasi: ${duration}s | Diproses: ${activeLists.length} | Berhasil: ${successCount} | Dilewati/Gagal: ${skippedCount}`,
    );
    writeRecoveryLog("INFO", "============================================================\n");

    if (successCount > 0) {
      Logger.info(
        `Auto-Worker Selesai: Berhasil memenuhi ${successCount} pesanan secara otomatis.`,
        "AUTO_WORKER",
      );
    }
  } catch (error) {
    writeRecoveryLog("ERROR", "🔥 Fatal Worker Error:", error);
    Logger.error("Auto Worker Error", error, "AUTO_WORKER");
  } finally {
    if (connection) connection.release();
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAutoRecovery()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

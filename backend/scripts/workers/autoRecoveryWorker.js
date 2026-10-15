// backend/scripts/workers/autoRecoveryWorker.js
import { fileURLToPath } from "url";
import db from "../../config/db.js";
import Logger from "../../utils/logger.js";
import {
  completePickingItemsService,
  retryBackordersBatchService,
} from "../../services/pickingDataService.js";

/**
 * Menjalankan proses auto-recovery pemenuhan picking list yang tertunda/backorder.
 * @returns {Promise<void>}
 */
export const runAutoRecovery = async () => {
  Logger.startFlushTimer();
  const startTime = Date.now();
  let connection;

  Logger.info("🚀 [AUTO-RECOVERY RUN STARTED]", "AUTO_RECOVERY");

  try {
    connection = await db.getConnection();

    // Ambil maksimal 50 Picking List yang belum selesai (memiliki item PENDING atau BACKORDER)
    // Prioritaskan pesanan yang belum pernah dievaluasi (last_recovery_attempt IS NULL) terlebih dahulu
    const [activeLists] = await connection.query(`
      SELECT
        pl.id,
        pl.original_invoice_id,
        pl.user_id,
        pl.order_date
      FROM picking_lists pl
      JOIN picking_list_items pli ON pl.id = pli.picking_list_id
      WHERE pl.status IN ('PENDING', 'VALIDATED')
        AND pl.is_active = 1
        AND pli.status IN ('PENDING', 'BACKORDER')
        AND (pli.last_recovery_attempt IS NULL OR pli.last_recovery_attempt < NOW() - INTERVAL 4 HOUR)
      GROUP BY
        pl.id,
        pl.original_invoice_id,
        pl.user_id,
        pl.order_date,
        pl.created_at
      ORDER BY
        CASE WHEN MAX(pli.last_recovery_attempt) IS NULL THEN 0 ELSE 1 END ASC,
        COALESCE(pl.order_date, pl.created_at) ASC,
        pl.id ASC
      LIMIT 75
    `);

    // Jika antrean kosong, berikan log diagnostik agar penyebabnya terlihat jelas di log
    if (activeLists.length === 0) {
      Logger.info(
        "⚠️ Antrean kosong: Tidak ada picking list yang memenuhi kriteria seleksi saat ini.",
        "AUTO_RECOVERY",
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
        LIMIT 75
      `);

      Logger.info("📊 Diagnosa Database:", "AUTO_RECOVERY", {
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
      Logger.info(
        `🏁 [AUTO-RECOVERY RUN FINISHED] Selesai tanpa aksi dalam ${duration} detik.`,
        "AUTO_RECOVERY",
      );
      return;
    }

    Logger.info(
      `📋 Ditemukan ${activeLists.length} pesanan yang siap dievaluasi:`,
      "AUTO_RECOVERY",
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
      Logger.info(
        `▶️ [${i + 1}/${activeLists.length}] Memproses Invoice: ${list.original_invoice_id} (List ID: ${list.id}, User ID: ${executorUserId})`,
        "AUTO_RECOVERY",
      );

      try {
        if (!executorUserId) {
          throw new Error("Tidak ada user valid untuk pencatatan stock_movements.");
        }

        // TAHAP A: SINKRONISASI ALOKASI STOK
        Logger.debug(
          `[${list.original_invoice_id}] TAHAP A: Menjalankan sinkronisasi alokasi stok (retryBackordersBatchService)...`,
          "AUTO_RECOVERY",
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

        Logger.debug(
          `[${list.original_invoice_id}] Rincian item setelah alokasi stok:`,
          "AUTO_RECOVERY",
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

          Logger.info(
            `⏸️ [${list.original_invoice_id}] BERHENTI (Exclude LTC): Terdapat ${ltcItems.length} item di lokasi LTC. Ketersediaan stok telah dicek, dilewati dari auto-fulfillment.`,
            "AUTO_RECOVERY",
            ltcItems.map((u) => ({
              sku: u.original_sku,
              qty: u.quantity,
              status: u.status,
              suggestedLocation: u.location_code,
            })),
          );
          skippedCount++;
          await delay(1000);
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
            Logger.info(
              `[${list.original_invoice_id}] TAHAP C: Semua ${itemsToDeduct.length} item siap. Memulai pemotongan stok & pencatatan log...`,
              "AUTO_RECOVERY",
            );

            await completePickingItemsService(itemsToDeduct, executorUserId);

            Logger.info(
              `✅ [${list.original_invoice_id}] Auto-Fulfillment Berhasil! Stok telah dipotong dan dicatat ke Batch Log.`,
              "AUTO_RECOVERY",
            );
            successCount++;
          } else {
            Logger.warn(
              `[${list.original_invoice_id}] Tidak ada item berstatus PENDING untuk dipotong (mungkin sudah selesai).`,
              "AUTO_RECOVERY",
            );
          }
        } else {
          // CEGAH STARVATION: Tandai waktu percobaan agar pesanan ini tidak memblokir antrean di cron berikutnya
          await connection.query(
            `UPDATE picking_list_items SET last_recovery_attempt = NOW() WHERE picking_list_id = ?`,
            [list.id],
          );

          Logger.warn(
            `⏸️ [${list.original_invoice_id}] DILEWATI (Anti-Partial Guard): Ada ${unfulfillable.length} item yang belum tersedia stoknya. Cooldown disetel ke NOW().`,
            "AUTO_RECOVERY",
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

        Logger.error(
          `❌ [${list.original_invoice_id}] Gagal memproses pesanan: ${innerErr.message}`,
          innerErr,
          "AUTO_RECOVERY",
        );
        skippedCount++;
      }

      // Throttling: Beri jeda 1000ms agar disk I/O dan CPU Shared Hosting aman
      await delay(1000);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    Logger.info(
      `🏁 [AUTO-RECOVERY RUN FINISHED] Durasi: ${duration}s | Diproses: ${activeLists.length} | Berhasil: ${successCount} | Dilewati/Gagal: ${skippedCount}`,
      "AUTO_RECOVERY",
    );
  } catch (error) {
    Logger.error("🔥 Fatal Worker Error", error, "AUTO_RECOVERY");
  } finally {
    if (connection) connection.release();
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAutoRecovery()
    .then(async () => {
      await Logger.shutdown();
      process.exit(0);
    })
    .catch(async (err) => {
      Logger.error("Worker fatal error:", err, "AUTO_RECOVERY");
      await Logger.shutdown();
      process.exit(1);
    });
}

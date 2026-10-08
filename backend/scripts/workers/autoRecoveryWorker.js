// backend/scripts/workers/autoRecoveryWorker.js
import db from "../../config/db.js";
import Logger from "../../utils/logger.js";
import {
  completePickingItemsService,
  retryBackordersBatchService,
} from "../../services/pickingDataService.js";

export const runAutoRecovery = async () => {
  let connection;
  try {
    connection = await db.getConnection();

    // Ambil maksimal 50 Picking List yang belum selesai (PENDING/VALIDATED)
    const [activeLists] = await connection.query(`
      SELECT DISTINCT pl.id, pl.original_invoice_id
      FROM picking_lists pl
      JOIN picking_list_items pli ON pl.id = pli.picking_list_id
      WHERE pl.status IN ('PENDING', 'VALIDATED')
        AND pl.is_active = 1
        AND (pli.last_recovery_attempt IS NULL OR pli.last_recovery_attempt < NOW() - INTERVAL 1 HOUR)
      ORDER BY pl.order_date ASC
      LIMIT 50
    `);

    if (activeLists.length === 0) {
      return;
    }

    Logger.info(
      `Mengevaluasi ${activeLists.length} pesanan aktif untuk pemulihan dan auto-fulfillment...`,
      "AUTO_WORKER",
    );
    const SYSTEM_USER_ID = 1; // Asumsi ID 1 adalah Admin/System

    let successCount = 0;
    const delay = (ms) => new Promise((res) => setTimeout(res, ms));

    for (const list of activeLists) {
      try {
        // TAHAP A: SINKRONISASI ALOKASI STOK
        await retryBackordersBatchService([list.id]);

        // TAHAP B: EVALUASI ANTI-PARSIAL
        const [unfulfillable] = await connection.query(
          `
          SELECT id FROM picking_list_items
          WHERE picking_list_id = ?
            AND (status = 'BACKORDER' OR (status = 'PENDING' AND suggested_location_id IS NULL))
        `,
          [list.id],
        );

        // TAHAP C: EKSEKUSI (DEDUCT STOCK)
        if (unfulfillable.length === 0) {
          const [items] = await connection.query(
            `
            SELECT id, picking_list_id
            FROM picking_list_items
            WHERE picking_list_id = ? AND status = 'PENDING'
          `,
            [list.id],
          );

          if (items.length > 0) {
            await completePickingItemsService(items, SYSTEM_USER_ID);
            Logger.info(
              `✅ Auto-Fulfillment Berhasil: Invoice ${list.original_invoice_id}`,
              "AUTO_WORKER",
            );
            successCount++;
          }
        } else {
          // CEGAH STARVATION: Tandai waktu percobaan agar pesanan ini tidak memblokir antrean di cron berikutnya
          await connection.query(
            `UPDATE picking_list_items SET last_recovery_attempt = NOW() WHERE picking_list_id = ?`,
            [list.id],
          );
        }
      } catch (innerErr) {
        // Jika gagal karena Race Condition atau error lainnya, beri stempel waktu dan abaikan
        await connection.query(
          `UPDATE picking_list_items SET last_recovery_attempt = NOW() WHERE picking_list_id = ?`,
          [list.id],
        );
        Logger.error(
          `⚠️ Gagal memproses Invoice ${list.original_invoice_id}`,
          innerErr,
          "AUTO_WORKER",
        );
      }

      // Throttling: Beri jeda agar CPU Shared Hosting aman
      await delay(100);
    }

    if (successCount > 0) {
      Logger.info(
        `Auto-Worker Selesai: Berhasil memenuhi ${successCount} pesanan secara otomatis.`,
        "AUTO_WORKER",
      );
    }
  } catch (error) {
    Logger.error("Auto Worker Error", error, "AUTO_WORKER");
  } finally {
    if (connection) connection.release();
  }
};

import { fileURLToPath } from "url";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAutoRecovery()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

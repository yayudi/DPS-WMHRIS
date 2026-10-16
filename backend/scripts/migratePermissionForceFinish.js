import db from "../config/db.js";
import Logger from "../utils/logger.js";

const migrateForceFinishPermission = async () => {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  try {
    Logger.info("Starting Permission Migration for Force Finish Picking...", "MIGRATE_PERMS");

    const permName = "force-finish-picking";
    const permDesc = "Menyelesaikan pesanan picking secara paksa dengan auto-adjustment stok";

    const [existing] = await connection.query("SELECT id FROM permissions WHERE name = ?", [permName]);
    let permId;

    if (existing.length === 0) {
      const [insertResult] = await connection.query(
        "INSERT INTO permissions (name, description) VALUES (?, ?)",
        [permName, permDesc]
      );
      permId = insertResult.insertId;
      Logger.info(`Permission created: ${permName} (ID: ${permId})`, "MIGRATE_PERMS");
    } else {
      permId = existing[0].id;
      Logger.info(`Permission already exists: ${permName} (ID: ${permId})`, "MIGRATE_PERMS");
    }

    // Role IDs to assign: Admin (1), ADMIN ATAS (5)
    const targetRoleIds = [1, 5];

    for (const roleId of targetRoleIds) {
      const [roleCheck] = await connection.query("SELECT id, name FROM roles WHERE id = ?", [roleId]);
      if (roleCheck.length === 0) {
        Logger.warn(`Role ID ${roleId} not found, skipping.`, "MIGRATE_PERMS");
        continue;
      }

      const roleName = roleCheck[0].name;
      const [mappingExists] = await connection.query(
        "SELECT 1 FROM role_permission WHERE role_id = ? AND permission_id = ?",
        [roleId, permId]
      );

      if (mappingExists.length === 0) {
        await connection.query(
          "INSERT INTO role_permission (role_id, permission_id) VALUES (?, ?)",
          [roleId, permId]
        );
        Logger.info(`Assigned '${permName}' to '${roleName}' (Role ID: ${roleId})`, "MIGRATE_PERMS");
      } else {
        Logger.info(`'${permName}' already assigned to '${roleName}' (Role ID: ${roleId})`, "MIGRATE_PERMS");
      }
    }

    await connection.commit();
    Logger.info("Migration completed successfully.", "MIGRATE_PERMS");
  } catch (error) {
    await connection.rollback();
    Logger.error("Migration failed", error, "MIGRATE_PERMS");
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
};

migrateForceFinishPermission();

// backend\middleware\permissionMiddleware.js
import db from "../config/db.js";

// Fungsi ini adalah "middleware factory" (pabrik middleware)
// Ia akan membuat fungsi middleware berdasarkan izin yang kita minta
export function canAccess(permissionName) {
  return async (req, res, next) => {
    const userRoleId = req.user.role_id;

    if (!userRoleId) {
      return res
        .status(403)
        .json({ success: false, message: "Akses ditolak. Role tidak terdefinisi." });
    }

    try {
      // Query untuk mengecek apakah role_id user memiliki permissionName
      const query = `
        SELECT 1
        FROM role_permission rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = ? AND p.name = ?
        LIMIT 1
      `;

      const [rows] = await db.query(query, [userRoleId, permissionName]);

      if (rows.length > 0) {
        next(); // Pengguna punya izin, lanjutkan
      } else {
        res
          .status(403)
          .json({ success: false, message: `Akses ditolak. Memerlukan izin: '${permissionName}'` });
      }
    } catch (error) {
      console.error("Error saat memeriksa izin:", error);
      res.status(500).json({ success: false, message: "Server error saat memeriksa izin." });
    }
  };
}

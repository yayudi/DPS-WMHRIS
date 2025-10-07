// File: backend/middleware/adminMiddleware.js
const isAdmin = (req, res, next) => {
  // Middleware ini harus dijalankan SETELAH authenticateToken,
  // jadi kita sudah punya akses ke req.user
  if (req.user && req.user.role === "admin") {
    next(); // Jika user adalah admin, izinkan lanjut
  } else {
    res.status(403).json({ success: false, message: "Akses ditolak. Hanya untuk admin." });
  }
};

export default isAdmin;

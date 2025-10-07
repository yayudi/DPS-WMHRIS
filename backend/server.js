import express from "express";
import cors from "cors";
import "dotenv/config";

// router
import authRoutes from "./router/auth.js";
import userRoutes from "./router/user.js";
import adminRoutes from "./router/admin.js";
import attendanceRouter from "./router/attendanceRouter.js";

// middleware
import authenticateToken from "./middleware/authMiddleware.js";
import { canAccess } from "./middleware/permissionMiddleware.js";

// Konfigurasi Path ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const corsOptions = {
  origin:
    process.env.NODE_ENV === "production"
      ? "https://office.pusatpneumatic.com"
      : "http://localhost:5173",
};
app.use(cors(corsOptions));
app.use(express.json());

// 3. Static File Server: Sajikan semua file dari folder 'public'.
// URL-nya akan menjadi https://api.pusatpneumatic.com/namafile.json
app.use(express.static(path.join(__dirname, "public")));

// Rute Publik
app.use("/api/auth", authRoutes);

// Rute Terlindungi
app.use("/api/user", authenticateToken, userRoutes);

app.use("/api/admin/users", authenticateToken, canAccess("manage-users"), adminRoutes);
app.use("/attendance", authenticateToken, attendanceRouter);

// --- Rute Catch-All untuk 404 ---
// Jika request tidak cocok dengan rute statis atau API di atas, kirim 404.
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint tidak ditemukan." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server backend berjalan di http://localhost:${PORT}`);
});

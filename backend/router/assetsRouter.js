// backend\router\assetsRouter.js
import express from "express";
import path from "path";
import fs from "fs";
import mime from "mime-types";

const router = express.Router();

// Tentukan path absolut ke folder 'assets'

const assetsPath = path.join(process.cwd(), "assets");

// Buat "catch-all" route untuk menangani semua request file statis

router.get("*", (req, res, next) => {
  // Gabungkan path yang diminta dengan direktori aset kita

  const requestedPath = path.join(assetsPath, req.path);

  // Keamanan: Pastikan path yang diminta tidak mencoba keluar dari folder 'assets'

  if (!requestedPath.startsWith(assetsPath)) {
    return res.status(403).send("Forbidden");
  }

  // Cek apakah file ada

  fs.access(requestedPath, fs.constants.F_OK, (err) => {
    if (err) {
      // Jika file tidak ada, teruskan ke middleware selanjutnya (yaitu, 404 handler di server.js)

      return next();
    }

    // Tentukan Content-Type berdasarkan ekstensi file

    const contentType = mime.lookup(requestedPath) || "application/octet-stream";

    res.setHeader("Content-Type", contentType);

    // Baca file dan kirimkan sebagai respons

    fs.createReadStream(requestedPath).pipe(res);
  });
});

export default router;

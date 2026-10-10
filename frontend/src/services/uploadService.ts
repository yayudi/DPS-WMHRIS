import api from "./api"; // Asumsikan ini adalah Axios instance standar proyek

/**
 * Service untuk menangani proses upload ke Cloudflare R2
 */
export const uploadService = {
  /**
   * Mengunggah file langsung ke R2 menggunakan Presigned URL
   * @param {File|Blob} file - File yang akan diunggah
   * @param {string} folder - Folder tujuan (e.g. 'products', 'profiles')
   * @returns {Promise<{publicUrl: string, key: string}>} - URL publik file yang berhasil diunggah
   */
  uploadToR2: async (file, folder = "uploads") => {
    try {
      // 1. Dapatkan Presigned URL dari Backend
      const { data } = await api.post("/uploads/presigned-url", {
        fileName: file.name || "upload.jpg",
        mimeType: file.type || "application/octet-stream",
        folder: folder,
      });

      if (!data.success || !data.data) {
        throw new Error(data.message || "Gagal mendapatkan presigned URL");
      }

      const { url, key, publicUrl } = data.data;

      // 2. Upload file langsung ke URL R2 menggunakan fetch
      // Gunakan fetch alih-alih axios instance agar tidak mengirim Authorization header (JWT) ke Cloudflare
      const uploadResponse = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Gagal mengunggah file ke Cloudflare R2");
      }

      // 3. Kembalikan URL publik agar bisa disimpan di database oleh fungsi pemanggil
      return { publicUrl, key };
    } catch (error) {
      console.error("[UPLOAD_SERVICE] Error:", error);
      throw error;
    }
  },
};

import apiClient from "@/api/axios.js";

export function useDownload() {
  /**
   * Mengunduh blob (misal untuk data lokal, file hasil generate client-side)
   * @param {Blob} blob - Data Blob
   * @param {string} fileName - Nama file
   */
  const downloadBlob = (blob, fileName) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  /**
   * Mengunduh file dari API
   * @param {string} url - Endpoint URL untuk file
   * @param {string} defaultFileName - Nama file default jika tidak diberikan oleh backend
   */
  const downloadFile = async (url, defaultFileName = "download") => {
    console.log("[useDownload] Memulai proses download untuk URL:", url);

    // Jika URL adalah URL absolut (misal dari CDN/R2), langsung unduh melalui tag anchor.
    // Ini menghindari isu CORS, memori (Blob), dan error sertifikat pada XHR request.
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.setAttribute("download", defaultFileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }

    // Jika URL relatif (internal API), gunakan apiClient untuk menyertakan token auth.
    const response = await apiClient.get(url, { responseType: "blob" });
    downloadBlob(new Blob([response.data]), defaultFileName);
  };

  /**
   * Membuka URL presigned API/eksternal di tab baru
   * @param {string} url - URL API (relatif) atau Absolute (legacy)
   */
  const openDownloadUrl = (url) => {
    if (!url) return;
    const base = import.meta.env.VITE_API_BASE_URL || "";
    const cleanBase = base.replace(/\/api\/?$/, "");
    const fullUrl = url.startsWith("http") ? url : `${cleanBase}${url}`;
    window.open(fullUrl, "_blank");
  };

  return {
    downloadBlob,
    downloadFile,
    openDownloadUrl,
  };
}

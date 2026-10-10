import apiClient from '@/core/infrastructure/http.client';

export function useUpload() {
  /**
   * Mengunggah file tunggal
   * @param {string} url - Endpoint URL untuk upload
   * @param {File|Blob} file - File yang akan diunggah
   * @param {string} [fieldName="file"] - Nama field di FormData (default: "file")
   * @param {object} [additionalData={}] - Data tambahan (key-value) yang ingin dikirim
   * @param {string} [method="post"] - HTTP Method (post, put, patch)
   * @returns {Promise<any>}
   */
  const uploadFile = async (url, file, fieldName = "file", additionalData = {}, method = "post") => {
    const formData = new FormData();
    formData.append(fieldName, file);

    // Append data tambahan
    for (const key in additionalData) {
      if (Object.prototype.hasOwnProperty.call(additionalData, key)) {
        formData.append(key, additionalData[key]);
      }
    }

    const response = await apiClient[method.toLowerCase()](url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return response;
  };

  /**
   * Mengunggah beberapa file
   * @param {string} url - Endpoint URL
   * @param {File[]|Blob[]} files - Array of files
   * @param {string} [fieldName="files"] - Nama field (default: "files")
   * @param {object} [additionalData={}] - Data tambahan
   * @param {string} [method="post"] - HTTP Method (post, put, patch)
   * @returns {Promise<any>}
   */
  const uploadFiles = async (url, files, fieldName = "files", additionalData = {}, method = "post") => {
    const formData = new FormData();
    files.forEach((f) => formData.append(fieldName, f));

    for (const key in additionalData) {
      if (Object.prototype.hasOwnProperty.call(additionalData, key)) {
        formData.append(key, additionalData[key]);
      }
    }

    const response = await apiClient[method.toLowerCase()](url, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return response;
  };

  return {
    uploadFile,
    uploadFiles,
  };
}

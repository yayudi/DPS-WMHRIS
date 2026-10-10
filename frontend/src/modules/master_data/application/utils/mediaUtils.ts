/**
 * Utility functions for Media handling
 */

/**
 * Checks if a title is generic (e.g. 'image', 'photo', 'whatsapp').
 * @param {string} title 
 * @returns {boolean}
 */
export const isGenericTitle = (title) => {
  if (!title || !title.trim()) return true;
  const lower = title.trim().toLowerCase();
  
  // Jika hanya berupa angka (misal: "1", "1234", "01"), dianggap generik
  if (/^\d+$/.test(lower)) return true;

  const genericKeywords = [
    'image', 'images', 'gambar', 'img', 'photo', 'pic', 'untitled',
    'whatsapp', 'telegram', 'screenshot', 'capture', 'dcim', 'picture', 'snip', 'blob'
  ];
  return genericKeywords.some((kw) => lower.includes(kw));
};

/**
 * Strips the extension from a filename.
 * @param {string} filename 
 * @returns {string}
 */
export const stripExtension = (filename) => {
  if (!filename) return '';
  return filename.replace(/\.[^/.]+$/, '');
};

/**
 * Checks if a file object is a valid image type.
 * @param {File} file 
 * @returns {boolean}
 */
export const isValidImageType = (file) => {
  if (!file || !file.type) return false;
  return file.type.startsWith('image/');
};

/**
 * Creates an object URL for image preview.
 * @param {File} file 
 * @returns {string}
 */
export const createImagePreview = (file) => {
  if (!file) return '';
  return URL.createObjectURL(file);
};

/**
 * Revokes an object URL to prevent memory leaks.
 * @param {string} url 
 */
export const revokeImagePreview = (url) => {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};

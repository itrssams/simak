import imageCompression from 'browser-image-compression';

/**
 * Compress image file ke ukuran yang lebih kecil
 * @param {File} file - Image file yang akan dikompres
 * @param {Object} options - Compression options
 * @returns {Promise<File>} Compressed file
 */
export async function compressImage(file, options = {}) {
  const defaultOptions = {
    maxSizeMB: options.maxSizeMB || 0.5, // Default 500KB per image
    maxWidthOrHeight: options.maxWidthOrHeight || 1920, // Max resolution
    useWebWorker: true,
    fileType: options.fileType || 'image/jpeg',
    quality: options.quality || 0.75, // 0-1, lower = more compression
  };

  try {
    const compressedBlob = await imageCompression(file, defaultOptions);
    
    // Get file extension from original file or MIME type
    let fileName = file.name;
    if (!fileName || fileName.lastIndexOf('.') === -1) {
      // If no extension in original name, add one based on fileType
      const ext = getMimeExtension(defaultOptions.fileType);
      fileName = `image_${Date.now()}${ext}`;
    } else {
      // Keep original filename but update extension to match fileType
      const ext = getMimeExtension(defaultOptions.fileType);
      fileName = fileName.substring(0, fileName.lastIndexOf('.')) + ext;
    }
    
    // Convert Blob to File with proper name
    const compressedFile = new File([compressedBlob], fileName, {
      type: defaultOptions.fileType,
      lastModified: new Date().getTime(),
    });
    
    return compressedFile;
  } catch (error) {
    console.error('Image compression error:', error);
    throw error;
  }
}

/**
 * Get file extension from MIME type
 */
function getMimeExtension(mimeType) {
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
  };
  return mimeMap[mimeType] || '.jpg';
}

/**
 * Compress multiple image files
 * @param {File[]} files - Array of image files
 * @param {Object} options - Compression options
 * @returns {Promise<File[]>} Array of compressed files
 */
export async function compressImages(files, options = {}) {
  try {
    const compressedFiles = await Promise.all(
      files.map(file => compressImage(file, options))
    );
    return compressedFiles;
  } catch (error) {
    console.error('Multiple image compression error:', error);
    throw error;
  }
}

/**
 * Get file size dalam format readable
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Validate image file
 * @param {File} file - Image file
 * @returns {Object} {isValid: boolean, error?: string}
 */
export function validateImageFile(file) {
  const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const maxSize = 10 * 1024 * 1024; // 10MB before compression

  if (!file) {
    return { isValid: false, error: 'File tidak ditemukan' };
  }

  if (!validTypes.includes(file.type)) {
    return { isValid: false, error: 'Format file harus JPEG, PNG, atau WebP' };
  }

  if (file.size > maxSize) {
    return { isValid: false, error: `File terlalu besar (max ${formatFileSize(maxSize)})` };
  }

  return { isValid: true };
}

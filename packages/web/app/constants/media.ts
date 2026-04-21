export const MEDIA_SUPPORTED_TYPES = ['JPG', 'PNG', 'JPEG', 'GIF', 'PDF']; // 'MP4'

// Instagram only supports images and videos (no PDFs)
export const INSTAGRAM_MEDIA_SUPPORTED_TYPES = ['JPG', 'PNG', 'JPEG', 'GIF']; // 'MP4'

export const BUSINESS_MEDIA_GROUP_NAME = 'businessMedia';
export const BUSINESS_MESSAGES_GROUP_NAME = 'businessMessageMedia';

/** Image file extensions used for detecting image file types in media uploads */
export const IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] as const;

export const COMPRESSION_OPTIONS = {
  maxSizeMB: 0.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
};

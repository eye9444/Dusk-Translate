export const IMAGE_ALLOWANCE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 20_000_000;
export const MAX_IMAGE_DIMENSION = 8192;

// The server must supply immutable original-asset size, never replacement size.
export function replacementByteLimit(originalBytes, storageLimit = 50 * 1024 * 1024) {
  if (!Number.isSafeInteger(originalBytes) || originalBytes <= 0 || !Number.isSafeInteger(storageLimit) || storageLimit <= 0) throw new Error('Invalid image size metadata.');
  return Math.min(originalBytes + IMAGE_ALLOWANCE_BYTES, storageLimit);
}

// This is a UX check, not a substitute for server decoding and re-encoding.
export function validateReplacementMetadata({ originalBytes, bytes, width, height, mime, animated = false }, storageLimit) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime) || animated) throw new Error('Choose a static PNG, JPEG, or WebP image.');
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > replacementByteLimit(originalBytes, storageLimit)) throw new Error('Replacement exceeds the original image size plus 10 MB or the storage limit.');
  if (![width, height].every(value => Number.isSafeInteger(value) && value > 0 && value <= MAX_IMAGE_DIMENSION) || width * height > MAX_IMAGE_PIXELS) throw new Error('Image dimensions exceed the decoding limit.');
}

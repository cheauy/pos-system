// Only for public photos uploaded under NEW, unique filenames (never upsert).
// Replacing a photo changes its URL, so browser/CDN caches cannot hide the update.
export const PUBLIC_PHOTO_CACHE_SECONDS = '31536000';

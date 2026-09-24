import 'server-only';

// Product photos only. Keep payment QR codes, receipt artwork and proof files exact.
export async function compressPhoto(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error('Choose a JPG, PNG or WebP photo up to 5 MB.');
  }
  const sharp = (await import('sharp')).default;
  const bytes = Buffer.from(await file.arrayBuffer());
  const image = sharp(bytes, { limitInputPixels: 40_000_000 });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '')) throw new Error('Unsupported photo format.');
  if ((metadata.pages ?? 1) > 1) return file;
  const compressed = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82, effort: 4 }).toBuffer();
  if (compressed.length >= bytes.length && (metadata.width ?? 0) <= 1600 && (metadata.height ?? 0) <= 1600) return file;
  return new File([new Uint8Array(compressed)], `${file.name.replace(/\.[^.]+$/, '')}.webp`, { type: 'image/webp' });
}

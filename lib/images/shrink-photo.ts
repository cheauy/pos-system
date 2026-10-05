// Browser-side product photo shrink (max 1600 px WebP) so several photos fit one
// Server Action request. Returns the original when shrinking would not help.
export async function shrinkPhoto(original: File): Promise<File> {
  const bitmap = await createImageBitmap(original);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) { bitmap.close(); throw new Error("Unable to prepare this photo."); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 0.82));
  return blob && (blob.size < original.size || scale < 1) ? new File([blob], original.name.replace(/\.[^.]+$/, ".webp"), { type: blob.type }) : original;
}

// Stay below next.config serverActions.bodySizeLimit (16 MB) including multipart overhead.
export const MAX_SAVE_UPLOAD_BYTES = 15 * 1024 * 1024;
export const uploadBytes = (form: FormData) => [...form.values()].reduce((size, value) => size + (value instanceof File ? value.size : 0), 0);

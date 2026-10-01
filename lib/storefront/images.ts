import { compressPhoto } from "@/lib/images/compress-photo";
import { PUBLIC_PHOTO_CACHE_SECONDS } from "@/lib/public-photo-cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

const STOREFRONT_MEDIA_BUCKET = "storefront-media";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function getImageFile(
  formData: FormData,
  key: string,
) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (!ALLOWED_IMAGE_TYPES.has(value.type)) {
    throw new Error(
      "Store images must be JPG, PNG or WebP.",
    );
  }

  if (value.size > MAX_IMAGE_BYTES) {
    throw new Error(
      "Store images must not exceed 5 MB.",
    );
  }

  return value;
}

function getExtension(file: File) {
  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return "bin";
  }
}

export async function uploadStorefrontImage({
  businessId,
  kind,
  file,
}: {
  businessId: string;
  kind: "logo" | "banner" | "khqr";
  file: File;
}) {
  if (kind === 'banner') file = await compressPhoto(file);
  const path = `${businessId}/${kind}/${crypto.randomUUID()}.${getExtension(
    file,
  )}`;

  const { error } = await supabaseAdmin.storage
    .from(STOREFRONT_MEDIA_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: PUBLIC_PHOTO_CACHE_SECONDS,
      upsert: false,
    });

  if (error) {
    throw new Error(
      `Unable to upload ${kind}: ${error.message}`,
    );
  }

  const { data } = supabaseAdmin.storage
    .from(STOREFRONT_MEDIA_BUCKET)
    .getPublicUrl(path);

  return data.publicUrl;
}


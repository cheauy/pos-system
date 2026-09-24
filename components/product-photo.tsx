import Image from 'next/image';
import type { ImgHTMLAttributes } from 'react';

// Optimize only our public storage images. Upload previews, private URLs and
// external photos retain their original loading/authentication behavior.
export default function ProductPhoto({ src, alt = '', width = 320, height = 320, sizes = '160px', ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string; sizes?: string }) {
  let optimized = false;
  try {
    const url = new URL(src);
    optimized = url.origin === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin
      && !url.search && url.pathname.startsWith('/storage/v1/object/public/product-images/');
  } catch { /* Local URLs and upload previews use a regular image. */ }
  return optimized
    ? <Image {...props} src={src} alt={alt} width={Number(width)} height={Number(height)} sizes={sizes} />
    // eslint-disable-next-line @next/next/no-img-element
    : <img {...props} src={src} alt={alt} width={width} height={height} loading={props.loading ?? 'lazy'} decoding="async" />;
}

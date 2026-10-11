import ContentSkeleton from '@/components/ui/content-skeleton';

export default function RegisterLoading() {
  return <div className="mx-auto w-full max-w-lg p-6"><ContentSkeleton kind="form" /></div>;
}

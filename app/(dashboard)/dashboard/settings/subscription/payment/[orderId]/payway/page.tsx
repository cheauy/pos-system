import { redirect } from 'next/navigation';

// Old bookmarks open the payment selector; a GET must not create a transaction.
export default async function SubscriptionPaywayStartPage({params}:{params:Promise<{orderId:string}>}) {
  const {orderId}=await params;
  redirect(`/dashboard/settings/subscription/payment/${encodeURIComponent(orderId)}?method=payway`);
}

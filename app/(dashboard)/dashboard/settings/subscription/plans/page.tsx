import SubscriptionPlanPickerPage from "../subscription-plan-picker-page";

export default function SubscriptionPlansPage({ searchParams }: {
  searchParams?: Promise<{ onboarding?: string; trial?: string; expired?: string }>;
}) {
  return <SubscriptionPlanPickerPage searchParams={searchParams} />;
}

export const SUBSCRIPTION_PLAN_KEYS = [
  "solo",
  "small_team",
  "growth",
  "custom",
] as const;

export type SubscriptionPlanKey = (typeof SUBSCRIPTION_PLAN_KEYS)[number];
export type SubscriptionTermMonths = 1 | 3 | 6 | 12;

export type SubscriptionPlan = {
  key: SubscriptionPlanKey;
  name: string;
  description: string;
  monthlyPrice: number | null;
  userLimit: number | null;
  branchLimit: number;
  teamEnabled: boolean;
  freeUrlChangesPerMonth: number;
  freeBusinessModeChangesPerMonth: number;
  badge?: string;
};

export const subscriptionPlans: Record<SubscriptionPlanKey, SubscriptionPlan> = {
  solo: {
    key: "solo",
    name: "Solo",
    description: "For an owner running a small business alone.",
    monthlyPrice: 10,
    userLimit: 1,
    branchLimit: 1,
    teamEnabled: false,
    freeUrlChangesPerMonth: 0,
    freeBusinessModeChangesPerMonth: 0,
  },
  small_team: {
    key: "small_team",
    name: "Small Team",
    description: "For a small team that needs shared POS access.",
    monthlyPrice: 18,
    userLimit: 5,
    branchLimit: 1,
    teamEnabled: true,
    freeUrlChangesPerMonth: 0,
    freeBusinessModeChangesPerMonth: 0,
    badge: "Team",
  },
  growth: {
    key: "growth",
    name: "Growth Team",
    description: "For a growing team that changes and expands frequently.",
    monthlyPrice: 38,
    userLimit: 10,
    branchLimit: 1,
    teamEnabled: true,
    freeUrlChangesPerMonth: 2,
    freeBusinessModeChangesPerMonth: 2,
    badge: "Best value",
  },
  custom: {
    key: "custom",
    name: "Custom Plan",
    description: "Choose exactly how many users and branches you need.",
    monthlyPrice: null,
    userLimit: null,
    branchLimit: 1,
    teamEnabled: true,
    freeUrlChangesPerMonth: 2,
    freeBusinessModeChangesPerMonth: 2,
    badge: "Flexible",
  },
};

export const subscriptionTerms: Array<{
  months: SubscriptionTermMonths;
  label: string;
  discountPercent: number;
}> = [
  { months: 1, label: "1 month", discountPercent: 0 },
  { months: 3, label: "3 months", discountPercent: 5 },
  { months: 6, label: "6 months", discountPercent: 8 },
  { months: 12, label: "1 year", discountPercent: 10 },
];

export function isSubscriptionPlanKey(value: string): value is SubscriptionPlanKey {
  return SUBSCRIPTION_PLAN_KEYS.includes(value as SubscriptionPlanKey);
}

export function isSubscriptionTermMonths(value: number): value is SubscriptionTermMonths {
  return value === 1 || value === 3 || value === 6 || value === 12;
}

export function getTermDiscount(months: SubscriptionTermMonths) {
  return subscriptionTerms.find((term) => term.months === months)?.discountPercent ?? 0;
}

export function calculateSubscriptionPrice(
  planKey: Exclude<SubscriptionPlanKey, "custom">,
  months: SubscriptionTermMonths,
) {
  const plan = subscriptionPlans[planKey];
  const monthlyPrice = plan.monthlyPrice ?? 0;
  const subtotal = monthlyPrice * months;
  const discountPercent = getTermDiscount(months);
  const discountAmount = Number((subtotal * (discountPercent / 100)).toFixed(2));
  const total = Number((subtotal - discountAmount).toFixed(2));

  return {
    monthlyPrice,
    subtotal,
    discountPercent,
    discountAmount,
    total,
  };
}

export function getSubscriptionPlanLabel(planKey: string | null | undefined) {
  if (!planKey) return "Legacy plan";
  if (planKey === "trial") return "7-day free trial";
  if (planKey === "legacy") return "Legacy plan";
  return isSubscriptionPlanKey(planKey)
    ? subscriptionPlans[planKey].name
    : "Subscription";
}

export const CUSTOM_USER_MONTHLY_PRICE = 5;
export const CUSTOM_BRANCH_MONTHLY_PRICE = 20;

export function calculateCustomSubscriptionPrice(users: number, branches: number, months: SubscriptionTermMonths) {
  if (!Number.isInteger(users) || users < 1 || users > 500 || !Number.isInteger(branches) || branches < 1 || branches > 100 || !isSubscriptionTermMonths(months)) {
    throw new Error("Choose a valid user count, branch count and billing term.");
  }
  const monthlyPrice = users * CUSTOM_USER_MONTHLY_PRICE + branches * CUSTOM_BRANCH_MONTHLY_PRICE;
  const subtotal = monthlyPrice * months;
  const discountPercent = getTermDiscount(months);
  const discountAmount = Number((subtotal * discountPercent / 100).toFixed(2));
  return { monthlyPrice, subtotal, discountPercent, discountAmount, total: Number((subtotal - discountAmount).toFixed(2)) };
}

import { calculateCustomSubscriptionPrice, isSubscriptionPlanKey, isSubscriptionTermMonths, subscriptionPlans } from './plans';

export function subscriptionSelection(form: FormData) {
  const plan = form.get('plan');
  const termValue = form.get('termMonths');
  if (typeof plan !== 'string' || !isSubscriptionPlanKey(plan)) throw new Error('Choose a valid subscription plan.');
  if (typeof termValue !== 'string' || !/^(0|1|3|6|12)$/.test(termValue)) throw new Error('Choose a valid subscription term.');
  const term = Number(termValue);
  if (term !== 0 && !isSubscriptionTermMonths(term)) throw new Error('Choose a valid subscription term.');
  function count(key: string) {
    const raw = form.get(key);
    if (typeof raw !== 'string' || !/^\d+$/.test(raw)) throw new Error('Choose whole-number user and branch counts.');
    return Number(raw);
  }
  const users = plan === 'custom' ? count('userLimit') : subscriptionPlans[plan].userLimit!;
  const branches = plan === 'custom' ? count('branchLimit') : 1;
  if (plan === 'custom') calculateCustomSubscriptionPrice(users, branches, term === 0 ? 1 : term);
  return { plan, term, users, branches };
}
export function subscriptionFailure(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  const message = e?.message ?? '';
  if (/subscription_orders_term_check/.test(message)) {
    return 'Upgrade duration setup is out of date. Apply 20260923133000_upgrade_duration_payment_selector.sql, then retry. Your existing subscription is unchanged.';
  }
  if (['PGRST202','42883','42703','42P01'].includes(e?.code ?? '') || /subscription_orders_user_limit_check|businesses_subscription_user_limit_check/.test(message)) {
    return 'Subscription upgrade is not ready. Apply the latest TENH POS subscription migrations, then reopen Plans. Your existing subscription is unchanged.';
  }
  return message || 'Unable to prepare the subscription. Check Subscription for an existing payment before retrying.';
}
export type SubscriptionSelectionState = { error: string | null };

import { soldVariant } from '@/lib/analytics/product-variants';
import { staffKpis, staffReportDates, type StaffSale } from '@/lib/analytics/staff-report';
import type { SupabaseClient } from '@supabase/supabase-js';

type Sale = StaffSale & { payment_method: string | null; order_items: (StaffSale['order_items'][number] & {
  product_id: string | null; product_name: string; variant_label: string | null;
  cost_price: number; products: { size: string | null; color: string | null } | null;
})[] };
type Expense = { id: string; amount: number };

export function summarizeMobileReports(orders: Sale[], expenses: Expense[]) {
  const completed = orders.filter(order => order.status === 'completed');
  let revenue = 0, cost = 0;
  const products = new Map<string, { name: string; quantity: number }>();
  const payments = new Map<string, number>();
  const days = new Map<string, number>();
  const dailyCosts = new Map<string,number>(), sources = new Map<string,number>();
  for (const order of completed) {
    const amount = Math.round(Number(order.total) * 100);
    revenue += amount;
    const method = order.payment_method || 'Unknown';
    payments.set(method, (payments.get(method) || 0) + amount);
    const date = new Date(Date.parse(order.created_at) + 7 * 3600000).toISOString().slice(0, 10);
    days.set(date, (days.get(date) || 0) + amount);
    const source=order.order_source||'pos';sources.set(source,(sources.get(source)||0)+amount);
    for (const item of order.order_items || []) {
      cost += Math.round(Number(item.cost_price) * Number(item.quantity) * 100);
      dailyCosts.set(date,(dailyCosts.get(date)||0)+Math.round(Number(item.cost_price)*Number(item.quantity)*100));
      const variant = soldVariant(item);
      const current = products.get(variant.key) || { name: variant.label, quantity: 0 };
      current.quantity += Number(item.quantity);
      products.set(variant.key, current);
    }
  }
  const spending = expenses.reduce((sum, item) => sum + Math.round(Number(item.amount) * 100), 0);
  return {
    orders: completed.length, revenue: revenue / 100, cost: cost / 100,
    expenses: spending / 100, grossProfit: (revenue - cost) / 100, netProfit: (revenue - cost - spending) / 100,
    products: [...products.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    payments: [...payments].map(([name, value]) => ({ name, value: value / 100 })),
    days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value: value / 100,profit:(value-(dailyCosts.get(date)||0))/100 })),
    sources: [...sources].map(([name,value])=>({name,value:value/100})),
    staff: staffKpis(orders).ranked.map(row => ({ ...row, sales: row.sales / 100, refunds: row.refunds / 100, discount: row.discount / 100 })),
  };
}

export async function loadMobileReports(db: SupabaseClient, businessId: string, branchId: string, range: string) {
  if (!['yesterday', 'today', '7days', '30days', '365days'].includes(range)) throw new Error('Choose a supported report period.');
  const dates = staffReportDates(range);
  const orders: Sale[] = [], expenses: Expense[] = [];
  // Bound response work; request a shorter period rather than return partial totals.
  for (let start = 0; ; start += 500) {
    if (start >= 20000) throw new Error('Too many orders. Choose a shorter period.');
    const result = await db.from('orders').select('id,order_number,staff_user_id,staff_name,order_source,status,total,discount,created_at,payment_method,order_items(product_id,product_name,quantity,cost_price,variant_label,products(size,color)),returns(refund_amount,status,return_items(quantity))')
      .eq('business_id', businessId).eq('location_id', branchId).gte('created_at', dates.start).lte('created_at', dates.end)
      .order('id').range(start, start + 499);
    if (result.error) throw new Error('Unable to load report orders.');
    const rows = result.data || [];
    orders.push(...rows as unknown as Sale[]);
    if (rows.length < 500) break;
  }
  for (let start = 0; ; start += 500) {
    if (start >= 20000) throw new Error('Too many expenses. Choose a shorter period.');
    const result = await db.from('expenses').select('id,amount').eq('business_id', businessId).eq('location_id', branchId)
      .gte('expense_date', dates.from).lte('expense_date', dates.to).order('id').range(start, start + 499);
    if (result.error) throw new Error('Unable to load report expenses.');
    const rows = result.data || [];
    expenses.push(...rows);
    if (rows.length < 500) break;
  }
  const store = await db.from('branch_pos_settings').select('currency').eq('business_id', businessId).eq('location_id', branchId).single();
  if (store.error) throw new Error('Unable to load report currency.');
  return { ...summarizeMobileReports(orders, expenses), currency: store.data?.currency || 'USD', from: dates.from, to: dates.to };
}

// Page title and parent route for the compact phone/tablet workspace header.
const TITLES: Array<[string, string]> = [
  ['/dashboard/pos', 'POS'], ['/dashboard/orders', 'Orders'], ['/dashboard/online-orders', 'Orders'],
  ['/dashboard/promotions', 'Promotions'], ['/dashboard/returns', 'Returns'], ['/dashboard/customers', 'Customers'],
  ['/dashboard/customer-credit', 'Customer Credit'], ['/dashboard/products', 'Products & Stock'], ['/dashboard/inventory', 'Products & Stock'],
  ['/dashboard/bundles', 'Bundle Items'], ['/dashboard/stock-transfers', 'Stock Transfers'], ['/dashboard/categories', 'Categories'],
  ['/dashboard/barcodes', 'Barcode & Labels'], ['/dashboard/low-stock', 'Low Stock'], ['/dashboard/suppliers', 'Suppliers'],
  ['/dashboard/purchase-orders', 'Purchase Orders'], ['/dashboard/purchases', 'Purchases'], ['/dashboard/reports', 'Reports'],
  ['/dashboard/staff-report', 'Staff Report'], ['/dashboard/expenses', 'Expenses'], ['/dashboard/register', 'Cash Register'],
  ['/dashboard/shipping-labels', 'Shipping Labels'], ['/dashboard/marketing', 'Marketing'], ['/dashboard/locations', 'Branches'],
  ['/dashboard/exports', 'Backup & Export'], ['/dashboard/audit-logs', 'Audit Logs'], ['/dashboard/notifications', 'Notifications'],
  ['/dashboard/search', 'Global Search'], ['/dashboard/users', 'Users'], ['/dashboard/businesses', 'Businesses'],
  ['/dashboard/settings/subscription', 'Subscription & Plan'], ['/dashboard/settings/users', 'User & Manage User'],
  ['/dashboard/settings/printers', 'Printer'], ['/dashboard/settings/receipts', 'Printer'], ['/dashboard/settings/profile', 'Profile'],
  ['/dashboard/settings/business', 'Business Information'], ['/dashboard/settings/online-store', 'Online Store'],
  ['/dashboard/settings/pos-currency', 'POS Currency'], ['/dashboard/settings/notifications', 'Notification Settings'],
  ['/dashboard/settings/security', 'Security'], ['/dashboard/settings/support', 'Support'], ['/dashboard/settings', 'Settings'],
  ['/dashboard', 'Dashboard'],
];

export function workspacePage(pathname: string): { title: string; back: string | null } {
  const match = TITLES.find(([href]) => pathname === href || pathname.startsWith(`${href}/`));
  const base = match?.[0] ?? '/dashboard';
  const rest = pathname.slice(base.length).split('/').filter(Boolean);
  // Detail/edit/new pages go back to their list; list pages need no back link.
  const back = rest.length && base !== '/dashboard' ? base : null;
  return { title: match?.[1] ?? 'Dashboard', back };
}
